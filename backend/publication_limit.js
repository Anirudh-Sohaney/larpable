const store=require('./store');
const FILE='publication-days.json';
const streak=require('./streak');
const DAY=24*60*60*1000;
const pending=new Map();
const key=(kind,id)=>JSON.stringify([kind,id]);
function dayOf(value){const time=Date.parse(value);return Number.isFinite(time) ? new Date(time).toISOString().slice(0,10) : null;}
// Shared across project locks and both post types. Never refund a successful publication on deletion.
function publish(userId,kind,id,record,writePost){
  const task=(pending.get(userId) || Promise.resolve()).catch(()=>{}).then(async()=>{
    await streak.recover(userId);
    const user=await store.getRawUser(userId);
    const now=new Date().toISOString(),day=dayOf(now);
    const [ledger,opportunities,posts]=await Promise.all([store.read(FILE),store.read('opportunities.json'),store.read('posts.json')]);
    const used=Object.values(ledger).some(entry=>entry.user_id===userId && entry.day===day) ||
      [...Object.values(opportunities),...Object.values(posts)].some(post=>post.created_by===userId && dayOf(post.created_at)===day);
    if(used){
      const reset=new Date(Date.parse(day+'T00:00:00Z')+DAY).toISOString();
      throw Object.assign(new Error(`You can publish one post per UTC day. You can post again at ${reset.slice(0,10)} 00:00 UTC. Drafts and edits are still available.`),{status:429,expectedStoreConflict:true});
    }
    const claim=key(kind,id);
    record.created_at=now;
    record.streak=user?.last_post_at && Date.parse(now)-Date.parse(user.last_post_at)<streak.WINDOW ? (user.streak || 0)+1 : 0;
    const entry={user_id:userId,kind,day,created_at:now,streak:record.streak,account_created_at:user?.created_at || '',confirmed:false};
    await store.save(FILE,claim,entry);
    try{
      const result=await writePost();
      await store.save(FILE,claim,{...entry,confirmed:true});
      await streak.recover(userId);
      return result;
    }
    catch(error){
      // A failed write does not consume the day. If a post did persist, keep its claim.
      try{
        if(await store.getById(kind==='post' ? 'posts.json' : 'opportunities.json',id)){
          await store.save(FILE,claim,{...entry,confirmed:true});
          await streak.recover(userId);
        }else await store.remove(FILE,claim);
      }
      catch(cleanupError){console.error('Publication claim retained after storage failure:',cleanupError.message);}
      throw error;
    }
  });
  pending.set(userId,task);const done=()=>{if(pending.get(userId)===task)pending.delete(userId);};task.then(done,done);return task;
}
module.exports={FILE,DAY,key,dayOf,publish};
