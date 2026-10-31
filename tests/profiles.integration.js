const clock=require('./helpers/test-clock')();
const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
(async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'public-profiles-'));
  Object.assign(process.env,{DATA_DIR:dir,ENCRYPTION_KEY:'f'.repeat(64),NODE_ENV:'test',RESEND_API_KEY:''});
  const store=require('../backend/store'),auth=require('../backend/auth'),projects=require('../backend/projects');const {encryptObject}=require('../backend/crypto');
  let server;
  try{
    await store.saveUser('owner',{type:'student',password_hash:'private hash',encrypted_fields:encryptObject({firstName:'Profile',lastName:'Owner',username:'profile_owner',email:'private@example.test',city:'Private city',age:17,skills:['Programming','Research'],interests:['Artificial Intelligence'],saved_posts:['private'],experiences:[{type:'project',title:'Community tools',description:'Tools for community collaboration.',skills:['Programming'],private_note:'hidden'}]})});
    await store.saveUser('other',{type:'student',encrypted_fields:encryptObject({username:'empty_profile'})});
    const owner=await auth.createSession('owner'),other=await auth.createSession('other');const user=await auth.getUserFromToken(owner);
    const project=await projects.create('owner',{type:'project',name:'Visible project',elevator_pitch:'Tools for community collaboration',tags:['Programming']});
    const unrelated=await projects.create('other',{type:'project',name:'Other project',elevator_pitch:'Another community project',tags:['Research']});
    for(let i=0;i<8;i++){await require('../backend/regular_posts').create(user,{project_id:project.id,title:'Project update '+i,content:'Public project content.'});clock.advance();}
    const opportunity=await require('../backend/posts').create(user,{project_id:project.id,looking_for:'Developers',description:'Build community tools',skills:['Programming','Research','Web Development'],contact_links:['private@example.test']});
    clock.advance();
    const held=await require('../backend/posts').create(user,{project_id:project.id,looking_for:'Developers',description:'fuck this',skills:['Programming','Research','Web Development']});
    const {app}=require('../server');server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
    const request=async(url,token)=>{const r=await fetch(base+url,{headers:token ? {Cookie:'larpable_session='+token} : {}});return {status:r.status,body:await r.json()};};
    const filenames=['users.json','projects.json','posts.json','opportunities.json'];
    const before=await Promise.all(filenames.map(f=>fs.readFile(store.filePath(f),'utf8')));
    const result=await request('/api/profiles/owner');assert.equal(result.status,200);
    const profile=result.body.profile;assert.equal(profile.name,'Profile Owner');assert.equal(profile.username,'profile_owner');
    assert.deepEqual(Object.keys(profile).sort(),['experiences','id','interests','larpscore','name','skills','username']);
    assert.equal(profile.skills.length,2);assert.equal(profile.interests.length,1);assert.equal(profile.experiences.length,1);
    assert.ok(!('private_note' in profile.experiences[0]));assert.ok(!JSON.stringify(result.body).includes('private@example.test'));
    assert.deepEqual(result.body.projects.map(p=>p.id),[project.id]);
    const empty=(await request('/api/profiles/other')).body.profile;assert.equal(empty.name,'empty_profile');assert.deepEqual(empty.experiences,[]);assert.deepEqual(empty.skills,[]);
    assert.equal((await request('/api/profiles/missing')).status,404);
    assert.equal((await request('/api/profiles/__proto__')).status,404);
    const url='/api/profiles/owner/projects/'+project.id+'/posts';
    const posts=(await request(url)).body.posts;assert.equal(posts.length,9,'profile projects expose all approved associated posts, including beyond six');
    assert.ok(posts.some(p=>p.id===opportunity.id));assert.ok(!posts.some(p=>p.id===held.id));
    assert.ok(posts.every(p=>p.project_id===project.id));assert.deepEqual(posts.find(p=>p.id===opportunity.id).contact_links,[]);
    assert.deepEqual((await request(url,other)).body.posts.find(p=>p.id===opportunity.id).contact_links,['private@example.test']);
    assert.equal((await request('/api/profiles/owner/projects/'+unrelated.id+'/posts')).status,404);
    assert.equal((await request('/api/profiles/owner/projects/missing/posts')).status,404);
    assert.deepEqual(await Promise.all(filenames.map(f=>fs.readFile(store.filePath(f),'utf8'))),before,'public profile reads do not migrate, mark read, or rewrite existing records');
    for(const page of ['/profile?id=owner','/edit_profile'])assert.equal((await fetch(base+page)).status,200);
    console.log('Public profiles: anonymous access, legacy names, explicit public fields, experience privacy, project association, complete mixed feeds, moderation/contact gates and mutation-free reads passed.');
  }finally{if(server)await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
