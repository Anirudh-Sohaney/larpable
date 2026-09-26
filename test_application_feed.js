const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const list = { innerHTML: '' };
const count = { textContent: '', title: '' };
const elements = { list, count };
const Feed = vm.runInNewContext(fs.readFileSync('web_app/js/feed.js', 'utf8') + '\nFeed;', {
  document: { getElementById: id => elements[id] || null },
  window: { location: { search: '' } },
  URLSearchParams,
  DataStore: { getCurrentUser: () => ({ id: 'owner' }) },
  Filters: { getType: () => '', selectedTotal: () => 0, apply: rows => rows, matchCounts: {} },
  Utils: {}
});

Feed.showingYours = true;
Feed.currentSort = 'recent';
Feed.drafts = [];
Feed.renderCard = opportunity => opportunity.id + '|';
Feed.opportunities = [
  { id: 'newer-post', created_by: 'owner', created_at: '2026-09-24', latest_notification_at: '' },
  { id: 'comment', created_by: 'owner', created_at: '2026-09-22', latest_notification_at: '2026-09-25T09:00:00Z' },
  { id: 'application', created_by: 'owner', created_at: '2026-09-23', latest_notification_at: '2026-09-25T10:00:00Z' }
];
Feed.render();
assert.equal(list.innerHTML, 'application|comment|newer-post|');
console.log('Application and comment notification ordering passed');
