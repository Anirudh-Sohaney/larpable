const clock=require('./helpers/test-clock')();
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const vm=require('node:vm');
(async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'regular-posts-'));
  Object.assign(process.env,{DATA_DIR:dir,ENCRYPTION_KEY:'e'.repeat(64),NODE_ENV:'test',RESEND_API_KEY:''});
  const store=require('../backend/store'),auth=require('../backend/auth'),projects=require('../backend/projects');
  const {encryptObject,decryptObject}=require('../backend/crypto');
  let server;
  try{
    await require('../backend/startup').run();
    for(const id of ['owner','other'])await store.saveUser(id,{type:'student',encrypted_fields:encryptObject({first_name:id,username:id})});
    const owner=await auth.createSession('owner'),other=await auth.createSession('other');
    const {app}=require('../server');server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
    const base='http://127.0.0.1:'+server.address().port;
    async function request(method,url,body,token=owner){
      const response=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(token ? {Cookie:'larpable_session='+token} : {})},...(body===undefined ? {} : {body:JSON.stringify(body)})});
      clock.afterPublication(method,url,response.status);
      return {status:response.status,body:await response.json()};
    }
    const project=await projects.create('owner',{type:'project',name:'Project updates',elevator_pitch:'A project for web developers',tags:['Web Development','Programming']});
    const input={project_id:project.id,title:'A new milestone',content:'Our first public demo is ready.'};
    assert.equal((await request('POST','/api/posts',input,null)).status,401);
    assert.equal((await request('POST','/api/posts',input,other)).status,403);
    assert.equal((await request('POST','/api/posts',{...input,project_id:'missing'})).status,400);
    for(const patch of [{title:''},{title:'word '.repeat(11)},{title:'x'.repeat(131)},{title:42},{content:''},{content:'x'.repeat(301)}]){
      assert.equal((await request('POST','/api/posts',{...input,...patch})).status,400,JSON.stringify(patch));
    }
    const bounds=await request('POST','/api/posts',{...input,title:'x'.repeat(122)+' a b c d',content:'x'.repeat(300)});
    assert.equal(bounds.status,200);assert.equal((await request('DELETE','/api/posts/'+bounds.body.id)).status,200);
    const created=await request('POST','/api/posts',{...input,skills:['Cooking'],created_by:'other'});assert.equal(created.status,200);
    const id=created.body.id,url='/api/posts/'+id;
    assert.equal((await store.getById('posts.json',id)).created_by,'owner');
    assert.ok((await store.getById('posts.json',id)).encrypted_fields.title.startsWith('enc:'));
    assert.equal((await request('DELETE','/api/projects/'+project.id)).status,409);
    assert.equal((await request('PATCH',url,{content:'Other edit'},other)).status,403);
    assert.equal((await request('DELETE',url,undefined,other)).status,403);
    assert.equal((await request('PATCH',url,{project_id:'elsewhere'})).status,400);
    const post=(await request('GET',url,undefined,null)).body;
    assert.deepEqual(post.skills,project.fields.tags);assert.equal(post.kind,'post');assert.equal(post.project.fields.elevator_pitch,project.fields.elevator_pitch);
    assert.equal((await request('POST',url+'/like',undefined,null)).status,401);
    for(let i=0;i<2;i++)assert.deepEqual((await request('POST',url+'/like',undefined,other)).body,{liked:true,like_count:1});
    assert.equal((await request('GET',url,undefined,other)).body.liked,true);
    assert.equal((await request('GET',url,undefined,owner)).body.liked,false);
    assert.equal((await request('DELETE',url+'/like',undefined,other)).body.like_count,0);
    await request('POST',url+'/like',undefined,other);
    const comment=await request('POST',url+'/comments',{text:'Great progress'},other);assert.equal(comment.status,200);
    const commentUrl=url+'/comments/'+comment.body.comment.id;
    assert.equal((await request('PATCH',commentUrl,{text:'Edited progress'},owner)).status,403);
    assert.equal((await request('PATCH',commentUrl,{text:'Edited progress'},other)).status,200);
    const reply=await request('POST',commentUrl+'/replies',{text:'Thank you'},owner);assert.equal(reply.status,200);
    assert.equal((await request('PATCH',url,{title:'A newer milestone'})).status,200);
    const edited=(await request('GET',url)).body;assert.equal(edited.fields.comments[0].text,'Edited progress');assert.equal(edited.fields.comments[0].replies.length,1);assert.equal(edited.like_count,1);
    assert.equal(edited.fields.comments[0].can_edit,false);
    const draft=await request('POST','/api/drafts',{kind:'post',...input});assert.equal(draft.status,200);
    let drafts=(await request('GET','/api/drafts')).body.drafts;assert.equal(drafts[0].fields.title,input.title);assert.equal(drafts[0].kind,'post');
    const published=await request('POST','/api/drafts/'+draft.body.id+'/publish');assert.equal(published.status,200);assert.equal(published.body.kind,'post');
    assert.equal((await request('GET','/api/drafts')).body.drafts.length,0);
    // Uploaded bytes, rather than a filename or client-supplied duration, determine media acceptance.
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF1kAAAAASUVORK5CYII=','base64');
    async function upload(bytes,token=owner){const r=await fetch(base+'/api/media?project_id='+project.id,{method:'POST',headers:{'Content-Type':'image/png',...(token ? {Cookie:'larpable_session='+token} : {})},body:bytes});return {status:r.status,body:await r.json()};}
    assert.equal((await upload(png,null)).status,401);assert.equal((await upload(png,other)).status,403);
    assert.equal((await upload(Buffer.from('This is not media'))).status,400);
    assert.equal((await upload(await fs.readFile(path.join(__dirname,'fixtures/61-seconds.mp4')))).status,400);
    const video=await upload(await fs.readFile(path.join(__dirname,'fixtures/60-seconds.mp4')));assert.equal(video.status,201);assert.equal(video.body.media.duration,60);
    const image=await upload(png);assert.equal(image.status,201);const media=image.body.media;
    assert.equal((await fetch(base+media.url)).status,404,'unpublished media is private');
    assert.equal((await fetch(base+media.url,{headers:{Cookie:'larpable_session='+owner}})).status,200);
    const mediaPost=await request('POST','/api/posts',{...input,media_id:media.id});assert.equal(mediaPost.status,200);
    const bytes=await fetch(base+media.url,{headers:{Range:'bytes=0-7'}});assert.equal(bytes.status,206);assert.equal((await bytes.arrayBuffer()).byteLength,8);
    assert.equal((await request('DELETE',media.url)).status,409);
    const mediaDraft=await request('POST','/api/drafts',{kind:'post',...input,media_id:video.body.media.id});assert.equal(mediaDraft.status,200);
    drafts=(await request('GET','/api/drafts')).body.drafts;assert.equal(drafts[0].media.kind,'video');
    assert.equal((await request('DELETE','/api/drafts/'+mediaDraft.body.id)).status,200);
    assert.equal(await store.getById('media.json',video.body.media.id),null);
    const opportunity=await request('POST','/api/opportunities',{project_id:project.id,looking_for:'Developers',description:'Build useful tools',skills:['Research','Programming','Web Development']});assert.equal(opportunity.status,200);
    for(let i=0;i<5;i++)assert.equal((await request('POST','/api/posts',input)).status,200);
    const guest=(await request('GET','/api/feed',undefined,null)).body;assert.equal(guest.posts.length,6);assert.ok(guest.total>6);
    const all=(await request('GET','/api/feed')).body.posts;assert.ok(all.some(p=>p.kind==='opportunity'));assert.ok(all.some(p=>p.kind==='post'));
    assert.ok((await request('GET','/api/feed/mine')).body.posts.some(p=>p.id===id));
    const {score,rank}=require('../backend/matching/similarity');
    assert.ok(score({skills:['Web Development'],interests:[]},post)>score({skills:['Cooking'],interests:[]},post));
    assert.equal(rank({skills:['Web Development'],opportunity_preference:'paid'},[post])[id],rank({skills:['Web Development'],opportunity_preference:'unpaid'},[post])[id]);
    assert.equal((await request('DELETE',url)).status,200);assert.equal(await store.getById('post-reactions.json',id),null);
    assert.equal((await request('DELETE','/api/posts/'+mediaPost.body.id)).status,200);assert.equal((await fetch(base+media.url)).status,404);
    assert.equal(await store.getById('media.json',media.id),null);
    const ownedPending=await upload(png);assert.equal(ownedPending.status,201);
    const ownDraft=await request('POST','/api/drafts',{kind:'post',...input,media_id:ownedPending.body.media.id});assert.equal(ownDraft.status,200);
    assert.equal((await request('DELETE','/api/users/me')).status,200);
    assert.equal(Object.values(await store.read('posts.json')).filter(p=>p.created_by==='owner').length,0);
    assert.equal(Object.values(await store.read('drafts.json')).filter(p=>p.user_id==='owner').length,0);
    assert.equal(Object.values(await store.read('media.json')).filter(p=>p.created_by==='owner').length,0);
    for(const filename of ['create_student.html','opportunity.html']){
      const html=await fs.readFile(path.join(__dirname,'../web_app',filename),'utf8');
      for(const script of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(script[1],{filename});
    }
    console.log('Regular posts: current-format initialization, bounds, ownership/encryption, likes, shared comments/replies, drafts, validated media/private previews/ranges/cleanup, mixed feed and project-tag ranking passed.');
  }finally{if(server)await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
