const express=require('express');
const router=express.Router();
const auth=require('../auth');const store=require('../store');const media=require('../media');const projects=require('../projects');
async function currentUser(req,res,next){try{req.user=await auth.getUserFromToken(req.cookies?.larpable_session);next();}catch(error){next(error);}}
router.use(currentUser);
router.post('/',(req,res,next)=>req.user ? next() : res.status(401).json({error:'Authentication required'}),express.raw({type:()=>true,limit:media.MAX_BYTES}),async(req,res)=>{
  try{res.status(201).json({media:await media.upload(req.user.id,req.query.project_id,req.body)});}
  catch(error){res.status(error.status || 500).json({error:error.status ? error.message : 'Could not upload media'});}
});
router.get('/:id',async(req,res)=>{
  try{
    if(!/^med_[a-f0-9]{32}$/.test(req.params.id))return res.sendStatus(404);
    const asset=await store.getById('media.json',req.params.id);
    if(!asset)return res.sendStatus(404);
    if(asset.created_by!==req.user?.id){
      const posts=await store.read('posts.json');
      if(!Object.values(posts).some(p=>p.media_id===asset.id && !p.flagged))return res.sendStatus(404);
    }
    res.type(asset.mime).set('X-Content-Type-Options','nosniff').set('Cache-Control','private, max-age=300');
    res.sendFile(store.filePath('media/'+asset.id),error=>{if(error && !res.headersSent)res.sendStatus(404);});
  }catch(error){res.sendStatus(500);}
});
router.delete('/:id',async(req,res)=>{
  if(!req.user)return res.status(401).json({error:'Authentication required'});
  try{
    const asset=await store.getById('media.json',req.params.id);
    if(!asset || asset.created_by!==req.user.id)return res.status(404).json({error:'Media not found'});
    await projects.withOwned(asset.project_id,req.user.id,async()=>{
      if(!await media.releaseIfUnused(asset.id))throw projects.fail('Media is in use by a post or draft',409);
    });
    res.json({ok:true});
  }catch(error){res.status(error.status || 500).json({error:error.status ? error.message : 'Could not remove media'});}
});
router.use((error,req,res,next)=>{if(error.type==='entity.too.large')return res.status(413).json({error:'Media must be 64 MB or smaller'});next(error);});
module.exports=router;
