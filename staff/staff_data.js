/* Staff portal state is populated by the authenticated API before rendering. */
const STAFF_DATA = {
  currentUser: null,
  staffMembers: [],
  companyGoals: [],
  userGoals: {},
  tasks: [],
  calendarEvents: [],
  logs: [],
  resources: [],
  // Still displayed by the Admin panel; replacing this legacy summary is separate work.
  dataInfo: {
    sizeGB: 0.0234,
    path: '/data/',
    files: [
      { name: 'users.json',      sizeKB: 12.4,  lastModified: '2026-03-16T10:00:00Z' },
      { name: 'opportunities.json', sizeKB: 8.2, lastModified: '2026-03-15T14:30:00Z' },
      { name: 'staff.json',      sizeKB: 4.8,   lastModified: '2026-03-16T14:32:00Z' },
      { name: 'sessions.json',   sizeKB: 1.2,   lastModified: '2026-03-16T15:00:00Z' },
      { name: 'drafts.json',     sizeKB: 0.6,   lastModified: '2026-03-14T09:00:00Z' },
      { name: 'legal_versions.json', sizeKB: 0.3, lastModified: '2026-02-01T11:00:00Z' }
    ]
  }
};

const DataStore = {
  persist(collection, item) {
    return fetch(`/api/staff/data/${collection}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item) }).catch(() => null);
  },
  persistUpdate(collection, id, updates) {
    return fetch(`/api/staff/data/${collection}/${encodeURIComponent(id)}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) }).catch(() => null);
  },
  persistDelete(collection, id) {
    return fetch(`/api/staff/data/${collection}/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' }).catch(() => null);
  },
  hydrateLive(payload) {
    if (!payload) return;
    STAFF_DATA.staffMembers = (payload.members || []).map(member => ({
      userId: member.id || member.userId, username: member.username, firstName: member.first_name || member.firstName || '',
      lastNameInitial: member.last_name_initial || member.lastNameInitial || '', permissions: member.permissions || [],
      addedAt: member.added_at || member.addedAt, addedBy: member.added_by || member.addedBy, isAdmin: !!member.isAdmin
    }));
    STAFF_DATA.currentUser = STAFF_DATA.staffMembers.find(member => member.userId === App?.currentUser?.id) || STAFF_DATA.staffMembers[0] || App?.currentUser || STAFF_DATA.currentUser;
    if (payload.logs) STAFF_DATA.logs = payload.logs;
    if (payload.tasks) STAFF_DATA.tasks = payload.tasks;
    if (payload.calendarEvents) STAFF_DATA.calendarEvents = payload.calendarEvents;
    if (payload.resources) STAFF_DATA.resources = payload.resources;
    if (payload.userGoals) STAFF_DATA.userGoals = Object.fromEntries(Object.entries(payload.userGoals).map(([userId, goals]) => [userId, (goals || []).map(goal => ({ ...goal, createdAt: goal.createdAt || goal.created_at, completedAt: goal.completedAt || goal.completed_at }))]));
    if (payload.teamGoals) {
      STAFF_DATA.companyGoals = payload.teamGoals.map(goal => ({ ...goal, createdAt: goal.createdAt || goal.created_at, completedAt: goal.completedAt || goal.completed_at }));
    }
  },

  getStaffMembers() {
    return [...STAFF_DATA.staffMembers];
  },

  getCompanyGoals() {
    return [...STAFF_DATA.companyGoals];
  },

  getTasks(scope, filter) {
    let tasks = [...STAFF_DATA.tasks];
    if (scope === 'my') {
      const myId = App?.currentUser?.id || STAFF_DATA.currentUser?.userId || STAFF_DATA.currentUser?.id;
      tasks = tasks.filter(t => (t.assigneeIds || [t.assignee]).includes(myId));
    }
    if (filter && filter !== 'all') tasks = tasks.filter(t => t.status === filter);
    return tasks;
  },

  getCalendarEvents(month, scope) {
    let events = [...STAFF_DATA.calendarEvents];
    if (month) events = events.filter(e => e.date.startsWith(month));
    if (scope === 'team') events = events.filter(e => e.team === STAFF_DATA.currentUser.team || e.team === null);
    return events;
  },

  getLogs(filter, search) {
    let logs = [...STAFF_DATA.logs];
    if (filter && filter !== 'all') logs = logs.filter(l => l.type === filter);
    if (search) {
      const q = search.toLowerCase();
      logs = logs.filter(l =>
        l.details.toLowerCase().includes(q) ||
        l.username.toLowerCase().includes(q) ||
        (l.metadata.title || '').toLowerCase().includes(q)
      );
    }
    return logs;
  },

  getResources(scope, search) {
    let resources = [...STAFF_DATA.resources];
    if (search) {
      const q = search.toLowerCase();
      resources = resources.filter(r =>
        r.title.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        (r.label || r.category || '').toLowerCase().includes(q)
      );
    }
    return resources;
  },

  getDataInfo() {
    return { ...STAFF_DATA.dataInfo };
  },

  addGoal(type, userId, goal) {
    const id = 'goal_' + Date.now();
    const newGoal = { id, ...goal, createdAt: new Date().toISOString(), createdBy: (STAFF_DATA.currentUser || App.currentUser).id };
    if (type === 'team') {
      STAFF_DATA.companyGoals.unshift(newGoal);
      this.persist('team_goals', newGoal);
    } else if (type === 'user' && userId) {
      if (!STAFF_DATA.userGoals[userId]) STAFF_DATA.userGoals[userId] = [];
      STAFF_DATA.userGoals[userId].unshift(newGoal);
      this.persist('user_goals', { ...newGoal, user_id: userId });
    }
    return newGoal;
  },

  updateGoal(type, goalId, userId, updates) {
    if (type === 'team') {
      const idx = STAFF_DATA.companyGoals.findIndex(g => g.id === goalId);
      if (idx !== -1) Object.assign(STAFF_DATA.companyGoals[idx], updates);
      this.persistUpdate('team_goals', goalId, updates);
    } else if (type === 'user' && userId) {
      const goals = STAFF_DATA.userGoals[userId] || [];
      const idx = goals.findIndex(g => g.id === goalId);
      if (idx !== -1) Object.assign(goals[idx], updates);
      this.persistUpdate('user_goals', goalId, { ...updates, user_id: userId });
    }
  },

  deleteGoal(type, goalId, userId) {
    if (type === 'team') {
      STAFF_DATA.companyGoals = STAFF_DATA.companyGoals.filter(g => g.id !== goalId);
      this.persistDelete('team_goals', goalId);
    } else if (type === 'user' && userId) {
      STAFF_DATA.userGoals[userId] = (STAFF_DATA.userGoals[userId] || []).filter(g => g.id !== goalId);
      this.persistDelete('user_goals', goalId);
    }
  },

  addTask(task) {
    const id = 'task_' + Date.now();
    const newTask = { id, ...task, status: 'todo', createdAt: new Date().toISOString() };
    STAFF_DATA.tasks.unshift(newTask);
    this.persist('tasks', newTask);
    return newTask;
  },

  updateTask(taskId, updates) {
    const idx = STAFF_DATA.tasks.findIndex(t => t.id === taskId);
    if (idx !== -1) Object.assign(STAFF_DATA.tasks[idx], updates);
    this.persistUpdate('tasks', taskId, updates);
  },

  deleteTask(taskId) {
    const idx = STAFF_DATA.tasks.findIndex(t => t.id === taskId);
    if (idx !== -1) STAFF_DATA.tasks.splice(idx, 1);
    this.persistDelete('tasks', taskId);
  },

  addEvent(event) {
    const id = 'evt_' + Date.now();
    const newEvent = { id, ...event };
    STAFF_DATA.calendarEvents.push(newEvent);
    this.persist('calendar_events', newEvent);
    return newEvent;
  },

  addResource(resource) {
    const id = 'res_' + Date.now();
    const newResource = { id, ...resource, addedBy: (STAFF_DATA.currentUser || App.currentUser).id, addedAt: new Date().toISOString() };
    STAFF_DATA.resources.unshift(newResource);
    this.persist('resources', newResource);
    return newResource;
  },

  async addStaffMember(userId) {
    const res = await fetch('/api/staff/members', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Could not add staff member');
    const member = data.member || {};
    STAFF_DATA.staffMembers.push({
      userId: member.userId || userId,
      username: member.username || '',
      firstName: member.first_name || member.firstName || '',
      lastNameInitial: member.last_name_initial || member.lastNameInitial || '',
      permissions: [],
      addedAt: new Date().toISOString(),
      addedBy: STAFF_DATA.currentUser?.id || ''
    });
    return data.member;
  },

  async removeStaffMember(userId) {
    const res = await fetch(`/api/staff/members/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Could not remove staff member');
    STAFF_DATA.staffMembers = STAFF_DATA.staffMembers.filter(m => m.userId !== userId);
  }
};
