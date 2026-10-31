const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'project-field-'));Object.assign(process.env,{DATA_DIR:dir,ENCRYPTION_KEY:'a'.repeat(64)});
 const store=require('../backend/store'),{encryptObject,decryptObject}=require('../backend/crypto'),migration=require('../backend/migrations/project-field-v7');
 const field=require('../backend/matching/taxonomy.json').fields[0];
 try{
  await store.write('projects.json',{n:{type:'nonprofit',created_by:'owner',encrypted_fields:encryptObject({name:'Community learning',tags:['Teaching']})},p:{type:'project',encrypted_fields:encryptObject({field})}});
  const original={project_id:'n',created_by:'owner',encrypted_fields:encryptObject({nonprofit_field:field,description:'Preserve opportunity content',comments:[{id:'one',text:'Retain me'}]})};
  await store.write('opportunities.json',{one:original});
  const before=await fs.readFile(store.filePath('opportunities.json'),'utf8');
  assert.deepEqual(await migration.run({dryRun:true}),{projects_updated:2,posts_updated:1});assert.equal(await fs.readFile(store.filePath('opportunities.json'),'utf8'),before);
  const atomic=store.atomicUpdate;store.atomicUpdate=async(file,fn)=>{if(file==='opportunities.json')throw Error('interrupted');return atomic(file,fn);};
  await assert.rejects(migration.run(),/interrupted/);store.atomicUpdate=atomic;
  await migration.run();
  assert.equal(decryptObject((await store.getById('projects.json','n')).encrypted_fields).field,field);
  assert.ok(!Object.hasOwn(decryptObject((await store.getById('projects.json','p')).encrypted_fields),'field'));
  const expected=decryptObject(original.encrypted_fields);delete expected.nonprofit_field;assert.deepEqual(decryptObject((await store.getById('opportunities.json','one')).encrypted_fields),expected);
  assert.equal(await fs.readFile(store.filePath('opportunities.json.before-project-field-v7.bak'),'utf8'),before);
  const files=await fs.readdir(dir),stable=await Promise.all(files.map(f=>fs.readFile(store.filePath(f),'utf8')));
  assert.deepEqual(await migration.run(),{projects_updated:0,posts_updated:0});assert.deepEqual(await Promise.all(files.map(f=>fs.readFile(store.filePath(f),'utf8'))),stable);
  assert.deepEqual(migration.plan({n:{type:'company',encrypted_fields:encryptObject({})}},{}),{projects:{},posts:{}});
  console.log('Project field migration: dry run, backups, interrupted retry, content preservation, project exclusion and byte-stable rerun passed.');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
