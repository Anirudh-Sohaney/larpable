const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const listeners={},classes=new Set(),paneClasses=new Set();let wide=true;
const classList=set=>({add:n=>set.add(n),remove:n=>set.delete(n),contains:n=>set.has(n)});
const frame={src:'',title:''},pane={classList:classList(paneClasses),setAttribute(n,v){this[n]=v;}},close={addEventListener(){},setAttribute(){}};
const split={classList:classList(classes)};const elements={split,'detail-frame':frame,'detail-pane':pane,'detail-close':close};
const document={getElementById:id=>elements[id],addEventListener:(n,fn)=>listeners[n]=fn,querySelector:()=>null,querySelectorAll:()=>[]};
const location={href:'https://larpable.test/feed',origin:'https://larpable.test',search:'',replace(url){this.href=url;}};
const window={matchMedia:()=>({matches:wide}),addEventListener(){}};window.top=window;window.parent=window;
const panels=vm.runInNewContext(fs.readFileSync('web_app/js/panes.js','utf8')+';Panels;',{document,window,location,URL,URLSearchParams});panels.init();
for(const href of ['/post?id=p','/opportunity?id=p','/profile?id=u','/edit_profile','/create_student?edit=p','/create_student?edit_project=p'])assert.ok(panels.temporary(new URL(href,location.href)),href);
for(const href of ['/feed','/feed?mine=1','/feedback','/profile','/create_student','/create_student?new_project=1','/login','/agreement'])assert.ok(!panels.temporary(new URL(href,location.href)),href);
function click(href,{nav=false,ctrl=false,target='',returnLink=false}={}){
 const link={target,closest:()=>nav?{}:null,getAttribute:()=>href,hasAttribute:n=>n==='data-pane-return' && returnLink};
 const e={button:0,ctrlKey:ctrl,target:{closest:s=>s==='a[href]'?link:null},preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){}};listeners.click(e);return e;
}
click('/post?id=p');assert.ok(classes.has('is-open'));assert.equal(new URL(frame.src).pathname,'/post');assert.equal(location.href,'https://larpable.test/feed');assert.ok(paneClasses.has('is-loading'));
const oldFrame=frame.src;panels.navigate('/profile?id=u');assert.equal(new URL(frame.src).pathname,'/profile');
click('/feed?mine=1',{nav:true});assert.equal(location.href,'https://larpable.test/feed?mine=1','main tabs replace the entire screen');
assert.ok(!click('/profile?id=u',{ctrl:true}).defaultPrevented);assert.ok(!click('/profile?id=u',{target:'_blank'}).defaultPrevented);assert.ok(!click('https://external.test/profile').defaultPrevented);
const card={dataset:{paneHref:'/post?id=whole-card'},classList:{add(){}},focus(){this.focused=true;}};
const e={button:0,target:{closest:s=>s==='[data-pane-href]'||s==='.d-opp-card'||s==='a,[data-pane-href]'?card:null},preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){}};listeners.click(e);assert.equal(new URL(frame.src).searchParams.get('id'),'whole-card');
const control={button:0,target:{closest:s=>s.startsWith('button,')?{}:s==='[data-pane-href]'?card:null},preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){}};listeners.click(control);assert.ok(!control.defaultPrevented);
let replacements=0;frame.contentWindow={location:{href:frame.src,replace(href){this.href=href;replacements++;}}};
panels.navigate('/post?id=reuse');assert.equal(replacements,1);assert.equal(new URL(frame.contentWindow.location.href).searchParams.get('id'),'reuse');panels.navigate('/post?id=reuse');assert.equal(replacements,1,'repeated selection keeps the loaded view');delete frame.contentWindow;
const parent={document,location:{href:''}};window.parent=parent;panels.embedded=true;const savedFrame=frame.src;
panels.navigate('/profile?id=next');assert.equal(new URL(location.href).searchParams.get('embed'),'1');assert.equal(frame.src,savedFrame,'temporary content reuses the current iframe');
for(const href of ['/feed?mine=1','/feedback','/create_student','/profile','/login']){parent.location.href='';classes.add('is-open');panels.navigate(href);assert.equal(parent.location.href,new URL(href,location.origin).href);assert.ok(!classes.has('is-open'));assert.ok(!parent.location.href.includes('embed='));}
classes.add('is-open');click('/feed?mine=1',{returnLink:true});assert.ok(!classes.has('is-open'));assert.equal(parent.location.href,'https://larpable.test/feed?mine=1');
window.parent=window;panels.embedded=false;wide=false;panels.navigate('/post?id=phone');assert.equal(location.href,'https://larpable.test/post?id=phone');
classes.add('is-open');panels.close();assert.ok(!classes.has('is-open'));assert.equal(frame.src,'about:blank','closing unloads hidden media/editor content');assert.ok(card.focused);
assert.equal(pane['aria-hidden'],'true');
console.log('Temporary panes: content/edit routes, full-screen tab switching from parent/iframe, control exceptions, modifier links, cancel/save returns, narrow screens, focus restoration and unloading passed.');
