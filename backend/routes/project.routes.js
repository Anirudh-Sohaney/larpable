const router=require('express').Router();
const auth=require('../auth');
const projects=require('../projects');
router.use(async(req,res,next)=>{
  try {
    req.user=await auth.getUserFromToken(req.cookies?.larpable_session);
    if(!req.user) return res.status(401).json({error:'Authentication required'});
    next();
  } catch(error) {next(error);}
});
router.get('/mine',async(req,res)=>{
  try {res.json({projects:await projects.mine(req.user.id)});}
  catch(error) {res.status(500).json({error:'Could not load projects'});}
});
router.post('/',async(req,res)=>{
  try {res.status(201).json({project:await projects.create(req.user.id,req.body)});}
  catch(error) {res.status(error.status || 500).json({error:error.status ? error.message : 'Could not create project'});}
});
router.patch('/:id',async(req,res)=>{
  try {res.json({project:await projects.update(req.params.id,req.user.id,req.body)});}
  catch(error) {res.status(error.status || 500).json({error:error.status ? error.message : 'Could not update project'});}
});
router.delete('/:id',async(req,res)=>{
  try {await projects.remove(req.params.id,req.user.id);res.json({ok:true});}
  catch(error) {res.status(error.status || 500).json({error:error.status ? error.message : 'Could not delete project'});}
});
module.exports=router;
