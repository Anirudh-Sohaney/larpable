const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'startup-current-'));
 Object.assign(process.env,{DATA_DIR:dir,ENCRYPTION_KEY:'a'.repeat(64),NODE_ENV:'test'});
 const store=require('../backend/store'),startup=require('../backend/startup'),{encryptObject}=require('../backend/crypto');
 const bytes=async()=>Object.fromEntries(await Promise.all((await fs.readdir(dir)).filter(n=>n.endsWith('.json')).map(async n=>[n,[await fs.readFile(path.join(dir,n),'utf8'),String((await fs.stat(path.join(dir,n),{bigint:true})).ino)]])));
 try{
  await startup.run();for(const file of startup.COLLECTIONS)assert.deepEqual(await store.read(file),{});
  const empty=await bytes();await startup.run();assert.deepEqual(await bytes(),empty);
  await store.saveUser('owner',{created_at:'2026-01-01',encrypted_fields:encryptObject({username:'owner'})});
  await store.save('projects.json','parent',{created_by:'owner',type:'project',encrypted_fields:encryptObject({name:'Test project',elevator_pitch:'Tools for students',tags:['Programming']})});
  await store.save('opportunities.json','current',{created_by:'owner',project_id:'parent',type:'project',created_at:'2026-01-02',encrypted_fields:encryptObject({description:'Build useful tools',skills:['Programming']})});
  await store.save('drafts.json','private',{user_id:'owner',kind:'opportunity',fields:{title:'Owner draft'}});
  await startup.run();const current=await bytes();await startup.run();assert.deepEqual(await bytes(),current);
  for(const change of [p=>{delete p.project_id;},p=>{p.encrypted_fields=encryptObject({title:'Legacy title'});}]){
   const original=await store.getById('opportunities.json','current'),old=structuredClone(original);change(old);await store.save('opportunities.json','current',old);
   const before=await bytes();await assert.rejects(startup.run(),/Unsupported data format/);assert.deepEqual(await bytes(),before);await store.save('opportunities.json','current',original);
  }
  await store.atomicUpdate('users.json',u=>{u.owner.deletion_pending=true;return u;});
  await startup.run();assert.equal(await store.getRawUser('owner'),null);assert.equal(await store.getById('projects.json','parent'),null);assert.equal(await store.getById('opportunities.json','current'),null);
  console.log('Startup: fresh initialization, byte/inode-stable current data, private drafts, old-format refusal before writes and pending-deletion recovery passed.');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
