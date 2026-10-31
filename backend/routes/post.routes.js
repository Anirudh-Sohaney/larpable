const router=require('express').Router();const auth=require('../auth');const posts=require('../regular_posts');
async function optionalAuth(req,res,next){try{req.user=await auth.getUserFromToken(req.cookies?.larpable_session);next();}catch(error){next(error);}}
async function requireAuth(req,res,next){await optionalAuth(req,res,()=>req.user ? next() : res.status(401).json({error:'Authentication required'}));}
const handle=fn=>async(req,res)=>{try{res.json(await fn(req));}catch(error){if(!error.status)console.error('Post error:',error);res.status(error.status || 500).json({error:error.status ? error.message : 'Could not process post'});}};
router.get('/',optionalAuth,handle(async req=>{const all=await posts.list(req.user);const rows=req.user ? all : all.sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)).slice(0,6);return {posts:rows,total:all.length};}));
router.get('/mine',requireAuth,handle(async req=>({posts:await posts.list(req.user,true)})));
router.post('/',requireAuth,handle(req=>posts.create(req.user,req.body)));
router.get('/:id',optionalAuth,handle(req=>posts.get(req.params.id,req.user)));
router.patch('/:id',requireAuth,handle(req=>posts.update(req.params.id,req.user,req.body)));
router.delete('/:id',requireAuth,handle(req=>posts.remove(req.params.id,req.user)));
router.post('/:id/like',requireAuth,handle(req=>posts.like(req.params.id,req.user,true)));
router.delete('/:id/like',requireAuth,handle(req=>posts.like(req.params.id,req.user,false)));
router.use(require('./comments.routes').commentsRouter(posts.FILE,requireAuth));
module.exports=router;
