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
const { encryptObject, decryptObject } = require('./crypto');

// Data storage path.
// - If DATA_DIR env var is set (production), use that.
// - Otherwise, resolve relative: from app/backend/ → ../../data = <parent>/data/
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '..', '..', 'data');

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
  const newQueue = queue.then(asyncFn).catch(err => {
    console.error(`Write queue error for ${filePath}:`, err);
  });
  writeQueues.set(filePath, newQueue);
  return newQueue;
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
async function read(filename, retries = 2) {
  const fp = filePath(filename);
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const data = await fsp.readFile(fp, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      if (e.code === 'ENOENT') return {};
      if (attempt < retries && (e instanceof SyntaxError)) {
        // Partial write detected — wait briefly and retry
        await new Promise(r => setTimeout(r, 10));
        continue;
      }
      throw e;
    }
  }
}

/**
 * Write data to a JSON file using atomic write (safe under concurrency).
 * Writes to a temp file first, then renames — readers never see partial data.
 * @param {string} filename
 * @param {Object} data
 * @returns {Promise<void>}
 */
async function write(filename, data) {
  const fp = filePath(filename);
  const tmp = fp + '.tmp.' + process.pid;
  await ensureDataDir();
  await enqueueWrite(fp, async () => {
    await fsp.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await fsp.rename(tmp, fp);
  });
}

// ── Collection Operations ────────────────────────────────────

/**
 * Get a record by ID from a collection file (async)
 * @param {string} filename
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
async function getById(filename, id) {
  const data = await read(filename);
  return data[id] || null;
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
async function save(filename, id, record) {
  const fp = filePath(filename);
  const tmp = fp + '.tmp.' + process.pid;
  await enqueueWrite(fp, async () => {
    const data = await read(filename);
    data[id] = record;
    await ensureDataDir();
    await fsp.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await fsp.rename(tmp, fp);
  });
}

/**
 * Delete a record (async)
 * @param {string} filename
 * @param {string} id
 * @returns {Promise<boolean>}
 */
async function remove(filename, id) {
  const fp = filePath(filename);
  const tmp = fp + '.tmp.' + process.pid;
  let deleted = false;
  await enqueueWrite(fp, async () => {
    const data = await read(filename);
    if (!data[id]) {
      deleted = false;
      return;
    }
    delete data[id];
    deleted = true;
    await ensureDataDir();
    await fsp.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await fsp.rename(tmp, fp);
  });
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
  const data = await read(filename);
  const results = [];

  for (const [id, record] of Object.entries(data)) {
    const fieldValue = field.split('.').reduce((obj, key) => obj?.[key], record);
    if (fieldValue === value) {
      results.push({ id, record });
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
  return decryptObject(opp);
}

/**
 * Get all opportunities, decrypted (async)
 * @param {string} type - optional filter by type
 * @returns {Promise<Array<Object>>}
 */
async function getAllOpportunities(type) {
  const data = await getAll('opportunities.json');
  let opps = Object.entries(data).map(([id, opp]) => {
    const decrypted = decryptObject(opp);
    decrypted.id = id;
    return decrypted;
  });

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
async function atomicUpdate(filename, modifier) {
  const fp = filePath(filename);
  const tmp = fp + '.tmp.' + process.pid;
  let result;
  await enqueueWrite(fp, async () => {
    const data = await fsp.readFile(fp, 'utf8').then(JSON.parse).catch(() => ({}));
    result = await modifier(data);
    await ensureDataDir();
    await fsp.writeFile(tmp, JSON.stringify(result, null, 2), 'utf8');
    await fsp.rename(tmp, fp);
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
  findUserByUsernameHash,
  saveOpportunity,
  getOpportunity,
  getAllOpportunities,
  deleteOpportunity,
  filePath,
  DATA_DIR,
  atomicUpdate
};
