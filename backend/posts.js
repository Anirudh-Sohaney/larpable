const {randomBytes}=require('node:crypto');
const projects=require('./projects');
const {encryptObject}=require('./crypto');
const {sanitizeObject}=require('./sanitize');
const {normalizeSkills,normalizeField}=require('./canonical');
const {validatePostContent}=require('./post_content');
const {scanFields,applyFlag}=require('./profanity');
const PREFERENCES=new Set(['volunteering','paid','unpaid']);
const DEFAULTS={project:'unpaid',nonprofit:'volunteering',company:'paid'};
async function create(user,input) {
  return projects.withOwned(input.project_id,user.id,async project=>{
  // Identity and type are always derived from the project, never client titles.
  const clean=sanitizeObject(input);
  const error=validatePostContent({skills:clean.skills,description:clean.description,requireSkills:true});
  if(error)throw projects.fail(error);
  const preference=clean.opportunity_preference || DEFAULTS[project.type];
  if(!PREFERENCES.has(preference))throw projects.fail('Invalid opportunity preference');
  const profile=user.encrypted_fields || {};
  const fields={
    description:clean.description || '',looking_for:clean.looking_for || '',
    issuer_name:[profile.firstName || profile.first_name,profile.lastName || profile.last_name].filter(Boolean).join(' ') || 'Student',
    issuer_context:profile.grade || '',location:clean.location || '',remote:clean.remote !== undefined ? clean.remote : true,
    latitude:clean.latitude || null,longitude:clean.longitude || null,
    contact_links:Array.isArray(clean.contact_links) ? clean.contact_links.filter(l=>typeof l==='string' && l.trim()) : (typeof clean.contact==='string' ? [clean.contact] : []),
    skills:normalizeSkills(clean.skills),details:clean.details || '',opportunity_preference:preference
  };
  const promoted=await require('./promotion').value(input.promoted,user.id,user.id);
  const record={promoted,project_id:project.id,type:project.type,created_by:user.id,created_at:new Date().toISOString()};
  const scan=scanFields(fields);applyFlag(record,scan,record.created_at);
  record.encrypted_fields=encryptObject(fields);
  const id='opp_'+randomBytes(12).toString('hex');
  await require('./publication_limit').publish(user.id,'opportunity',id,record,()=>require('./store').atomicUpdate('opportunities.json',async data=>{
    await require('./deleted_users').requireActive(user.id);data[id]=record;return data;
  }));
  return {id,record,scan};
  });
}
module.exports={create};
