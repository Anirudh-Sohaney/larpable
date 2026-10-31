/**
 * LARPABLE — JSON File Store (Async)
 * 
 * Reads/writes JSON files with optional auto-encryption.
 * Uses fs.promises for non-blocking I/O.
 * Write queue per file prevents concurrent writes.
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { decryptObject } = require('./crypto');
// Capture source transitions, including removals by staff and account cleanup.
// The score ledger is excluded, so recording awards cannot recurse.
const tracksScore = filename => require('./larpscore').SOURCES.includes(filename);
async function scoreChange(filename,before,after) {
  if(before!==null)await require('./larpscore').capture(filename,before,after);
}

// Data storage path.
// - If DATA_DIR env var is set (production), use that.
// - Otherwise, check for /data/ first, then /larpable_data/ (both parallel to /app/)
function resolveDataDir() {
  if (process.env.DATA_DIR && fs.existsSync(process.env.DATA_DIR)) {
    return process.env.DATA_DIR;
  }
  const parentDir = path.resolve(__dirname, '..', '..');
  const larpableDataDir = path.join(parentDir, 'larpable_data');
  if (fs.existsSync(larpableDataDir)) return larpableDataDir;
  const dataDir = path.join(parentDir, 'data');
  if (fs.existsSync(dataDir)) return dataDir;
  return process.env.DATA_DIR || dataDir; // default
}
const DATA_DIR = resolveDataDir();

// ── Async Write Queue ────────────────────────────────────────
// Per-file promise chain: writes to the same file are serialized
// without busy-waiting or blocking the event loop.
const writeQueues = new Map();

/**
 * Get or create a serial promise chain for a file.
 * Each write waits for the previous one to finish.
 */
function getWriteQueue(filePath) {
  if (!writeQueues.has(filePath)) {
    writeQueues.set(filePath, Promise.resolve());
  }
  return writeQueues.get(filePath);
}

/**
 * Enqueue an async write operation for a file.
 * Returns a promise that resolves when the write completes.
 */
function enqueueWrite(filePath, asyncFn) {
  const queue = getWriteQueue(filePath);
  const operation = queue.then(asyncFn);
  const nextQueue = operation.catch(err => {
    if (!err.expectedStoreConflict) console.error(`Write queue error for ${filePath}:`, err);
  });
  // Keep the queue usable after a failed write, but return the original
  // rejection so callers never report success when persistence failed.
  writeQueues.set(filePath, nextQueue);
  return operation;
}

// ── Core Async I/O ───────────────────────────────────────────

/**
 * Ensure data directory exists (async)
 */
async function ensureDataDir() {
  try {
    await fsp.access(DATA_DIR);
  } catch {
    await fsp.mkdir(DATA_DIR, { recursive: true });
  }
}

/**
 * Get full path to a data file
 * @param {string} name - filename (e.g. "users.json")
 * @returns {string}
 */
function filePath(name) {
  return path.join(DATA_DIR, name);
}

/**
 * Read a JSON file, return parsed data (async, non-blocking)
 * @param {string} filename - e.g. "users.json"
 * @returns {Promise<Object>} parsed JSON or empty object
 */
// Cache encrypted snapshots only. Callers receive copies; stat detects external replacements.
const snapshots=new Map();
async function readSnapshot(filename,retries=2){
  const fp=filePath(filename);
  for(let attempt=0;attempt<=retries;attempt++)try{
    const stat=await fsp.stat(fp,{bigint:true});
    const signature=`${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
    const cached=snapshots.get(fp);
    if(cached?.signature===signature)return cached.data;
    const text=await fsp.readFile(fp,'utf8'),data=JSON.parse(text);
    if(Buffer.byteLength(text)<=2*1024*1024){
      snapshots.set(fp,{signature,data});
      if(snapshots.size>32)snapshots.delete(snapshots.keys().next().value);
    }else snapshots.delete(fp);
    return data;
  }catch(error){
    snapshots.delete(fp);
    if(error.code==='ENOENT')return {};
    if(attempt<retries && error instanceof SyntaxError){await new Promise(r=>setTimeout(r,10));continue;}
    throw error;
  }
}
async function read(filename,retries=2){return structuredClone(await readSnapshot(filename,retries));}
async function persist(filename,before,after){
  if(require('node:util').isDeepStrictEqual(before,after)){
    try{await fsp.access(filePath(filename));return;}catch(error){if(error.code!=='ENOENT')throw error;}
  }
  await ensureDataDir();
  const fp=filePath(filename),tmp=fp+'.tmp.'+process.pid;
  await fsp.writeFile(tmp,JSON.stringify(after,null,2),'utf8');
  await fsp.rename(tmp,fp);
  snapshots.delete(fp);
  await scoreChange(filename,tracksScore(filename) ? before : null,after);
}

/**
 * Write data to a JSON file using atomic write (safe under concurrency).
 * Writes to a temp file first, then renames — readers never see partial data.
 * @param {string} filename
 * @param {Object} data
 * @returns {Promise<void>}
 */
async function write(filename,data){
  await enqueueWrite(filePath(filename),async()=>persist(filename,await readSnapshot(filename),data));
}

// ── Collection Operations ────────────────────────────────────

/**
 * Get a record by ID from a collection file (async)
 * @param {string} filename
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
async function getById(filename, id) {
  const data = await readSnapshot(filename);
  return Object.hasOwn(data,id) ? structuredClone(data[id]) : null;
}

/**
 * Get all records from a collection file (async)
 * @param {string} filename
 * @returns {Promise<Object>}
 */
async function getAll(filename) {
  return await read(filename);
}

/**
 * Save a record (create or update) (async)
 * @param {string} filename
 * @param {string} id
 * @param {Object} record
 */
async function save(filename,id,record){
  await atomicUpdate(filename,data=>{data[id]=record;return data;});
}

/**
 * Delete a record (async)
 * @param {string} filename
 * @param {string} id
 * @returns {Promise<boolean>}
 */
async function remove(filename,id){
  let deleted=false;
  await atomicUpdate(filename,data=>{deleted=Object.hasOwn(data,id);delete data[id];return data;});
  return deleted;
}

/**
 * Find records by a field value (async)
 * @param {string} filename
 * @param {string} field - dot-separated field path
 * @param {*} value
 * @returns {Promise<Array<{ id: string, record: Object }>>}
 */
async function findBy(filename, field, value) {
  const data = await readSnapshot(filename);
  const results = [];

  for (const [id, record] of Object.entries(data)) {
    const fieldValue = field.split('.').reduce((obj, key) => obj?.[key], record);
    if (fieldValue === value) {
      results.push({ id, record:structuredClone(record) });
    }
  }

  return results;
}

// ── High-Level Operations ────────────────────────────────────

/**
 * Save a full encrypted user record (async)
 */
async function saveUser(userId, userData) {
  await save('users.json', userId, userData);
}

/**
 * Get and decrypt a user record (async)
 * @returns {Promise<Object|null>} decrypted user
 */
async function getUser(userId) {
  const user = await getById('users.json', userId);
  if (!user) return null;
  return decryptObject(user);
}

/**
 * Get raw (encrypted) user record — for PATCH operations
 * @returns {Promise<Object|null>} raw encrypted user
 */
async function getRawUser(userId) {
  return await getById('users.json', userId);
}

/**
 * Find user by username hash (async)
 * @returns {Promise<{ id: string, record: Object }|null>}
 */
async function findUserByUsernameHash(usernameHash) {
  const results = await findBy('users.json', 'username_hash', usernameHash);
  return results.length > 0 ? results[0] : null;
}

/**
 * Save an encrypted opportunity record (async)
 */
async function saveOpportunity(oppId, oppData) {
  await save('opportunities.json', oppId, oppData);
}

/**
 * Get and decrypt an opportunity record (async)
 * @returns {Promise<Object|null>}
 */
async function getOpportunity(oppId) {
  const opp = await getById('opportunities.json', oppId);
  if (!opp) return null;
  const decrypted = decryptObject(opp);
  decrypted.id = oppId;
  return (await require('./projects').attach([decrypted]))[0];
}

/**
 * Get all opportunities, decrypted (async)
 * @param {string} type - optional filter by type
 * @returns {Promise<Array<Object>>}
 */
async function getAllOpportunities(type,{createdBy,projectId,approvedOnly=false}={}) {
  const data = await readSnapshot('opportunities.json');
  let opps = Object.entries(data).filter(([,opp])=>(!createdBy || opp.created_by===createdBy) && (!projectId || opp.project_id===projectId) && (!approvedOnly || !opp.flagged)).map(([id, opp]) => {
    const decrypted = decryptObject(opp);
    decrypted.id = id;
    return decrypted;
  });

  opps = await require('./projects').attach(opps);
  if (type) {
    opps = opps.filter(o => o.type === type);
  }

  return opps;
}

/**
 * Delete an opportunity (async)
 * @returns {Promise<boolean>}
 */
async function deleteOpportunity(oppId) {
  return await remove('opportunities.json', oppId);
}

/**
 * Atomic read-modify-write on a file.
 * The entire operation is serialized inside the write queue.
 * This prevents race conditions where two concurrent operations
 * read the same stale data and one overwrites the other.
 * @param {string} filename
 * @param {Function} modifier - async (data) => modifiedData
 * @returns {Promise<Object>} the modified data
 */
async function atomicUpdate(filename,modifier){
  let result;
  await enqueueWrite(filePath(filename),async()=>{
    const before=await readSnapshot(filename);
    result=await modifier(structuredClone(before));
    await persist(filename,before,result);
  });
  return result;
}

module.exports = {
  read,
  write,
  getById,
  getAll,
  save,
  remove,
  findBy,
  saveUser,
  getUser,
  getRawUser,
  findUserByUsernameHash,
  saveOpportunity,
  getOpportunity,
  getAllOpportunities,
  deleteOpportunity,
  filePath,
  DATA_DIR,
  flush:()=>Promise.all([...writeQueues.values()]),
  atomicUpdate
};
