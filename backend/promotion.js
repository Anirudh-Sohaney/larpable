// Authorization always reads the stored account, never a client profile or role.
const store=require('./store');const {decryptObject}=require('./crypto');
async function canPromote(userId){
 const user=await store.getRawUser(userId);
 return !!user && !user.deletion_pending && decryptObject(user.encrypted_fields || {}).username==='anisohaney';
}
async function value(input,userId,ownerId,previous=false){
 if(input===undefined)return previous===true;
 const fail=(message,status)=>{throw Object.assign(new Error(message),{status,expectedStoreConflict:true});};
 if(typeof input!=='boolean')fail('Promoted must be a boolean',400);
 if(userId!==ownerId || !await canPromote(userId))fail('Not authorized to promote this post',403);
 return input;
}
module.exports={value,canPromote};
