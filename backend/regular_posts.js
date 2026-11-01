/** Regular project posts. Text/comments are encrypted; reactions are a separate idempotent ledger. */
const {randomBytes}=require('node:crypto');
const store=require('./store');const projects=require('./projects');const media=require('./media');
const {encryptObject,decryptObject}=require('./crypto');const {sanitizeObject}=require('./sanitize');const {scanFields}=require('./profanity');
const {addCommentPermissions}=require('./routes/comments.routes');
const FILE='posts.json',REACTIONS='post-reactions.json';
function validate(input) {
  if(typeof input.title!=='string' || typeof input.content!=='string')throw projects.fail('Title and content are required');
  const fields=sanitizeObject({title:input.title,content:input.content});
  const words=fields.title ? fields.title.split(/\s+/).length : 0;
  if(words<1 || words>10 || fields.title.length>130)throw projects.fail('Title must be 1–10 words and at most 130 characters');
  if(!fields.content.length || fields.content.length>300)throw projects.fail('Content must be 1–300 characters');
  if(scanFields({title:fields.title,description:fields.content}).flagged)throw projects.fail('Please revise the post wording before saving');
  return fields;
}
function visible(raw,user){return raw && (!raw.flagged || raw.created_by===user?.id || user?.id==='admin_larpable');}
function author(user){const f=user.encrypted_fields || {};return [f.first_name || f.firstName,f.last_name || f.lastName].filter(Boolean).join(' ') || f.username || 'Student';}
const pending=new Map();
function withPost(id,operation){const result=(pending.get(id) || Promise.resolve()).catch(()=>{}).then(operation);pending.set(id,result);const done=()=>{if(pending.get(id)===result)pending.delete(id);};result.then(done,done);return result;}
async function create(user,input) {
  const fields=validate(input);
  const promoted=await require('./promotion').value(input.promoted,user.id,user.id);
  return projects.withOwned(input.project_id,user.id,async()=>{
    const asset=await media.validateRef(input.media_id,user.id,input.project_id);
    const id='post_'+randomBytes(12).toString('hex');
    const raw={id,promoted,kind:'post',schema_version:1,project_id:input.project_id,created_by:user.id,created_at:new Date().toISOString(),media_id:asset?.id || null,
      encrypted_fields:encryptObject({...fields,issuer_name:author(user),issuer_context:user.encrypted_fields?.grade || '',comments:[]})};
    await require('./publication_limit').publish(user.id,'post',id,raw,()=>store.atomicUpdate(FILE,async data=>{
      await require('./deleted_users').requireActive(user.id);data[id]=raw;return data;
    }));
    return {id};
  });
}
async function context(){const [p,r,m]=await Promise.all([store.read('projects.json'),store.read(REACTIONS),store.read('media.json')]);return {projects:p,reactions:r,media:m};}
function present(id,raw,user,ctx,fields=decryptObject(raw.encrypted_fields)) {
  const parent=ctx.projects[raw.project_id];const project=parent ? projects.publicProject(raw.project_id,parent) : null;
  const comments=Array.isArray(fields.comments) ? fields.comments : [];
  const unread=comments.filter(c=>c.read_by_op===false);
  const reply=comments.find(c=>c.user_id===user?.id && (c.replies || []).some(r=>r.read_by_parent_author===false));
  return {id,promoted:raw.promoted===true,kind:'post',project_id:raw.project_id,project,project_name:project?.fields.name || 'Project unavailable',type:project?.type || 'project',created_by:raw.created_by,created_at:raw.created_at,
    title:fields.title,content:fields.content,description:fields.content,issuer_name:fields.issuer_name || '',issuer_context:fields.issuer_context || '',
    skills:project?.fields.tags || [],remote:true,media:media.publicMedia(ctx.media[raw.media_id]),
    like_count:Object.keys(ctx.reactions[id] || {}).length,liked:!!ctx.reactions[id]?.[user?.id],comment_count:comments.length,
    flagged:!!raw.flagged,has_unread_comments:!!user && user.id===raw.created_by && !!unread.length,unread_reply_comment_id:reply?.id || null,
    latest_notification_at:user?.id===raw.created_by ? unread.reduce((at,c)=>c.created_at>at ? c.created_at : at,'') : ''};
}
async function list(user,mine=false,projectId=null) {
  const [data,ctx]=await Promise.all([store.read(FILE),context()]);
  return Object.entries(data).filter(([,raw])=>(!projectId || raw.project_id===projectId) && (mine ? raw.created_by===user.id : !raw.flagged)).map(([id,raw])=>present(id,raw,user,ctx));
}
async function get(id,user,markSeen=true) {
  const raw=await store.getById(FILE,id);if(!visible(raw,user))throw projects.fail('Post not found',404);
  const fields=decryptObject(raw.encrypted_fields);const comments=fields.comments || [];
  if(user && markSeen && comments.some(c=>(user.id===raw.created_by && c.read_by_op===false) || (c.user_id===user.id && (c.replies || []).some(r=>r.read_by_parent_author===false)))){
    const ids=new Set(comments.map(c=>c.id));const replies=new Map(comments.map(c=>[c.id,new Set((c.replies || []).map(r=>r.id))]));
    await store.atomicUpdate(FILE,current=>{
      const latest=current[id];if(!latest)return current;
      const f=decryptObject(latest.encrypted_fields);
      for(const c of f.comments || []){
        if(user.id===latest.created_by && ids.has(c.id))c.read_by_op=true;
        if(c.user_id===user.id)for(const r of c.replies || [])if(replies.get(c.id)?.has(r.id))r.read_by_parent_author=true;
      }
      latest.encrypted_fields=encryptObject(f);return current;
    });
    for(const c of comments){if(user.id===raw.created_by)c.read_by_op=true;if(c.user_id===user.id)for(const r of c.replies || [])r.read_by_parent_author=true;}
  }
  addCommentPermissions(comments,user);
  return {...present(id,raw,user,await context(),fields),fields,issuer:{name:fields.issuer_name || 'Student'}};
}
async function update(id,user,input) {
  return withPost(id,async()=>{
    const raw=await store.getById(FILE,id);
    if(!raw)throw projects.fail('Post not found',404);
    if(raw.created_by!==user.id && user.id!=='admin_larpable')throw projects.fail('Not authorized',403);
    if(input.project_id!==undefined && input.project_id!==raw.project_id)throw projects.fail('A published post cannot change projects');
    return projects.withOwned(raw.project_id,raw.created_by,async()=>{
      const fields=validate({...decryptObject(raw.encrypted_fields),...input});
      const nextMedia=input.media_id===undefined ? raw.media_id : (await media.validateRef(input.media_id,raw.created_by,raw.project_id))?.id || null;
      await store.atomicUpdate(FILE,async data=>{if(!data[id])throw projects.fail('Post not found',404);data[id].promoted=await require('./promotion').value(input.promoted,user.id,data[id].created_by,data[id].promoted);const f=decryptObject(data[id].encrypted_fields);data[id].encrypted_fields=encryptObject({...f,...fields});data[id].media_id=nextMedia;data[id].updated_at=new Date().toISOString();return data;});
      if(raw.media_id!==nextMedia)await media.releaseIfUnused(raw.media_id);
      return {ok:true};
    });
  });
}
async function remove(id,user) {
  return withPost(id,async()=>{
    const raw=await store.getById(FILE,id);if(!raw)throw projects.fail('Post not found',404);
    if(raw.created_by!==user.id && user.id!=='admin_larpable')throw projects.fail('Not authorized',403);
    return projects.withOwned(raw.project_id,raw.created_by,async()=>{
      await store.remove(FILE,id);await store.remove(REACTIONS,id);await media.releaseIfUnused(raw.media_id);return {ok:true};
    });
  });
}
async function like(id,user,liked) {
  return withPost(id,async()=>{
    if(!visible(await store.getById(FILE,id),user))throw projects.fail('Post not found',404);
    let result;
    await store.atomicUpdate(REACTIONS,async data=>{await require('./deleted_users').requireActive(user.id);const entries=data[id] ||= {};if(liked)entries[user.id]=entries[user.id] || new Date().toISOString();else delete entries[user.id];result={liked,like_count:Object.keys(entries).length};if(!result.like_count)delete data[id];return data;});
    return result;
  });
}
module.exports={FILE,REACTIONS,validate,create,list,get,update,remove,like,visible};
