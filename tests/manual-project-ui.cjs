// Disposable browser fixture. Never reads or writes the real application dataset.
const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
(async()=>{
  const clock=require('./helpers/test-clock')(Date.now()-10*24*60*60*1000);
  const publish=async fn=>{const result=await fn();clock.advance();return result;};
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'larpable-project-ui-'));
  Object.assign(process.env,{DATA_DIR:dir,ENCRYPTION_KEY:'c'.repeat(64),NODE_ENV:'test',RESEND_API_KEY:'',HOST:'127.0.0.1',PORT:'9197'});
  const auth=require('../backend/auth');
  const owner=await auth.signup({username:'project_test',password:'local-test-pass',type:'student',profile:{first_name:'Test',last_name:'Owner',skills:['Web Development','Programming','Research'],interests:['Artificial Intelligence','Physics & Space','Chemistry & Materials'],grade:'11th',experiences:[{type:'project',title:'Community tools',description:'Built tools that help local students find mentors and collaborate on community projects.',skills:['Web Development']}]},legalAgreement:{terms_version:'2026-08-27',privacy_version:'2026-08-27',agreed_at:new Date().toISOString()},emailOptIn:false});
  const project=await require('../backend/projects').create(owner.userId,{type:'project',name:'Existing Community Project',elevator_pitch:'Tools for community collaboration',tags:['Web Development']});
  await require('../backend/projects').create(owner.userId,{type:'nonprofit',field:"Science & Research",name:'New Learning Initiative',elevator_pitch:'Community workshops for students',tags:['Teaching']});
  const user=await auth.getUserFromToken(owner.token);
  const autoplay=process.argv.includes('--autoplay');
  const asset=await require('../backend/media').upload(user.id,project.id,await fs.readFile(path.join(__dirname,autoplay ? 'fixtures/autoplay-wide.mp4' : 'fixtures/60-seconds.mp4')));
  await publish(()=>require('../backend/regular_posts').create(user,{project_id:project.id,title:'Community video update',content:'A short demo from our community project.',media_id:asset.id}));
  if(autoplay)for(const title of ['Second video update','Third video update','Fourth video update'])await publish(()=>require('../backend/regular_posts').create(user,{project_id:project.id,title,content:'A video for checking automatic playback handoffs.',media_id:asset.id}));
  const opportunity=await publish(()=>require('../backend/posts').create(user,{project_id:project.id,looking_for:'Workshop mentors',description:'Help students build community tools',skills:['Web Development','Programming','Research']}));
  if(process.argv.includes('--filters')){
    const studio=await require('../backend/projects').create(user.id,{type:'company',field:"Science & Research",name:'Web Studio',elevator_pitch:'Website tools for small teams',tags:['Web Development']});
    await publish(()=>require('../backend/posts').create(user,{project_id:studio.id,looking_for:'Web developers',description:'Improve tools for small teams',skills:['Web Development','Programming','Research'],opportunity_preference:'paid',remote:true}));
    const mentoring=await require('../backend/projects').create(user.id,{type:'nonprofit',field:"Science & Research",name:'City Mentoring',elevator_pitch:'Local mentoring programs for students',tags:['Teaching']});
    await publish(()=>require('../backend/posts').create(user,{project_id:mentoring.id,looking_for:'Volunteer mentors',description:'Support students through local workshops',skills:['Teaching','Research','Programming'],opportunity_preference:'volunteering',remote:false,location:'Bentonville, Arkansas',latitude:36.37,longitude:-94.2}));
  }
  await require('../backend/store').save('drafts.json','draft_fixture',{kind:'opportunity',user_id:owner.userId,project_id:project.id,type:project.type,fields:{looking_for:'Outreach volunteers',description:'Plan community workshops',skills:['Research']},created_at:new Date().toISOString(),updated_at:new Date().toISOString()});
  clock.restore();
  const {startServer}=require('../server');const server=startServer(9197);
  if(process.argv.includes('--profiles')){
    const other=await auth.signup({username:'project_other',password:'local-test-pass',type:'student',profile:{first_name:'Sam',last_name:'Builder',skills:['Research'],interests:[]},emailOptIn:false});
    await require('../backend/projects').create(other.userId,{type:'project',name:'Student research group',elevator_pitch:'Research projects for curious students',tags:['Research']});
    const post=async(url,body,token)=>(await fetch('http://127.0.0.1:9197'+url,{method:'POST',headers:{'Content-Type':'application/json',Cookie:'larpable_session='+token},body:JSON.stringify(body)})).json();
    const comment=await post('/api/opportunities/'+opportunity.id+'/comments',{text:'Excited to help with this project.'},other.token);
    await post('/api/opportunities/'+opportunity.id+'/comments/'+comment.comment.id+'/replies',{text:'Welcome to the project!'},owner.token);
    await post('/api/opportunities/'+opportunity.id+'/applications',{},other.token);
    if(process.argv.includes('--deleted-users'))await require('../backend/deleted_users').remove(other.userId);
    console.log('Synthetic public profile IDs:',owner.userId,other.userId);
  }
  console.log('Browser fixture: http://127.0.0.1:9197/login — project_test / local-test-pass; data '+dir);
  async function stop(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(dir,{recursive:true,force:true});process.exit(0);}
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
})().catch(error=>{console.error(error);process.exitCode=1});
