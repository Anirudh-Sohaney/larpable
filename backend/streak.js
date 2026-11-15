// Publication claims retain streak history even after a post is deleted.
const fs=require('node:fs/promises'),store=require('./store');
const WINDOW=168*60*60*1000;
const defaults=()=>({streak:0,last_post_at:null,streak_version:1});
function view(user,now=Date.now()){
 const last=Date.parse(user.last_post_at),deadline=last+WINDOW;
 return {streak:Number.isFinite(last)&&now<deadline ? user.streak || 0 : 0,
  last_post_at:user.last_post_at || null,streak_expires_at:Number.isFinite(last) ? new Date(deadline).toISOString() : null};
}
async function recover(userId){
 const [users,claims,posts,opportunities]=await Promise.all(['users.json','publication-days.json','posts.json','opportunities.json'].map(file=>store.read(file)));
 const ids=userId ? [userId] : Object.keys(users);
 if(ids.some(id=>users[id]&&!users[id].streak_version)){
  // Publish the complete backup exclusively; a crash may leave a temp file,
  // but can never leave a partial file at the permanent backup path.
  const backup=store.filePath('users.json.before-streak-v9.bak'),temp=backup+'.tmp.'+require('node:crypto').randomUUID();
  try{
   await fs.copyFile(store.filePath('users.json'),temp);
   try{await fs.link(temp,backup);}catch(error){if(error.code!=='EEXIST')throw error;}
  }finally{await fs.rm(temp,{force:true});}
 }
 await store.atomicUpdate('users.json',current=>{
  for(const id of ids){
   const user=current[id];if(!user)continue;
   const generation=user.created_at || '';
   if(!user.streak_version){
    // Seed legacy history only from persisted posts, never unverifiable reservations.
    // Versioned publications are replayed from their confirmed/source-backed claims below.
    const dates=[...Object.values(posts),...Object.values(opportunities)].filter(p=>!Number.isInteger(p.streak) && p.created_by===id && Date.parse(p.created_at)>= (Date.parse(generation)||0)).map(p=>p.created_at).filter(date=>Number.isFinite(Date.parse(date))).sort((a,b)=>Date.parse(b)-Date.parse(a));
    Object.assign(user,defaults(),{last_post_at:dates[0] || null});
   }
   const confirmed=Object.entries(claims).filter(([key,claim])=>{
    if(claim.user_id!==id || claim.account_created_at!==generation || !Number.isInteger(claim.streak))return false;
    const [kind,postId]=JSON.parse(key),source=(kind==='post' ? posts : opportunities)[postId];
    return claim.confirmed || (source?.created_by===id && source.created_at===claim.created_at && source.streak===claim.streak);
   }).map(([,claim])=>claim).sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at));
   for(const claim of confirmed)if(!user.last_post_at || Date.parse(claim.created_at)>Date.parse(user.last_post_at))Object.assign(user,{streak:claim.streak,last_post_at:claim.created_at});
   user.streak=view(user).streak;
  }
  return current;
 });
}
async function expire(){
 await store.atomicUpdate('users.json',users=>{for(const user of Object.values(users))if(user.streak_version)user.streak=view(user).streak;return users;});
}
module.exports={WINDOW,defaults,view,recover,expire};
