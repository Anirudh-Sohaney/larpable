/** Tell Google's Indexing API about new, changed and removed public opportunity pages.
 * Enabled only when GOOGLE_INDEXING_KEY_FILE points to a service-account JSON key whose account is an
 * Owner of the Search Console property. indexing.json records what Google was last told, so every server
 * (local or Oracle) derives its own work from its own data, and failed or over-quota runs resume next tick.
 */
const {createHash}=require('node:crypto');
const store=require('./store');
const {jobPosting}=require('./seo');

const FILE='indexing.json';
const ENDPOINT='https://indexing.googleapis.com/v3/urlNotifications:publish';
let client,running=null;

async function publish(url,type) {
  client ||= await new (require('google-auth-library').GoogleAuth)({keyFile:process.env.GOOGLE_INDEXING_KEY_FILE,scopes:['https://www.googleapis.com/auth/indexing']}).getClient();
  await client.request({url:ENDPOINT,method:'POST',data:{url,type}});
}

async function run() {
  const sent=await store.read(FILE),live={},done={};
  for (const opp of await store.getAllOpportunities(null,{approvedOnly:true})) {
    const posting=await jobPosting(opp);
    live[opp.id]={url:posting.url,hash:createHash('sha256').update(JSON.stringify(posting)).digest('hex')};
  }
  try {
    // Removed or held posts 404 / carry noindex, as URL_DELETED requires. Renamed URLs 301 to the new one.
    for (const [id,entry] of Object.entries(sent)) if (!live[id]) { await publish(entry.url,'URL_DELETED'); done[id]=null; }
    for (const [id,entry] of Object.entries(live)) if (sent[id]?.hash!==entry.hash) { await publish(entry.url,'URL_UPDATED'); done[id]=entry; }
  } finally {
    if (Object.keys(done).length) await store.atomicUpdate(FILE,data=>{
      for (const [id,entry] of Object.entries(done)) entry ? data[id]=entry : delete data[id];
      return data;
    });
  }
}

function sync() {
  if (!process.env.GOOGLE_INDEXING_KEY_FILE) return Promise.resolve();
  return running ||= run().catch(error=>console.error('[indexing]',error.message)).finally(()=>{running=null;});
}

module.exports={sync,FILE};
