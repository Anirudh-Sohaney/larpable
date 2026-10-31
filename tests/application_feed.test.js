const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const list = { innerHTML: '',setAttribute(){},removeAttribute(){} };
const count = { textContent: '', title: '' };
const elements = { list, count, 'yours-controls':{},'yours-create':{} };
const tabs=['projects','posts'].map(tab=>({dataset:{yoursTab:tab},setAttribute(name,value){this[name]=value;}}));
const classes=new Set();
const Feed = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../web_app/js/feed.js'), 'utf8') + '\nFeed;', {
  document: { getElementById: id => elements[id] || null,querySelectorAll:()=>tabs,body:{classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);}}} },
  window: { location: { search: '' } },
  URLSearchParams,
  DataStore: { getCurrentUser: () => ({ id: 'owner' }) },
  Filters: { apply(){throw new Error('Yours must ignore filters');},sort(){throw new Error('Yours must ignore sort controls');},updateControls(){throw new Error('Yours must ignore filter controls');} },
  Utils: {escapeHtml:value=>String(value)}
});

Feed.showingYours = true;
Feed.yoursTab='posts';
Feed.currentSort = 'recent';
Feed.drafts = [];
Feed.renderCard = opportunity => opportunity.id + '|';
Feed.myPosts = [
  { id: 'newer-post', created_by: 'owner', created_at: '2026-09-24', latest_notification_at: '' },
  { id: 'comment', created_by: 'owner', created_at: '2026-09-22', latest_notification_at: '2026-09-25T09:00:00Z' },
  { id: 'application', created_by: 'owner', created_at: '2026-09-23', latest_notification_at: '2026-09-25T10:00:00Z' }
];
Feed.render();
assert.ok(list.innerHTML.endsWith('application|comment|newer-post|'));
assert.equal(count.textContent,'3 posts · 0 drafts');
assert.ok(classes.has('is-yours'));
assert.equal(elements['yours-controls'].hidden,false);
assert.equal(elements['yours-create'].textContent,'+ Create post');
Feed.yoursTab='projects';
Feed.projects=[{id:'prj_owned',type:'project',fields:{name:'My Project',elevator_pitch:'A community project',tags:['Research']}}];
Feed.render();
assert.ok(list.innerHTML.includes('My Project'));
assert.ok(list.innerHTML.includes('Edit project'));
assert.ok(list.innerHTML.includes('Delete project'));
assert.ok(!list.innerHTML.includes('application|'));
assert.equal(count.textContent,'1 project');
assert.equal(tabs[0]['aria-selected'],'true');
console.log('Application and comment notification ordering passed');
