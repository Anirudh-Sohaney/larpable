// Independent architecture checks: isolated child processes, no live dataset access.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'streak-audit-'));
 const common=`
 const assert=require('node:assert/strict');
 const clock=require('./tests/helpers/test-clock')('2026-11-01T12:00:00Z');
 const store=require('./backend/store'),streak=require('./backend/streak'),limit=require('./backend/publication_limit'),score=require('./backend/larpscore');
 const generation='2026-01-01T00:00:00Z';
 const publish=async(id)=>{const raw={created_by:'audit',project_id:process.env.AUDIT_PROJECT,kind:'post',promoted:false,encrypted_fields:{}};await limit.publish('audit','post',id,raw,()=>store.save('posts.json',id,raw));};
 `;
 function run(script,expected=0,extra={}){
  const result=spawnSync(process.execPath,['-e',common+'\n(async()=>{'+script+'})().catch(error=>{console.error(error);process.exitCode=1});'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,DATA_DIR:dir,ENCRYPTION_KEY:'a'.repeat(64),NODE_ENV:'test',...extra},encoding:'utf8',timeout:30000});
  assert.equal(result.status,expected,result.stderr || result.error?.message || result.stdout);
  return result.stdout.trim();
 }
 try{
  const project=run(`await store.saveUser('audit',{created_at:generation,...streak.defaults(),encrypted_fields:{},untouched:{nested:'keep'}});const project=await require('./backend/projects').create('audit',{type:'project',name:'Audit project',elevator_pitch:'Tools for independent verification',tags:['Programming']});process.env.AUDIT_PROJECT=project.id;await publish('first');console.log(project.id);`);
  // Kill after post + score persist, but before claim confirmation / user fields.
  run(`clock.advance();const save=store.save;store.save=async(file,id,record)=>{if(file===limit.FILE&&record.confirmed)process.exit(73);return save(file,id,record);};await publish('crash');`,73,{AUDIT_PROJECT:project});
  run(`clock.advance();assert.equal((await store.getRawUser('audit')).streak,0);assert.equal((await store.read(limit.FILE))[limit.key('post','crash')].confirmed,false);await require('./backend/startup').run();assert.equal((await store.getRawUser('audit')).streak,1);assert.equal((await store.getRawUser('audit')).last_post_at,'2026-11-02T12:00:00.000Z');assert.equal(await score.get('audit',generation),12);clock.advance();await publish('after-restart');assert.equal((await store.getRawUser('audit')).streak,2);assert.equal(await score.get('audit',generation),21);await store.remove('posts.json','crash');await streak.recover();assert.equal((await store.getRawUser('audit')).streak,2);assert.deepEqual((await store.getRawUser('audit')).untouched,{nested:'keep'});`,0,{AUDIT_PROJECT:project});
  run(`clock.set('2026-11-03T12:00:00Z');await store.atomicUpdate('users.json',users=>{delete users.audit.streak_version;return users;});await streak.recover();assert.equal((await store.getRawUser('audit')).streak,2);`);
  console.log('PASS: real process exit after source persistence, startup recovery, next-post continuity, deletion, missing initialization marker and unrelated-field preservation.');
  // With no source at all, a pending claim must never advance streak metadata.
  run(`clock.set('2026-11-04T12:00:00Z');await limit.publish('audit','post','never-written',{},()=>process.exit(74));`,74,{AUDIT_PROJECT:project});
  run(`clock.set('2026-11-04T12:00:00Z');await require('./backend/startup').run();assert.equal((await store.getRawUser('audit')).streak,2);assert.equal((await store.getRawUser('audit')).last_post_at,'2026-11-03T12:00:00.000Z');`,0,{AUDIT_PROJECT:project});
  console.log('PASS: abrupt exit before source write never advances an initialized user streak.');
  // An independent deterministic oracle, including exact elapsed-time boundaries.
  run(`
   await store.write('publication-days.json',{});await store.write('posts.json',{});await store.write(score.FILE,{});await store.saveUser('audit',{created_at:generation,...streak.defaults(),encrypted_fields:{}});
   let prior=null,expected=0,points=0,seed=79231;
   const gaps=[86400000,streak.WINDOW-1,streak.WINDOW,streak.WINDOW+1];
   for(let i=0;i<80;i++){
    seed=(seed*16807)%2147483647;const gap=i<gaps.length ? gaps[i] : 86400000+seed%700000000;clock.advance(gap);
    const now=Date.now();expected=prior!==null&&now-prior<604800000 ? expected+1 : 0;prior=now;points+=5+2*expected;
    await publish('sequence-'+i);const user=await store.getRawUser('audit');assert.equal(user.streak,expected,'publication '+i);assert.equal(Date.parse(user.last_post_at),now);assert.equal(await score.get('audit',generation),points);
    assert.equal(streak.view(user,now+604799999).streak,expected);assert.equal(streak.view(user,now+604800000).streak,0);assert.equal(streak.view(user,now+604800001).streak,0);
   }
   const files=['users.json',limit.FILE,score.FILE,'posts.json'];const before=await Promise.all(files.map(file=>require('node:fs/promises').readFile(store.filePath(file),'utf8')));await streak.recover();await score.recover();assert.deepEqual(await Promise.all(files.map(file=>require('node:fs/promises').readFile(store.filePath(file),'utf8'))),before);
  `,0,{AUDIT_PROJECT:project});
  console.log('PASS: 80-publication oracle checks streak, timestamp, exact 168-hour boundaries, cumulative bonuses and byte-stable recovery.');
  run(`
   await store.saveUser('legacy-orphan',{created_at:generation,encrypted_fields:{},untouched:'preserve'});
   const yesterday=new Date(Date.now()-86400000).toISOString();
   await store.save(limit.FILE,limit.key('post','legacy-never-written'),{user_id:'legacy-orphan',kind:'post',day:yesterday.slice(0,10),created_at:yesterday});
   await streak.recover('legacy-orphan');assert.equal((await store.getRawUser('legacy-orphan')).last_post_at,null,'orphan legacy reservation must not become publication history');
   const record={created_by:'legacy-orphan',encrypted_fields:{}};
   await limit.publish('legacy-orphan','post','legacy-first-real',record,()=>store.save('posts.json','legacy-first-real',record));
   assert.equal((await store.getRawUser('legacy-orphan')).streak,0);assert.equal(await score.get('legacy-orphan',generation),5);assert.equal((await store.getRawUser('legacy-orphan')).untouched,'preserve');
  `);
  console.log('PASS: orphan legacy reservations never seed a false first-post streak or bonus.');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
