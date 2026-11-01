/** Add only missing promotion flags; never replace or decrypt existing content. */
const fs=require('node:fs/promises'),store=require('../store');
async function run({dryRun=false}={}){
 const report={};
 for(const file of ['opportunities.json','posts.json']){
  const data=await store.read(file),ids=Object.keys(data).filter(id=>!Object.hasOwn(data[id],'promoted'));
  report[file]=ids.length;if(dryRun || !ids.length)continue;
  try{await fs.copyFile(store.filePath(file),store.filePath(file+'.before-promoted-v8.bak'),require('node:fs').constants.COPYFILE_EXCL);}catch(e){if(!['ENOENT','EEXIST'].includes(e.code))throw e;}
  await store.atomicUpdate(file,current=>{for(const id of ids)if(current[id] && !Object.hasOwn(current[id],'promoted'))current[id].promoted=false;return current;});
 }
 return report;
}
module.exports={run};
