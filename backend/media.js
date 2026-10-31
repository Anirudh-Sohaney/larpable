/** Binary files stay outside the web root; validated metadata and ownership live in media.json. */
const fs=require('node:fs/promises');
const {randomBytes}=require('node:crypto');
const store=require('./store');
const projects=require('./projects');
const MAX_BYTES=64*1024*1024;
const publicMedia=asset=>asset ? {id:asset.id,kind:asset.kind,mime:asset.mime,size:asset.size,duration:asset.duration || null,url:'/api/media/'+asset.id} : null;
async function inspect(bytes) {
  if(!Buffer.isBuffer(bytes) || !bytes.length || bytes.length>MAX_BYTES)throw projects.fail('Choose a file up to 64 MB');
  let mime;
  if(bytes.length>=24 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))mime='image/png';
  else if(bytes.length>=4 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255)mime='image/jpeg';
  else if(bytes.length>=13 && /^GIF8[79]a$/.test(bytes.subarray(0,6).toString()))mime='image/gif';
  else if(bytes.length>=16 && bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP')mime='image/webp';
  if(mime)return {kind:'image',mime};
  const {Input,BufferSource,MP4,WEBM,QTFF}=await import('mediabunny');
  const input=new Input({source:new BufferSource(bytes),formats:[MP4,WEBM,QTFF]});
  try {
    const track=await input.getPrimaryVideoTrack();
    if(!track)throw new Error('No video track');
    const duration=await input.computeDuration(undefined,{skipLiveWait:true});
    if(!Number.isFinite(duration) || duration<=0)throw new Error('Unknown duration');
    if(duration>60.000001)throw projects.fail('Videos must be 60 seconds or shorter');
    mime=(await input.getMimeType()).split(';')[0];
    return {kind:'video',mime,duration};
  }catch(error){if(error.status)throw error;throw projects.fail('Choose a PNG, JPEG, GIF, WebP image or a valid MP4, MOV, or WebM video');}
  finally{input.dispose();}
}
async function upload(userId,projectId,bytes) {
  return projects.withOwned(projectId,userId,async()=>{
    const info=await inspect(bytes);
    const assets=await store.read('media.json');
    const [posts,drafts]=await Promise.all([store.read('posts.json'),store.read('drafts.json')]);
    const used=new Set([...Object.values(posts),...Object.values(drafts)].map(p=>p.media_id));
    if(Object.values(assets).filter(a=>a.created_by===userId && !used.has(a.id)).length>=5)throw projects.fail('Finish or remove existing media uploads before uploading another file');
    const id='med_'+randomBytes(16).toString('hex');
    const asset={id,project_id:projectId,created_by:userId,created_at:new Date().toISOString(),size:bytes.length,...info};
    await fs.mkdir(store.filePath('media'),{recursive:true});
    await fs.writeFile(store.filePath('media/'+id),bytes,{flag:'wx'});
    try{await store.atomicUpdate('media.json',async data=>{await require('./deleted_users').requireActive(userId);data[id]=asset;return data;});}catch(error){await fs.unlink(store.filePath('media/'+id));throw error;}
    return publicMedia(asset);
  });
}
async function validateRef(id,userId,projectId) {
  if(id===null || id===undefined || id==='')return null;
  if(typeof id!=='string')throw projects.fail('Invalid media');
  const asset=await store.getById('media.json',id);
  if(!asset || asset.created_by!==userId || asset.project_id!==projectId)throw projects.fail('Media must belong to you and this project',403);
  await fs.access(store.filePath('media/'+asset.id));
  return asset;
}
async function releaseIfUnused(id) {
  if(!id)return false;
  const [posts,drafts]=await Promise.all([store.read('posts.json'),store.read('drafts.json')]);
  if([...Object.values(posts),...Object.values(drafts)].some(p=>p.media_id===id))return false;
  await store.remove('media.json',id);
  try{await fs.unlink(store.filePath('media/'+id));}catch(error){if(error.code!=='ENOENT')throw error;}
  return true;
}
async function cleanup() {
  const assets=await store.read('media.json');let removed=0;
  for(const a of Object.values(assets))if(Date.now()-Date.parse(a.created_at)>24*60*60*1000 && await releaseIfUnused(a.id))removed++;
  return removed;
}
module.exports={MAX_BYTES,inspect,upload,validateRef,releaseIfUnused,publicMedia,cleanup};
