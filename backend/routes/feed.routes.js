const router=require('express').Router();const auth=require('../auth');
router.use(async(req,res,next)=>{try{req.user=await auth.getUserFromToken(req.cookies?.larpable_session);next();}catch(error){next(error);}});
async function send(req,res,mine){
  try{
    if(mine && !req.user)return res.status(401).json({error:'Authentication required'});
    const [opportunities,posts]=await Promise.all([require('./opportunity.routes').listForFeed(req.user,mine),require('../regular_posts').list(req.user,mine)]);
    const rows=[...opportunities,...posts].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));
    res.json({posts:req.user ? rows : rows.slice(0,6),total:rows.length});
  }catch(error){console.error('Feed error:',error);res.status(500).json({error:'Could not load posts'});}
}
router.get('/',(req,res)=>send(req,res,false));router.get('/mine',(req,res)=>send(req,res,true));
module.exports=router;
