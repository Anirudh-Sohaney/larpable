// One cleanup policy for self deletion, staff/admin deletion and interrupted deletion recovery.
const store=require('./store');const {decryptObject,encryptObject}=require('./crypto');
const fs=require('node:fs/promises');
const FILES=['opportunities.json','posts.json','applications.json','post-reactions.json','drafts.json','projects.json','sessions.json','feedback.json','staff.json','media.json','users.json'];
const same=require('node:util').isDeepStrictEqual;
async function snapshot(){return Object.fromEntries(await Promise.all(FILES.map(async file=>[file,await store.read(file)])));}
function plan(data){
  const users=data['users.json'] || {},patches={};let comments=0,replies=0;
  const gone=id=>!!id && id!=='admin_larpable' && (!Object.hasOwn(users,id) || users[id].deletion_pending);
  const set=(file,id,value)=>{(patches[file] ||= {})[id]=value;};
  const projects=new Set(Object.entries(data['projects.json'] || {}).filter(([,p])=>gone(p.created_by)).map(([id])=>id));
  for(const id of projects)set('projects.json',id,null);
  const removed={};
  for(const file of ['opportunities.json','posts.json']){
    removed[file]=new Set();
    for(const [id,post] of Object.entries(data[file] || {})){
      if(gone(post.created_by) || projects.has(post.project_id)){set(file,id,null);removed[file].add(id);continue;}
      const entries=decryptObject(post.encrypted_fields?.comments || []);let changed=false;
      for(const comment of entries){
        for(const [entry,isReply] of [[comment,false],...(comment.replies || []).map(reply=>[reply,true])]){
          if(gone(entry.user_id) || (entry.deleted_user && (entry.user_id!==null || entry.user_name!=='deleted user'))){
            entry.user_id=null;entry.user_name='deleted user';entry.deleted_user=true;
            delete entry.username;delete entry.can_edit;delete entry.can_delete;
            changed=true;if(isReply)replies++;else comments++;
          }
        }
      }
      if(changed)set(file,id,{...post,encrypted_fields:{...post.encrypted_fields,comments:encryptObject(entries)}});
    }
  }
  for(const [id,entries] of Object.entries(data['applications.json'] || {})){
    if(!data['opportunities.json']?.[id] || removed['opportunities.json'].has(id)){set('applications.json',id,null);continue;}
    const next=Object.fromEntries(Object.entries(entries).filter(([userId])=>!gone(userId)));
    if(!same(entries,next))set('applications.json',id,Object.keys(next).length ? next : null);
  }
  for(const [id,entries] of Object.entries(data['post-reactions.json'] || {})){
    if(!data['posts.json']?.[id] || removed['posts.json'].has(id)){set('post-reactions.json',id,null);continue;}
    const next=Object.fromEntries(Object.entries(entries).filter(([userId])=>!gone(userId)));
    if(!same(entries,next))set('post-reactions.json',id,Object.keys(next).length ? next : null);
  }
  for(const [id,draft] of Object.entries(data['drafts.json'] || {}))if(gone(draft.user_id) || projects.has(draft.project_id))set('drafts.json',id,null);
  for(const [id,session] of Object.entries(data['sessions.json'] || {}))if(gone(session.user_id))set('sessions.json',id,null);
  const feedback=data['feedback.json'] || {};
  for(const key of ['records','post_prompts'])if(feedback[key]){
    const next=Object.fromEntries(Object.entries(feedback[key]).filter(([id,record])=>!gone(key==='records' ? record.user_id : id)));
    if(!same(next,feedback[key]))set('feedback.json',key,next);
  }
  for(const key of ['staff_members','user_goals','staff_portal_opens'])if(data['staff.json']?.[key]){
    const next=Object.fromEntries(Object.entries(data['staff.json'][key]).filter(([id])=>!gone(id)));
    if(!same(next,data['staff.json'][key]))set('staff.json',key,next);
  }
  const referenced=new Set([...Object.entries(data['posts.json'] || {}).filter(([id])=>!removed['posts.json'].has(id)).map(([,p])=>p.media_id),...Object.values(data['drafts.json'] || {}).filter(d=>!gone(d.user_id) && !projects.has(d.project_id)).map(d=>d.media_id)]);
  for(const [id,asset] of Object.entries(data['media.json'] || {}))if(gone(asset.created_by) && !referenced.has(id))set('media.json',id,null);
  for(const [id,user] of Object.entries(users))if(user.deletion_pending)set('users.json',id,null);
  return {patches,comments,replies};
}
async function run({dryRun=false}={}){
  const data=await snapshot(),initial=plan(data);
  if(['projects.json','opportunities.json','posts.json'].some(file=>Object.values(data[file]).some(record=>record.created_by))){
    try{await fs.access(store.filePath('users.json'));}catch(error){
      if(error.code!=='ENOENT')throw error;
      if(dryRun)return {records_changed:{},comments_anonymized:0,replies_anonymized:0,blocked:'users.json is missing'};
      throw new Error('Deleted-user cleanup requires users.json; refusing to infer deletion from a missing user collection');
    }
  }
  const report={records_changed:Object.fromEntries(Object.entries(initial.patches).map(([file,entries])=>[file,Object.keys(entries).length])),comments_anonymized:initial.comments,replies_anonymized:initial.replies};
  if(dryRun)return report;
  for(const file of FILES){
    if(!Object.keys(initial.patches[file] || {}).length)continue;
    if(file==='media.json'){
      for(const id of Object.keys(plan(data).patches[file])){
        await require('./media').releaseIfUnused(id);
      }
      data[file]=await store.read(file);continue;
    }
    data[file]=await store.atomicUpdate(file,current=>{
      const changes=plan({...data,[file]:current}).patches[file] || {};
      for(const [id,value] of Object.entries(changes)){if(value===null)delete current[id];else current[id]=value;}
      return current;
    });
  }
  return report;
}
let pending=Promise.resolve();
function remove(userId){
  const operation=pending.catch(()=>{}).then(async()=>{
    await store.atomicUpdate('users.json',users=>{if(users[userId])users[userId].deletion_pending=true;return users;});
    // Finish queued mutations that authenticated before the marker. Later creates recheck it.
    await store.flush();
    return run();
  });
  pending=operation;return operation;
}
async function requireActive(userId){
  if(userId==='admin_larpable')return;
  const user=await store.getRawUser(userId);
  if(!user || user.deletion_pending)throw Object.assign(new Error('Account is no longer active'),{status:401,expectedStoreConflict:true});
}
async function resumePending(){
  const users=await store.read('users.json');
  if(Object.values(users).some(user=>user.deletion_pending))return run();
  return {records_changed:{},comments_anonymized:0,replies_anonymized:0};
}
module.exports={FILES,plan,run,remove,requireActive,resumePending};
