const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
(async()=>{
 const clock=require('./helpers/test-clock')();
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'promotion-'));Object.assign(process.env,{DATA_DIR:dir,ENCRYPTION_KEY:'e'.repeat(64),NODE_ENV:'test',RESEND_API_KEY:''});
 const store=require('../backend/store'),{encryptObject}=require('../backend/crypto'),auth=require('../backend/auth'),promotion=require('../backend/promotion');let server;
 try{
  for(const [id,username] of [['owner','anisohaney'],['other','other'],['variant','AnISoHaNey']])await store.saveUser(id,{type:'student',encrypted_fields:encryptObject({username})});
  assert.equal(await promotion.value(undefined,'other','other'),false);
  for(const id of ['other','variant','admin_larpable'])await assert.rejects(promotion.value(true,id,id),e=>e.status===403);
  await assert.rejects(promotion.value(true,'owner','other'),e=>e.status===403);
  for(const value of ['true',1,null,{}])await assert.rejects(promotion.value(value,'owner','owner'),e=>e.status===400);
  await store.write('projects.json',{p:{created_by:'owner',type:'project',encrypted_fields:encryptObject({name:'Test project',elevator_pitch:'Tools for students',tags:['Programming']})},q:{created_by:'other',type:'project',encrypted_fields:encryptObject({name:'Other project',elevator_pitch:'Tools for students',tags:['Programming']})}});
  for(const file of ['posts.json','opportunities.json'])await store.write(file,{old:{created_by:'owner',project_id:'p',encrypted_fields:encryptObject({title:'Old post',content:'Useful tools',description:'Useful tools',skills:['Programming']})},other:{created_by:'other',project_id:'q',encrypted_fields:encryptObject({title:'Other post',content:'Useful tools',description:'Useful tools'})}});
  const migration=require('../backend/migrations/promoted-v8');
  const originals=await Promise.all(['posts.json','opportunities.json'].map(f=>fs.readFile(store.filePath(f),'utf8')));
  assert.deepEqual(await migration.run({dryRun:true}),{'opportunities.json':2,'posts.json':2});assert.deepEqual(await Promise.all(['posts.json','opportunities.json'].map(f=>fs.readFile(store.filePath(f),'utf8'))),originals);
  const originalAtomic=store.atomicUpdate;let fail=true;
  store.atomicUpdate=async(file,fn)=>{if(file==='posts.json' && fail){fail=false;throw Error('interrupted promotion migration');}return originalAtomic(file,fn);};
  await assert.rejects(migration.run(),/interrupted promotion migration/);store.atomicUpdate=originalAtomic;
  await migration.run();assert.equal((await store.getById('posts.json','old')).promoted,false);
  const {app}=require('../server');server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
  const tokens={};for(const id of ['owner','other','variant','admin_larpable'])tokens[id]=await auth.createSession(id);
  async function req(method,url,body,id='owner'){const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json',Cookie:'larpable_session='+tokens[id]},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
  for(const id of ['owner','other','variant','admin_larpable']){const me=await fetch(base+'/api/auth/me',{headers:{Cookie:'larpable_session='+tokens[id]}}).then(r=>r.json());assert.equal(me.user.can_promote===true,id==='owner');}
  for(const prefix of ['/api/posts/','/api/opportunities/']){
   assert.equal((await req('PATCH',prefix+'old',{promoted:true})).status,200);
   assert.equal((await req('PATCH',prefix+'old',{promoted:false},'admin_larpable')).status,403);
   assert.equal((await req('PATCH',prefix+'other',{promoted:true},'other')).status,403);
   assert.equal((await req('PATCH',prefix+'other',{promoted:true})).status,403);
   assert.equal((await req('PATCH',prefix+'old',{promoted:'true'})).status,400);
   assert.equal((await req('PATCH',prefix+'old',{promoted:false})).status,200);
  }
  const made=await req('POST','/api/posts',{project_id:'p',title:'Promoted update',content:'Useful update',promoted:true});assert.equal(made.status,200);assert.equal((await store.getById('posts.json',made.body.id)).promoted,true);
  clock.advance();
  const opportunity=await req('POST','/api/opportunities',{project_id:'p',description:'Community tools',looking_for:'Developers',skills:['Programming','Research','Web Development'],promoted:true});assert.equal(opportunity.status,200);assert.equal((await store.getById('opportunities.json',opportunity.body.id)).promoted,true);
  assert.equal((await req('POST','/api/posts',{project_id:'q',title:'Spoof attempt',content:'Useful update',promoted:true},'other')).status,403);
  const draft=await req('POST','/api/drafts',{kind:'post',project_id:'p',title:'Draft update',content:'Useful update',promoted:true});assert.equal(draft.status,200);assert.equal((await store.getById('drafts.json',draft.body.id)).fields.promoted,true);
  clock.advance();const published=await req('POST','/api/drafts/'+draft.body.id+'/publish',{});assert.equal(published.status,200);assert.equal((await store.getById('posts.json',published.body.id)).promoted,true);
  const feed=await fetch(base+'/api/feed',{headers:{Cookie:'larpable_session='+tokens.other}}).then(r=>r.json());assert.ok(feed.posts.some(p=>p.id===made.body.id && p.promoted===true));
  assert.equal((await req('POST','/api/drafts',{kind:'post',project_id:'q',title:'Bad draft',content:'Useful update',promoted:true},'other')).status,403);
  const stable=await Promise.all(['posts.json','opportunities.json'].map(f=>fs.readFile(store.filePath(f),'utf8')));await migration.run();assert.deepEqual(await Promise.all(['posts.json','opportunities.json'].map(f=>fs.readFile(store.filePath(f),'utf8'))),stable);
  const filters=vm.runInNewContext(require('node:fs').readFileSync('web_app/js/filters.js','utf8')+';Filters;');const rows=[{id:'normal',created_at:'2026-01-02',unread_reply_comment_id:'reply'},{id:'promoted',promoted:true,created_at:'2026-01-01'}];assert.equal(filters.sort(rows,'foryou',{normal:1,promoted:0})[0].id,'promoted');assert.equal(filters.sort(rows,'newest')[0].id,'normal');assert.equal(filters.apply([{promoted:true,kind:'post'}],{pay:'paid'}).length,0);
  console.log('Promotion: exact stored account, ownership, admin/case/spoof denial, strict booleans, both edit APIs, creation, drafts, additive migration/no-op and filter-aware For you priority passed.');
 }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}clock.restore();await fs.rm(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
