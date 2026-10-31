const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const elements={};
for(const id of ['q','f-sort','f-pay','f-kind','f-location','clear','list','count','yours-controls'])elements[id]={value:id==='f-sort' ? 'foryou' : '',innerHTML:'',classList:{toggle(){}},addEventListener(name,handler){this[name]=handler;},removeAttribute(){}};
const context=vm.createContext({document:{getElementById:id=>elements[id],body:{classList:{toggle(){}}}},window:{location:{search:''}},URLSearchParams,DataStore:{getCurrentUser:()=>({id:'user'})}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../web_app/js/filters.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../web_app/js/feed.js'),'utf8')+'\nthis.filters=Filters;this.feed=Feed;',context);
const {filters,feed}=context;
const specs=[
  ['pr','paid','remote'],['pi','paid','inperson'],['ur','unpaid','remote'],['vi','unpaid','inperson'],['vr','unpaid','remote'],['lc','paid','inperson'],['unknown','unpaid',''],['post','','']
];
const rows=specs.map(([id,pay,location],index)=>({id,kind:id==='post' ? 'post' : 'opportunity',type:id==='lc' ? 'company' : 'project',created_at:`2026-10-${String(index+1).padStart(2,'0')}T12:00:00Z`,...(id!=='lc' ? {opportunity_preference:pay} : {}),...(location ? {remote:location==='remote'} : {})}));
rows.find(p=>p.id==='post').remote=true; // Regular posts' ranking placeholder is not a recruiting location.
rows.find(p=>p.id==='vi').opportunity_preference='volunteering';rows.find(p=>p.id==='vr').opportunity_preference='volunteer';
rows.find(p=>p.id==='vr').remote='true';rows.find(p=>p.id==='lc').remote='false';
rows.find(p=>p.id==='ur').unread_reply_comment_id='reply';
feed.opportunities=[...rows].reverse();feed.scored=true;feed.renderCard=p=>p.id+'|';
feed.matchScores={pr:.2,pi:.8,ur:.5,vi:.4,vr:.3,lc:.6,unknown:.1,post:.9};
const newest=['post','unknown','lc','vr','vi','ur','pi','pr'];
const foryou=['ur','post','pi','lc','vi','vr','pr','unknown'];
let combinations=0;
for(const order of ['foryou','newest','oldest'])for(const pay of ['','unpaid','paid'])for(const kind of ['','opportunity'])for(const location of ['','inperson','remote']){
  Object.assign(elements['f-sort'],{value:order});elements['f-pay'].value=pay;elements['f-kind'].value=kind;elements['f-location'].value=location;feed.currentSort=order;
  const allowed=new Set(specs.filter(([id,p,l])=>(!pay || p===pay) && (!kind || id!=='post') && (!location || l===location)).map(([id])=>id));
  const expected=(order==='foryou' ? foryou : order==='newest' ? newest : [...newest].reverse()).filter(id=>allowed.has(id)).map(id=>id+'|').join('');
  feed.render();assert.equal(elements.list.innerHTML,expected || '<div class="d-empty">Nothing matches those filters. <button class="d-btn-ghost" onclick="Filters.clearAll(); Feed.render()">Clear filters</button></div>',JSON.stringify({order,pay,kind,location}));combinations++;
}
assert.deepEqual(Array.from(filters.apply([{id:'legacy',location:'Remote'}],{location:'remote'}),p=>p.id),['legacy']);
assert.deepEqual(Array.from(filters.apply([{id:'legacy',location:'City'}],{location:'inperson'}),p=>p.id),['legacy']);
assert.deepEqual(Array.from(filters.apply([{id:'unknown'}],{location:'inperson'})),[]);
filters.init();elements.q.value='query';elements.clear.click();
assert.equal(elements.q.value,'');assert.equal(feed.currentSort,'foryou');
for(const id of ['f-pay','f-kind','f-location'])assert.equal(elements[id].value,'');
assert.equal(elements['f-sort'].value,'foryou');
elements['f-pay'].value='paid';elements['f-pay'].change();assert.ok(!elements.list.innerHTML.includes('post|'));
feed.guest=true;filters.clearAll();assert.equal(feed.currentSort,'newest');assert.equal(elements['f-sort'].value,'newest');
assert.deepEqual(feed.opportunities.map(p=>p.id),[...rows].reverse().map(p=>p.id),'filtering and sorting do not mutate source data');
console.log(`Feed filters: ${combinations} sort/pay/kind/location combinations, strict date order, volunteer/legacy values, regular-post exclusions, control events and reset passed.`);
