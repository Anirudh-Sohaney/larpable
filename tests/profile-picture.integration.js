const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
(async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'larpable-pictures-'));
  Object.assign(process.env,{DATA_DIR:dir,ENCRYPTION_KEY:'a'.repeat(64),NODE_ENV:'test',RESEND_API_KEY:''});
  const store=require('../backend/store'),auth=require('../backend/auth'),{encryptObject,decryptObject}=require('../backend/crypto');
  const {app}=require('../server');const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port;
  try{
    const profile={username:'alice',first_name:'Alice',skills:['Programming'],interests:['Robotics'],experiences:[],email:'alice@example.test',saved_posts:['saved'],unknown_field:'preserve me'};
    await store.saveUser('a',{type:'student',staff_access:true,email_opt_in:false,created_at:'2026-01-01',encrypted_fields:encryptObject(profile)});
    for(const [id,fields] of [['legacy',{first_name:'Legacy'}],['camel',{firstName:'Camel'}],['empty',{username:'',first_name:'Empty'}],['priority',{username:'username',first_name:'Different'}]]){
      await store.saveUser(id,{type:'student',encrypted_fields:encryptObject(fields)});
      const original=await fs.readFile(store.filePath('users.json'),'utf8');
      const avatar=await (await fetch(base+'/api/profiles/'+id+'/picture')).text();
      assert.match(avatar,new RegExp('>'+({legacy:'L',camel:'C',empty:'E',priority:'U'}[id])+'<\\/text>'));
      assert.equal(await fs.readFile(store.filePath('users.json'),'utf8'),original,'avatar fallback never modifies legacy accounts');
    }
    const before=await fs.readFile(store.filePath('users.json'),'utf8');
    let r=await fetch(base+'/api/profiles/a/picture');assert.equal(r.status,200);assert.match(await r.text(),/>A<\/text>/);
    assert.equal(await fs.readFile(store.filePath('users.json'),'utf8'),before,'generated pictures never rewrite existing accounts');
    const token=await auth.createSession('a');
    const patch=body=>fetch(base+'/api/users/me',{method:'PATCH',headers:{Cookie:'larpable_session='+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
    const bytes=await require('sharp')({create:{width:300,height:600,channels:3,background:'#123456'}}).png().toBuffer();
    const signup=await fetch(base+'/api/auth/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'new_picture',password:'test-password',type:'student',legal_agreed:true,age:17,grade:'11th',skills:['Programming','Research','Writing'],interests:['Robotics','Education','Music'],profile_picture:'data:image/png;base64,'+bytes.toString('base64')})});
    assert.equal(signup.status,200);const {userId}=await signup.json();
    assert.ok((await store.getRawUser(userId)).encrypted_fields.profile_picture.startsWith('enc:'));
    const publicProfile=await (await fetch(base+'/api/profiles/'+userId)).json();assert.ok(!('profile_picture' in publicProfile.profile),'image bytes stay outside profile JSON');
    r=await patch({profile_picture:'data:image/png;base64,'+bytes.toString('base64')});assert.equal(r.status,200);
    const raw=await store.getRawUser('a'),fields=decryptObject(raw.encrypted_fields);const {profile_picture,...rest}=fields;
    assert.deepEqual(rest,profile);assert.equal(raw.email_opt_in,false);assert.equal(raw.staff_access,true);
    assert.ok(raw.encrypted_fields.profile_picture.startsWith('enc:'));
    r=await fetch(base+'/api/profiles/a/picture');assert.match(r.headers.get('content-type'),/image\/webp/);
    const etag=r.headers.get('etag');assert.equal((await fetch(base+'/api/profiles/a/picture',{cache:'force-cache',headers:{'If-None-Match':etag}})).status,304);
    assert.equal((await require('sharp')(Buffer.from(await r.arrayBuffer())).metadata()).width,256);
    const snapshot=await fs.readFile(store.filePath('users.json'),'utf8');
    assert.equal((await patch({profile_picture:'data:image/png;base64,AAAA'})).status,400);
    assert.equal(await fs.readFile(store.filePath('users.json'),'utf8'),snapshot);
    await patch({first_name:'Updated'});assert.equal(decryptObject((await store.getRawUser('a')).encrypted_fields).profile_picture,profile_picture);
    assert.equal((await patch({profile_picture:null})).status,200);assert.match(await (await fetch(base+'/api/profiles/a/picture')).text(),/>A<\/text>/);
    assert.equal((await fetch(base+'/api/profiles/missing/picture')).status,404);
    await require('../backend/deleted_users').remove('a');assert.equal((await fetch(base+'/api/profiles/a/picture')).status,404);
    console.log('Picture API: generated defaults without writes, encrypted upload, cache revalidation, unrelated-data preservation, failed-upload safety, removal and account deletion passed.');
  }finally{await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
