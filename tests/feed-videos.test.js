const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const document={hidden:false};
const player=vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../web_app/js/feed-videos.js'),'utf8')+'\nFeedVideos;',{document,Map,Promise});
const resolvers=[];
function video(name,top){return {name,top,full:false,paused:true,playCalls:0,pause(){this.paused=true;},play(){this.paused=false;this.playCalls++;return new Promise(resolve=>resolvers.push({video:this,resolve}));}};}
const a=video('a',0),b=video('b',150),c=video('c',300);
for(const v of [a,b,c])player.videos.set(v,{full:false,entered:0});
player.fullyVisible=v=>v.full;player.screenTop=v=>v.top;
const playing=()=>[a,b,c].filter(v=>!v.paused).map(v=>v.name);
const update=(full,direction=1)=>{for(const v of [a,b,c])v.full=full.includes(v);player.direction=direction;player.update();assert.ok(playing().length<=1);};
// Actual visibility math: clipped videos and navigation-covered media must wait.
const viewport={innerHeight:600,getComputedStyle:node=>node.style || {visibility:'visible',overflowX:'visible',overflowY:'visible'}};
const nav={getBoundingClientRect:()=>({top:530,bottom:590,left:200,right:600})};
const rootDoc={defaultView:viewport,documentElement:{clientWidth:800},querySelector:()=>nav};
const geometry=vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../web_app/js/feed-videos.js'),'utf8')+'\nFeedVideos;',{document:rootDoc,window:viewport,Map,Promise});
const box={top:100,bottom:300,left:100,right:500,width:400,height:200};
const visibleVideo={isConnected:true,ownerDocument:rootDoc,parentElement:null,getBoundingClientRect:()=>box};
assert.equal(geometry.fullyVisible(visibleVideo),true);
box.top=-1;assert.equal(geometry.fullyVisible(visibleVideo),false);box.top=100;
box.bottom=550;assert.equal(geometry.fullyVisible(visibleVideo),false,'floating navigation counts as obscuring the video');box.bottom=300;
visibleVideo.parentElement={style:{overflowY:'auto'},clientTop:0,clientHeight:100,getBoundingClientRect:()=>({top:50}),parentElement:null};
assert.equal(geometry.fullyVisible(visibleVideo),false,'a clipped scroll container is not full visibility');visibleVideo.parentElement=null;
rootDoc.fullscreenElement=visibleVideo;assert.equal(geometry.fullyVisible(visibleVideo),true);
rootDoc.fullscreenElement={};assert.equal(geometry.fullyVisible(visibleVideo),false,'only the fullscreen video can own playback');
rootDoc.fullscreenElement=null;
const registrationVideo={muted:true,defaultMuted:true,addEventListener(){}};
rootDoc.getElementById=()=>null;rootDoc.querySelectorAll=()=>[registrationVideo];
geometry.started=true;geometry.resizeObserver={observe(){}};geometry.schedule=()=>{};
geometry.refresh();assert.equal(registrationVideo.muted,false);assert.equal(registrationVideo.defaultMuted,false,'registered feed media defaults to sound on');
(async()=>{
  update([]);assert.deepEqual(playing(),[],'partial/offscreen videos do not start');
  update([a]);assert.deepEqual(playing(),['a'],'initial fully visible video autoplays');
  update([a,b]);assert.deepEqual(playing(),['b'],'a newly full video wins even while the old one remains full');
  update([b]);assert.deepEqual(playing(),['b']);
  update([a,b],-1);assert.deepEqual(playing(),['a'],'upward reentry takes focus too');
  update([a,b,c]);assert.deepEqual(playing(),['c']);
  update([a,b]);assert.deepEqual(playing(),['a'],'most recently entered remaining full video resumes');
  a.pause();const calls=a.playCalls;update([a,b]);assert.deepEqual(playing(),[]);assert.equal(a.playCalls,calls,'manual pause is preserved until focus changes');
  update([]);update([a,b,c],1);assert.deepEqual(playing(),['c'],'bottommost new entrant wins a down-scroll batch');
  update([]);update([a,b,c],-1);assert.deepEqual(playing(),['a'],'topmost new entrant wins an up-scroll batch');
  document.hidden=true;player.update();assert.deepEqual(playing(),[],'hidden tab stops playback');
  document.hidden=false;player.update();assert.deepEqual(playing(),['a'],'returning resumes just one');
  update([c]);assert.deepEqual(playing(),['c']);
  // Simulate a stale browser play promise completing after another video won.
  for(const pending of resolvers){if(pending.video!==c)pending.video.paused=false;pending.resolve();}
  await Promise.resolve();await Promise.resolve();
  assert.deepEqual(playing(),['c'],'late completion cannot restart a displaced video');
  player.focus(null);assert.deepEqual(playing(),[]);
  a.play=function(){this.playCalls++;return Promise.reject({name:'NotAllowedError'});};
  update([a]);await Promise.resolve();await Promise.resolve();
  assert.equal(player.blocked.has(a),true,'a browser sound-autoplay refusal is tracked');
  const blockedCalls=a.playCalls;player.retryAfterGesture({isTrusted:false});assert.equal(a.playCalls,blockedCalls,'synthetic events cannot unlock sound');
  a.play=function(){this.playCalls++;this.paused=false;return Promise.resolve();};
  player.retryAfterGesture({isTrusted:true});await Promise.resolve();assert.deepEqual(playing(),['a']);
  assert.equal(player.blocked.has(a),false);
  a.pause();const manualCalls=a.playCalls;player.retryAfterGesture({isTrusted:true});assert.equal(a.playCalls,manualCalls,'later clicks do not undo manual pause');
  player.focus(null);
  console.log('Feed video focus: full visibility, both scroll directions, batched entry, manual pause, hidden tabs, exclusive playback, stale promises, sound-on defaults and gesture retry passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
