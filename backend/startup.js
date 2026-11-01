/** Initialize current-format storage and recover interrupted runtime operations.
 * Completed legacy conversions are deliberately absent. Refuse old input before writes.
 */
const fs=require('node:fs/promises');
const store=require('./store');
const {decryptObject}=require('./crypto');
const {validate,TYPES}=require('./project_fields');
const COLLECTIONS=['projects.json','posts.json','post-reactions.json','media.json','larpscore-events.json','publication-days.json'];
async function checkFormat(){
  const [projects,opportunities,posts,drafts,users]=await Promise.all(['projects.json','opportunities.json','posts.json','drafts.json','users.json'].map(file=>store.read(file)));
  const old=detail=>{throw new Error('Unsupported data format: '+detail+'. Restore the archived migration release and migrate a backed-up copy before using this release.');};
  const active=id=>id==='admin_larpable' || Object.hasOwn(users,id);
  for(const [id,p] of Object.entries(projects)){
    if(!TYPES.has(p.type) || !p.created_by || !active(p.created_by))old('invalid project owner/type '+id);
    try{validate(decryptObject(p.encrypted_fields || {}));}catch(error){old('invalid project '+id+': '+error.message);}
  }
  for(const [file,records] of [['opportunities.json',opportunities],['posts.json',posts]])for(const [id,p] of Object.entries(records)){
    if(!projects[p.project_id] || projects[p.project_id].created_by!==p.created_by)old('invalid project link '+file+':'+id);
    if(file==='opportunities.json' && Object.hasOwn(decryptObject(p.encrypted_fields || {}),'title'))old('legacy opportunity title '+id);
  }
  // Older private opportunity drafts may legitimately await an owner-selected project.
  for(const [id,d] of Object.entries(drafts))if(!['post','opportunity'].includes(d.kind))old('unclassified draft '+id);
}
async function run(){
  await checkFormat();
  await require('./migrations/project-field-v7').run();
  await require('./migrations/promoted-v8').run();
  await fs.mkdir(store.DATA_DIR,{recursive:true});
  for(const file of COLLECTIONS){
    try{await fs.writeFile(store.filePath(file),'{}\n',{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;}
  }
  await fs.mkdir(store.filePath('media'),{recursive:true});
  await require('./deleted_users').resumePending();
  const recovery=await require('./larpscore').recover();
  await require('./media').cleanup();
  return recovery;
}
module.exports={run,checkFormat,COLLECTIONS};
