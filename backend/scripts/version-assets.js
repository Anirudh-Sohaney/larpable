// Version local JS/CSS references by content so cached scripts cannot mix with new HTML.
const fs=require('node:fs');const path=require('node:path');const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'../..');
function files(directory){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(directory,entry.name)):[path.join(directory,entry.name)]);}
function version(html,file){
  return html.replace(/\b(src|href)=(['"])([^'"\s]+\.(?:js|css)(?:\?[^'"\s]*)?(?:#[^'"\s]*)?)\2/gi,(attribute,key,quote,url)=>{
    if(/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url))return attribute;
    const [resource,fragment]=url.split('#'),[pathname,query]=resource.split('?');
    const target=pathname.startsWith('/staff/')?path.join(root,pathname):pathname.startsWith('/')?path.join(root,'web_app',pathname):path.resolve(path.dirname(file),pathname);
    if(!target.startsWith(root+path.sep) || !fs.existsSync(target))throw Error('Missing local asset: '+pathname+' in '+path.relative(root,file));
    const digest=createHash('sha256').update(fs.readFileSync(target)).digest('hex').slice(0,12);
    const params=new URLSearchParams(query || '');params.set('v',digest);
    return key+'='+quote+pathname+'?'+params.toString()+(fragment?'#'+fragment:'')+quote;
  });
}
function run(check=false){
  const changed=[];
  for(const file of [...files(path.join(root,'web_app')),...files(path.join(root,'staff'))].filter(file=>file.endsWith('.html'))){
    const before=fs.readFileSync(file,'utf8'),after=version(before,file);
    if(after!==before){changed.push(path.relative(root,file));if(!check)fs.writeFileSync(file,after);}
  }
  if(check && changed.length)throw Error('Asset versions are stale; run npm run version:assets: '+changed.join(', '));
  console.log('Content-based asset versions: '+(check?'all current':changed.length+' HTML files updated'));
}
if(require.main===module)try{run(process.argv.includes('--check'));}catch(error){console.error(error.message);process.exitCode=1;}
module.exports={version,run};
