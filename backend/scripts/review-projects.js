// Read-only dataset access. --export writes a separate human-readable review copy.
const fs = require('node:fs/promises');
const path = require('node:path');
require('dotenv').config({path:path.resolve(__dirname,'../../.env'),quiet:true});
const store = require('../store');
const {decryptObject} = require('../crypto');
async function review() {
  const projects = await store.read('projects.json');
  const result = Object.fromEntries(Object.entries(projects).map(([id,project]) => {
    const {encrypted_fields,tag_source,tag_sources,...metadata} = project;
    return [id,{...metadata,...decryptObject(encrypted_fields)}];
  }));
  const output = JSON.stringify(result,null,2)+'\n';
  if (process.argv.includes('--export')) {
    const target = path.resolve(__dirname,'../../../projects-decrypted-review.json');
    await fs.writeFile(target,output);
    console.log('Exported '+Object.keys(result).length+' projects to '+target);
  } else process.stdout.write(output);
}
review().catch(err=>{console.error(err.message);process.exitCode=1;});
