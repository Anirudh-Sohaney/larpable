/** Move classification to its parent without overwriting later project edits. */
const fs=require('node:fs/promises'),store=require('../store');
const {encryptObject,decryptObject}=require('../crypto');
const {normalizeField}=require('../canonical');
function plan(projects,posts){
 const updates={},cleaned={};
 for(const [id,p] of Object.entries(projects)){
  const fields=decryptObject(p.encrypted_fields || {}),next={...fields};
  const sources=Object.entries(posts).filter(([,o])=>o.project_id===id);
  if(p.type==='project')delete next.field;
  else{
   const values=[...new Set(sources.map(([,o])=>{const f=decryptObject(o.encrypted_fields || {});return normalizeField(p.type==='nonprofit' ? f.nonprofit_field : f.industry);}).filter(Boolean))];
   if(!next.field){
    if(values.length!==1)throw new Error('Project field requires review: '+id+' ('+values.length+' source values)');
    next.field=values[0];
   }
  }
  if(JSON.stringify(next)!==JSON.stringify(fields))updates[id]={...p,encrypted_fields:encryptObject(next)};
  for(const [postId,o] of sources){
   const f=decryptObject(o.encrypted_fields || {});
   if(Object.hasOwn(f,'nonprofit_field') || Object.hasOwn(f,'industry')){
    delete f.nonprofit_field;delete f.industry;cleaned[postId]={...o,encrypted_fields:encryptObject(f)};
   }
  }
 }
 return {projects:updates,posts:cleaned};
}
async function run({dryRun=false}={}){
 const projects=await store.read('projects.json'),posts=await store.read('opportunities.json'),changes=plan(projects,posts);
 const report={projects_updated:Object.keys(changes.projects).length,posts_updated:Object.keys(changes.posts).length};
 if(dryRun || !report.projects_updated && !report.posts_updated)return report;
 for(const file of ['projects.json','opportunities.json']){
  try{await fs.copyFile(store.filePath(file),store.filePath(file+'.before-project-field-v7.bak'),require('node:fs').constants.COPYFILE_EXCL);}catch(e){if(!['ENOENT','EEXIST'].includes(e.code))throw e;}
 }
 for(const [file,key,original] of [['projects.json','projects',projects],['opportunities.json','posts',posts]])if(Object.keys(changes[key]).length)await store.atomicUpdate(file,current=>{
  for(const [id,value] of Object.entries(changes[key])){
   if(!require('node:util').isDeepStrictEqual(current[id],original[id]))throw new Error('Record changed during field migration: '+id);
   current[id]=value;
  }
  return current;
 });
 return report;
}
module.exports={plan,run};
