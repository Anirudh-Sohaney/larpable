// Stable event identities prevent duplicate awards. No content or private profile fields are copied.
const store=require('./store');const {decryptObject}=require('./crypto');
const FILE='larpscore-events.json',DAY=24*60*60*1000;
const SOURCES=['opportunities.json','posts.json','post-reactions.json','applications.json'];
const eventKey=(...parts)=>JSON.stringify(parts);
const iso=(value,fallback)=>Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : fallback;
async function snapshot(){
  const files=[...SOURCES,'users.json'];const values=await Promise.all(files.map(file=>store.read(file)));
  return Object.fromEntries(files.map((file,index)=>[file,values[index]]));
}
function events(data,at=new Date().toISOString()){
  const found={};const users=data['users.json'] || {};
  const award=(id,points)=>id && Object.hasOwn(users,id) ? {user_id:id,points,account_created_at:users[id].created_at || ''} : null;
  const add=(key,type,createdAt,awards)=>{
    awards=awards.filter(Boolean);if(awards.length)found[key]={type,created_at:iso(createdAt,at),awards};
  };
  for(const [kind,file] of [['opportunity','opportunities.json'],['post','posts.json']])for(const [id,post] of Object.entries(data[file] || {})){
    const owner=post.created_by;if(!owner || post.flagged)continue;
    add(eventKey('post',kind,id),'post',post.created_at,[award(owner,5)]);
    if(kind==='post')for(const [liker,createdAt] of Object.entries(data['post-reactions.json']?.[id] || {}))if(liker!==owner && createdAt){
      add(eventKey('like',id,liker),'like',createdAt,[award(owner,3)]);
    }
    if(kind==='opportunity')for(const [applicant,entry] of Object.entries(data['applications.json']?.[id] || {}))if(applicant!==owner){
      add(eventKey('application',id,applicant),'application',entry.applied_at,[award(owner,3)]);
    }
    const fields={comments:decryptObject(post.encrypted_fields?.comments || [])};
    for(const comment of Array.isArray(fields.comments) ? fields.comments : []){
      if(!comment?.id || (!comment.user_id && !comment.deleted_user) || comment.user_id===owner)continue;
      add(eventKey('comment',kind,id,comment.id),'comment',comment.created_at,[award(owner,2),award(comment.user_id,1)]);
      for(const reply of Array.isArray(comment.replies) ? comment.replies : [])if(reply?.id && (reply.user_id || reply.deleted_user) && reply.user_id!==comment.user_id){
        add(eventKey('reply',kind,id,comment.id,reply.id),'reply',reply.created_at,[award(comment.user_id,2)]);
      }
    }
  }
  return found;
}
function activate(previous,event){
  return {...event,active:true,retained:!!previous?.retained,removed_at:null};
}
function retire(previous,at){
  return {...previous,active:false,removed_at:at,retained:!!previous.retained || Date.parse(at)-Date.parse(previous.created_at)>=DAY};
}
function changes(before,after,ledger,at){
  const updates={};
  for(const [key,event] of Object.entries(after))if(!Object.hasOwn(before,key)){
    const previous=ledger[key];
    if(!previous || !previous.active)updates[key]=activate(previous,previous?.retained ? previous : event);
  }
  for(const key of Object.keys(before))if(!Object.hasOwn(after,key)){
    // If the first observation is a deletion, credit its stored history before applying the window.
    const previous=ledger[key] || activate(null,before[key]);
    if(previous.active)updates[key]=retire(previous,at);
  }
  return updates;
}
async function capture(file,before,after,at=new Date().toISOString()){
  if(!SOURCES.includes(file))return;
  const ids=[...new Set([...Object.keys(before),...Object.keys(after)])].filter(id=>!require('node:util').isDeepStrictEqual(before[id],after[id]));
  if(!ids.length)return;
  const select=records=>Object.fromEntries(ids.filter(id=>Object.hasOwn(records,id)).map(id=>[id,records[id]]));
  const data={};
  data['users.json']=await store.read('users.json');
  const parent=file==='post-reactions.json' ? 'posts.json' : file==='applications.json' ? 'opportunities.json' : file;
  if(parent!==file)data[parent]=select(await store.read(parent));
  const related=parent==='posts.json' ? 'post-reactions.json' : 'applications.json';
  if(related!==file)data[related]=select(await store.read(related));
  before=select(before);after=select(after);
  const previous=events({...data,[file]:before},at),current=events({...data,[file]:after},at);
  if(Object.keys(previous).every(key=>Object.hasOwn(current,key)) && Object.keys(current).every(key=>Object.hasOwn(previous,key)))return;
  await store.atomicUpdate(FILE,ledger=>Object.assign(ledger,changes(previous,current,ledger,at)));
}
function reconcile(current,ledger,at){
  const updates={};
  for(const [key,event] of Object.entries(current))if(!ledger[key] || !ledger[key].active)updates[key]=activate(ledger[key],ledger[key]?.retained ? ledger[key] : event);
  for(const [key,event] of Object.entries(ledger))if(event.active && !Object.hasOwn(current,key))updates[key]=retire(event,at);
  return updates;
}
function total(userId,accountCreatedAt,ledger){
  let score=0;
  for(const event of Object.values(ledger))if(event.active || event.retained)for(const award of event.awards || []){
    if(award.user_id===userId && award.account_created_at===(accountCreatedAt || ''))score+=award.points;
  }
  return score;
}
async function get(userId,accountCreatedAt){return total(userId,accountCreatedAt,await store.read(FILE));}
async function recover(){
  const at=new Date().toISOString(),data=await snapshot();
  let updated=0;
  await store.atomicUpdate(FILE,ledger=>{
    const updates=reconcile(events(data,at),ledger,at);
    updated=Object.keys(updates).length;
    return Object.assign(ledger,updates);
  });
  return {score_events_updated:updated};
}
module.exports={FILE,DAY,SOURCES,snapshot,events,changes,reconcile,total,get,capture,recover};
