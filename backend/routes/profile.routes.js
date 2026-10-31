const router=require('express').Router();
const store=require('../store');const projects=require('../projects');const auth=require('../auth');
const {decryptObject}=require('../crypto');
const strings=value=>Array.isArray(value) ? value.filter(item=>typeof item==='string') : [];
// Public profiles are a projection of existing records, never a second user database.
router.get('/:id',async(req,res)=>{
  try{
    const user=await store.getRawUser(req.params.id);
    if(!user)return res.status(404).json({error:'Profile not found'});
    const fields=decryptObject(user.encrypted_fields || {});
    const name=[fields.first_name || fields.firstName,fields.last_name || fields.lastName].filter(Boolean).join(' ') || fields.username || 'Student';
    const experiences=(Array.isArray(fields.experiences) ? fields.experiences : []).filter(item=>item && typeof item==='object').map(item=>({
      type:item.type || '',title:item.title || '',company_name:item.company_name || '',description:item.description || '',skills:strings(item.skills)
    }));
    const owned=await projects.mine(req.params.id);
    const larpscore=await require('../larpscore').get(req.params.id,user.created_at);
    res.json({profile:{id:req.params.id,name,username:fields.username || '',larpscore,skills:strings(fields.skills),interests:strings(fields.interests),experiences},projects:owned});
  }catch(error){console.error('Public profile:',error);res.status(500).json({error:'Could not load profile'});}
});
router.get('/:id/projects/:projectId/posts',async(req,res)=>{
  try{
    const project=await projects.get(req.params.projectId);
    if(!project || project.created_by!==req.params.id || !await store.getRawUser(req.params.id))return res.status(404).json({error:'Project not found'});
    const user=await auth.getUserFromToken(req.cookies?.larpable_session);
    const [opportunities,posts]=await Promise.all([
      require('./opportunity.routes').listForFeed(user,false,project.id),require('../regular_posts').list(user,false,project.id)
    ]);
    res.json({posts:[...opportunities,...posts].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at))});
  }catch(error){console.error('Profile project posts:',error);res.status(500).json({error:'Could not load project posts'});}
});
module.exports=router;
