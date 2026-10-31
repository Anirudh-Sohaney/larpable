/** Project records own identity and classification; posts reference them by project_id. */
const {randomBytes} = require('node:crypto');
const store = require('./store');
const {encryptObject,decryptObject} = require('./crypto');
const {sanitizeObject} = require('./sanitize');
const {normalizeSkills,normalizeField,CANONICAL_FIELDS} = require('./canonical');
const {validate,TYPES} = require('./project_fields');
const skills = new Set(require('./matching/taxonomy.json').skills);
const {scanFields} = require('./profanity');
const fail = (message,status=400)=>Object.assign(new Error(message),{status,expectedStoreConflict:true});

function publicProject(id,raw) {
  return {id,type:raw.type,created_by:raw.created_by,fields:decryptObject(raw.encrypted_fields || {})};
}
async function get(id) {
  if (typeof id !== 'string' || !id) return null;
  const raw=await store.getById('projects.json',id);
  return raw ? publicProject(id,raw) : null;
}
async function owned(id,userId) {
  const project=await get(id);
  if (!project) throw fail('Choose an existing project');
  if (project.created_by !== userId) throw fail('You can only post to your own projects',403);
  return project;
}
async function mine(userId) {
  return (await store.findBy('projects.json','created_by',userId)).map(({id,record})=>publicProject(id,record));
}
function projectFields(input) {
  if (!TYPES.has(input.type)) throw fail('Choose project, nonprofit, or company/startup');
  const fields=sanitizeObject({name:input.name,elevator_pitch:input.elevator_pitch,description:input.description || '',tags:input.tags});
  if(input.type!=='project'){
    fields.field=normalizeField(input.field);
    if(!CANONICAL_FIELDS.has(fields.field))throw fail('Choose a valid project field');
  }
  if (typeof fields.name !== 'string' || fields.name.length>120) throw fail('Project name must be at most 120 characters');
  if (typeof fields.description !== 'string' || fields.description.length>5000) throw fail('Project description must be at most 5000 characters');
  if (!Array.isArray(fields.tags) || fields.tags.some(t=>typeof t!=='string')) throw fail('Choose project tags');
  fields.tags=normalizeSkills(fields.tags);
  if (fields.tags.length>15 || fields.tags.some(t=>!skills.has(t))) throw fail('Choose up to 15 skills from the project tags list');
  try { validate(fields); } catch(error) {throw fail(error.message);}
  if (scanFields({name:fields.name,description:fields.elevator_pitch,details:fields.description,skills:fields.tags}).flagged) throw fail('Please revise the project wording before saving');
  return fields;
}
async function create(userId,input) {
  const fields=projectFields(input);
  const id='prj_'+randomBytes(12).toString('hex');
  const raw={id,schema_version:1,type:input.type,created_by:userId,created_at:new Date().toISOString(),encrypted_fields:encryptObject(fields)};
  await store.atomicUpdate('projects.json',async data=>{await require('./deleted_users').requireActive(userId);data[id]=raw;return data;});
  return publicProject(id,raw);
}
// Serialize changes to a project and new child references within this process.
const pending=new Map();
function withOwned(id,userId,operation) {
  const result=(pending.get(id) || Promise.resolve()).catch(()=>{}).then(async()=>{await require('./deleted_users').requireActive(userId);return operation(await owned(id,userId));});
  pending.set(id,result);
  const cleanup=()=>{if(pending.get(id)===result)pending.delete(id);};
  result.then(cleanup,cleanup);
  return result;
}
async function update(id,userId,input) {
  return withOwned(id,userId,async project=>{
    const type=input.type === undefined ? project.type : input.type;
    const fields=projectFields({...project.fields,...input,type});
    let updated;
    await store.atomicUpdate('projects.json',data=>{
      const raw=data[id];
      if(!raw || raw.created_by!==userId)throw fail('Project not found',404);
      raw.type=type;raw.encrypted_fields=encryptObject(fields);raw.updated_at=new Date().toISOString();
      updated=publicProject(id,raw);
      return data;
    });
    return updated;
  });
}
async function remove(id,userId) {
  return withOwned(id,userId,async()=>{
    const [posts,drafts,regular]=await Promise.all([store.read('opportunities.json'),store.read('drafts.json'),store.read('posts.json')]);
    if([...Object.values(posts),...Object.values(regular)].some(p=>p.project_id===id) || Object.values(drafts).some(d=>d.project_id===id)) {
      throw fail('Delete this project’s posts and drafts before deleting the project.',409);
    }
    await store.remove('projects.json',id);
    for(const asset of Object.values(await store.read('media.json')))if(asset.project_id===id)await require('./media').releaseIfUnused(asset.id);
  });
}
async function attach(posts) {
  const projects=await store.read('projects.json');
  const resolved=new Map();
  return posts.map(post=>{
    if(!resolved.has(post.project_id)){const raw=projects[post.project_id];resolved.set(post.project_id,raw ? publicProject(post.project_id,raw) : null);}
    const project=resolved.get(post.project_id);
    return {...post,project,field:project?.fields.field || '',project_name:project?.fields.name || '',type:project?.type || post.type};
  });
}
module.exports={publicProject,get,owned,mine,create,update,remove,withOwned,attach,fail};
