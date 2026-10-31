const clock=require('./helpers/test-clock')();
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
(async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'post-project-api-'));
  process.env.DATA_DIR=dir;process.env.ENCRYPTION_KEY='b'.repeat(64);process.env.NODE_ENV='test';process.env.RESEND_API_KEY='';process.env.HOST='127.0.0.1';
  const store=require('../backend/store');const auth=require('../backend/auth');const {encryptObject,decryptObject}=require('../backend/crypto');
  const baseFields={looking_for:'Developers',description:'Build community tools',details:'Existing additional details',skills:['Programming','Web Development','Research']};
  await store.saveUser('owner',{type:'student',encrypted_fields:encryptObject({first_name:'Owner',email_opt_in:false})});
  await store.saveUser('other',{type:'student',encrypted_fields:encryptObject({first_name:'Other'})});
  const {app}=require('../server');const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const owner=await auth.createSession('owner'),other=await auth.createSession('other');
  const request=async(method,url,body,token)=>{
    const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(token ? {Cookie:'larpable_session='+token} : {})},...(body ? {body:JSON.stringify(body)} : {})});clock.afterPublication(method,url,r.status);return {status:r.status,body:await r.json()};
  };
  try{
    assert.equal((await request('POST','/api/projects',{},null)).status,401);
    for(const input of [{type:'bad'},{type:'project',name:'Bad',elevator_pitch:'one',tags:['Research']},{type:'project',name:'Bad',elevator_pitch:'Valid words',tags:['Not a real skill']},{type:'project',name:'Bad',elevator_pitch:'fuck this',tags:['Research']}])assert.equal((await request('POST','/api/projects',input,owner)).status,400);
    assert.equal((await request('POST','/api/projects',{type:'company',name:'Missing field',elevator_pitch:'Tools for students',tags:['Programming']},owner)).status,400);
    const created=await request('POST','/api/projects',{type:'company',field:"Science & Research",name:'New App',elevator_pitch:'A community planning app',tags:['Web Development']},owner);
    assert.equal(created.status,201);const project=created.body.project;
    assert.ok(project.fields.field);assert.equal(project.created_by,'owner');assert.equal(project.type,'company');
    assert.ok(!(await request('GET','/api/projects/mine',null,other)).body.projects.some(p=>p.id===project.id));
    const post={project_id:project.id,type:'nonprofit',field:"Science & Research",title:'Must not be stored',looking_for:'Developers',description:'Build the app',details:'Additional details',skills:baseFields.skills};
    assert.equal((await request('POST','/api/opportunities',post,other)).status,403);
    assert.equal((await request('POST','/api/opportunities',{...post,project_id:undefined},owner)).status,400);
    const result=await request('POST','/api/opportunities',post,owner);assert.equal(result.status,200);const id=result.body.id;
    const raw=await store.getById('opportunities.json',id);
    assert.equal(raw.project_id,project.id);assert.equal(raw.type,'company');assert.ok(!('title' in decryptObject(raw.encrypted_fields)));
    const detail=(await request('GET','/api/opportunities/'+id,null,owner)).body;
    assert.equal(detail.project.fields.name,'New App');assert.equal(detail.project.created_by,'owner');assert.equal(detail.fields.details,'Additional details');assert.ok(!('title' in detail.fields));
    assert.equal((await request('GET','/api/opportunities',null,owner)).body.opportunities.find(p=>p.id===id).project_name,'New App');
    assert.equal((await request('PATCH','/api/opportunities/'+id,{title:'Reintroduced',type:'nonprofit'},owner)).status,200);
    const edited=await store.getById('opportunities.json',id);assert.equal(edited.type,'company');assert.ok(!('title' in decryptObject(edited.encrypted_fields)));
    assert.equal((await request('POST','/api/drafts',post,other)).status,403);
    const saved=await request('POST','/api/drafts',post,owner);assert.equal(saved.status,200);
    const draft=(await request('GET','/api/drafts',null,owner)).body.drafts.find(d=>d.id===saved.body.id);
    assert.equal(draft.project_id,project.id);assert.equal(draft.project_name,'New App');assert.ok(!('title' in draft.fields));
    const published=await request('POST','/api/drafts/'+draft.id+'/publish',{},owner);assert.equal(published.status,200);
    assert.equal((await store.getById('opportunities.json',published.body.id)).project_id,project.id);
    const newBytes=await fs.readFile(store.filePath('opportunities.json'),'utf8');await require('../backend/startup').run();assert.equal(await fs.readFile(store.filePath('opportunities.json'),'utf8'),newBytes);
    console.log('Post/project architecture: current-format startup preservation, project validation, ownership, inherited type, feed/detail names, draft publishing passed.');
  } finally {await new Promise(resolve=>server.close(resolve));}
  await fs.rm(dir,{recursive:true,force:true});
})().catch(error=>{console.error(error);process.exitCode=1;});
