const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '..');
const baseline = process.env.CLEANUP_BASELINE_DIR;
const plain = value => JSON.parse(JSON.stringify(value));

function loadMatching(directory) {
  const file = path.join(root, 'backend/matching/similarity.js');
  const context = { module: { exports: {} }, require: createRequire(file), __dirname: path.dirname(file) };
  vm.runInNewContext(fs.readFileSync(path.join(directory, 'backend/matching/similarity.js'), 'utf8'), context);
  return context.module.exports;
}

function matchingSnapshot(matching) {
  const taxonomy = require('../backend/matching/taxonomy.json');
  const skills = [...taxonomy.skills, ...Object.keys(taxonomy.skill_aliases || {}), 'Unknown skill', 'writing'];
  const scores = [], similarities = [], ranks = [];
  for (const skill of skills) for (const target of skills) {
    scores.push(matching.score({ skills: [skill] }, { skills: [target] }));
    similarities.push(matching.entitySimilarity(skill, target));
  }
  for (const interest of taxonomy.interests) for (const field of taxonomy.fields) {
    for (const preference of ['all', 'paid', 'unpaid', 'volunteer']) {
      const user = { skills: taxonomy.skills.slice(0, 3), interests: [interest], latitude: 41, longitude: -87, opportunity_preference: preference };
      ranks.push(matching.rank(user, [
        { id: 'near', skills: taxonomy.skills.slice(2, 5), industry: field, latitude: 41.1, longitude: -87, opportunity_preference: 'paid' },
        { id: 'remote', skills: ['Unknown skill'], remote: true, opportunity_preference: 'volunteering' },
        { id: 'empty', skills: [] }
      ]));
    }
  }
  return { scores, similarities, ranks: plain(ranks) };
}

function staffSnapshot(directory) {
  const requests = [], elements = new Map();
  const escapeHtml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const now = new Date('2026-10-27T12:00:00Z').getTime();
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const app = {
    currentUser: { id: 'owner', username: 'owner', permissions: ['assign_tasks'] }, isStaffAdmin: true,
    tasksScope: 'all', tasksFilter: 'all', logsFilter: 'all', logsSearch: '',
    resourcesScope: 'all', resourcesSearch: '', calendarDate: new FixedDate(), calendarView: 'month',
    can(permission) { return this.isStaffAdmin || this.currentUser.permissions.includes(permission); }, openModal() {}, closeModal() {}
  };
  const context = vm.createContext({
    App: app, Date: FixedDate, console, setTimeout, clearTimeout,
    localStorage: { getItem: () => null }, confirm: () => true,
    document: {
      createElement: () => ({ textContent: '', get innerHTML() { return escapeHtml(this.textContent); } }),
      getElementById: id => { if (!elements.has(id)) elements.set(id, { innerHTML: '', textContent: '' }); return elements.get(id); }
    },
    fetch: async (url, options = {}) => {
      requests.push({ url, ...options });
      return { ok: true, json: async () => ({ member: { userId: 'new_member', username: 'new_member' } }) };
    }
  });
  const run = source => vm.runInContext(source, context);
  run(fs.readFileSync(path.join(directory, 'staff/staff_utils.js'), 'utf8'));
  run(fs.readFileSync(path.join(directory, 'staff/staff_data.js'), 'utf8'));
  for (const name of ['goals', 'tasks', 'calendar', 'resources', 'logs', 'admin']) {
    const file = path.join(directory, `staff/components/${name}.js`);
    run(fs.readFileSync(fs.existsSync(file) ? file : path.join(root, `staff/components/${name}.js`), 'utf8'));
  }
  const store = run('DataStore');
  store.hydrateLive({
    members: [{ id: 'owner', username: 'owner', first_name: 'Owner', permissions: ['assign_tasks'] }],
    teamGoals: [{ id: 'g1', title: 'Live goal', deadline: '2026-11-01', created_at: '2026-10-01', completed: false }],
    userGoals: {}, tasks: [{ id: 't1', title: 'Live task', assignee: 'owner', status: 'todo', priority: 'high', dueDate: '2026-11-01' }],
    calendarEvents: [{ id: 'e1', title: 'Live event', date: '2026-10-27', time: '10:00', type: 'meeting', duration: 30 }],
    resources: [{ id: 'r1', title: 'Live resource', url: 'https://example.test', description: 'Useful notes', addedBy: 'owner', addedAt: '2026-10-01' }],
    logs: [{ id: 'l1', type: 'system', details: 'Live log', username: 'owner', timestamp: '2026-10-01', metadata: {} }]
  });
  const output = {};
  for (const admin of [true, false]) {
    app.isStaffAdmin = admin;
    for (const name of ['Goals', 'Tasks', 'Calendar', 'Resources', 'Logs', 'Admin']) {
      const container = { innerHTML: '' };
      run(name).render(container);
      output[`${name}:${admin}`] = container.innerHTML;
    }
  }
  app.calendarView = 'week';
  const week = { innerHTML: '' };
  run('Calendar').render(week);
  output.week = week.innerHTML;
  output.filters = plain({
    mine: store.getTasks('my'), filtered: store.getTasks('all', 'todo'),
    resources: store.getResources('all', 'notes'), logs: store.getLogs('system', 'live'),
    calendar: store.getCalendarEvents('2026-10'), members: store.getStaffMembers()
  });
  store.addGoal('team', '', { title: 'New goal' });
  store.updateGoal('team', 'g1', '', { completed: true });
  store.deleteGoal('team', 'g1', '');
  store.addGoal('user', 'owner', { title: 'Personal goal' });
  store.updateGoal('user', 'missing', 'owner', { completed: true });
  store.deleteGoal('user', 'missing', 'owner');
  store.addTask({ title: 'New task' });
  store.updateTask('t1', { status: 'done' });
  store.deleteTask('t1');
  store.addEvent({ title: 'New event', date: '2026-10-28' });
  store.addResource({ title: 'New resource' });
  output.afterMutations = plain({ goals: store.getCompanyGoals(), tasks: store.getTasks('all'), events: store.getCalendarEvents(), resources: store.getResources() });
  output.requests = plain(requests);
  const mutations = requests.filter(request => request.method);
  assert.equal(mutations.length, 11);
  assert.equal(mutations[0].url, '/api/staff/data/team_goals');
  assert.equal(JSON.parse(mutations[0].body).title, 'New goal');
  assert.match(output['Tasks:false'], /New Task|Add Task/);
  assert.equal(output['Admin:false'], '<div class="sp-empty">Access denied. Admin only.</div>');
  store.hydrateLive({ members: [], teamGoals: [], userGoals: {}, tasks: [], calendarEvents: [], resources: [], logs: [] });
  assert.deepEqual(plain([store.getStaffMembers(), store.getCompanyGoals(), store.getTasks(), store.getCalendarEvents(), store.getResources(), store.getLogs()]), [[], [], [], [], [], []]);
  for (const name of ['Goals', 'Tasks', 'Calendar', 'Resources', 'Logs']) {
    const container = { innerHTML: '' };
    run(name).render(container);
    output[`${name}:empty`] = container.innerHTML;
  }
  return output;
}

// Compile inline scripts and verify every local script dependency is present,
// including the public legacy pages that remain available for existing links.
for (const directory of ['web_app', 'staff']) {
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
  for (const file of walk(path.join(root, directory)).filter(file => file.endsWith('.html'))) {
    const html = fs.readFileSync(file, 'utf8');
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      const src = match[1].match(/\bsrc=["']([^"']+)["']/i)?.[1];
      if (src && !/^(https?:)?\/\//.test(src)) {
        const pathname = src.split('?')[0];
        const target = pathname.startsWith('/') ? path.join(root, 'web_app', pathname) : path.resolve(path.dirname(file), pathname);
        assert.ok(fs.existsSync(target), `${file} references missing ${src}`);
      } else if (!src && !/type=["'](?:application\/(?:json|ld\+json)|module)/i.test(match[1])) {
        new vm.Script(match[2], { filename: file });
      }
    }
  }
}

const currentMatching = matchingSnapshot(loadMatching(root));
const matching = loadMatching(root);
assert.equal(matching.score({ skills: ['Writing'] }, { skills: ['Writing'] }), 0.7);
assert.equal(matching.score({ skills: ['Unknown A'] }, { skills: ['Unknown B'] }), 0);
assert.equal(matching.entitySimilarity('Writing', 'Writing'), 1);
const currentStaff = staffSnapshot(root);
if (baseline) {
  assert.deepEqual(currentMatching, matchingSnapshot(loadMatching(baseline)), 'matching behavior changed');
  assert.deepEqual(currentStaff, staffSnapshot(baseline), 'staff rendering or mutation behavior changed');
}
console.log(`Cleanup checks passed: ${currentMatching.scores.length} skill pairs and similarity results, ${currentMatching.ranks.length} ranking scenarios, staff tabs/mutations, and HTML script dependencies`);
