const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
(async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'larpable-store-efficiency-'));
  Object.assign(process.env,{DATA_DIR:dir,ENCRYPTION_KEY:'b'.repeat(64)});
  const store=require('../backend/store'),score=require('../backend/larpscore'),{encryptObject}=require('../backend/crypto');
  const originalRead=fs.readFile;let reads=0;
  fs.readFile=async function(file,...args){if(String(file).startsWith(dir+'/'))reads++;return originalRead.call(this,file,...args);};
  try{
    await store.write('cache.json',{a:{value:1},b:{value:2}});reads=0;
    const a=await store.getById('cache.json','a');a.value=99;
    assert.equal((await store.getById('cache.json','a')).value,1);
    const whole=await store.read('cache.json');whole.b.value=99;
    assert.equal((await store.read('cache.json')).b.value,2);
    assert.equal(reads,1,'stable encrypted snapshots avoid repeated disk reads/parses');
    const stat=await fs.stat(store.filePath('cache.json'),{bigint:true});
    await store.atomicUpdate('cache.json',data=>data);await store.save('cache.json','a',{value:1});await store.remove('cache.json','missing');
    assert.equal((await fs.stat(store.filePath('cache.json'),{bigint:true})).ino,stat.ino,'no-op updates never replace the file');
    await fs.writeFile(store.filePath('external.tmp'),JSON.stringify({a:{value:3}}));await fs.rename(store.filePath('external.tmp'),store.filePath('cache.json'));
    assert.equal((await store.getById('cache.json','a')).value,3,'external atomic replacements invalidate snapshots');
    await fs.writeFile(store.filePath('cache.json'),JSON.stringify({a:{value:4}}));assert.equal((await store.getById('cache.json','a')).value,4);
    await Promise.all(Array.from({length:20},()=>store.atomicUpdate('cache.json',data=>{data.a.value++;return data;})));
    assert.equal((await store.getById('cache.json','a')).value,24,'queued concurrent writes preserve increments');
    await fs.writeFile(store.filePath('cache.json'),'invalid JSON');await assert.rejects(store.read('cache.json'),SyntaxError);
    await assert.rejects(store.atomicUpdate('cache.json',data=>data),SyntaxError);
    assert.equal(await originalRead(store.filePath('cache.json'),'utf8'),'invalid JSON','parse failures never overwrite existing data');
    await store.write('empty.json',{});await fs.access(store.filePath('empty.json'));
    await store.saveUser('owner',{created_at:'2026-01-01T00:00:00Z',encrypted_fields:{}});
    const before={},after={};for(let i=0;i<30;i++)before['p'+i]={created_by:'owner',created_at:new Date().toISOString(),encrypted_fields:encryptObject({comments:[]})};
    Object.assign(after,before);after.p0={...before.p0,encrypted_fields:encryptObject({comments:[{id:'new',user_id:'other',created_at:new Date().toISOString()}]})};
    // Invalid unrelated ciphertext proves only changed posts are decrypted.
    before.p29.encrypted_fields.comments=[{text:'enc:invalid'}];
    await store.write('posts.json',{});await store.write('applications.json',{});await store.write('post-reactions.json',{});
    await score.capture('posts.json',before,after);
    const ledger=await store.read(score.FILE);assert.ok(Object.keys(ledger).some(key=>JSON.parse(key)[0]==='comment'));
    const ledgerStat=await fs.stat(store.filePath(score.FILE),{bigint:true});reads=0;
    await score.capture('posts.json',after,after);assert.equal(reads,0,'identical sources skip all score snapshot reads');
    assert.equal((await fs.stat(store.filePath(score.FILE),{bigint:true})).ino,ledgerStat.ino);
    console.log('Store efficiency: isolated cached reads, external invalidation, no-op inode preservation, concurrent writes, corruption safety, empty collections and scoring restricted to changed posts passed.');
  }finally{fs.readFile=originalRead;await fs.rm(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
