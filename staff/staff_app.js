/**
 * LARPABLE Staff Portal — App Controller
 * 
 * Main controller: tab routing, state management, modal handling,
 * global search, and user switching.
 * 
 * INTEGRATION: When integrating with the real backend:
 *   - Replace DataStore calls with fetch() to /api/staff/* endpoints
 *   - Add cookie-based auth check on init (GET /api/auth/me)
 *   - Replace DEMO_DATA.currentUser with the real user from /api/staff/check
 */

const App = {
  currentTab: 'home',
  currentUser: null,
  isStaffAdmin: false,
  calendarView: 'month',
  calendarDate: new Date(),
  goalsScope: 'company',
  tasksScope: 'my',
  tasksFilter: 'all',
  logsFilter: 'all',
  logsSearch: '',
  resourcesScope: 'all',
  resourcesSearch: '',
  can(permission) {
    return this.isStaffAdmin || (this.currentUser?.permissions || []).includes(permission);
  },

  /**
   * Initialize the app
   * INTEGRATION: Replace with real auth check:
   *   const me = await fetch('/api/auth/me', { credentials: 'include' });
   *   const staff = await fetch('/api/staff/check', { credentials: 'include' });
   *   if (!staff.ok) window.location.href = '/feed';
   *   This mirrors the checkStaffAccess() in existing app/staff/staff.js
   */
  async init() {
    try {
      const [meResponse, staffResponse, dataResponse, checkResponse] = await Promise.all([
        fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/staff/members', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/staff/data', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/staff/check', { credentials: 'include', cache: 'no-store' })
      ]);
      if (!meResponse.ok || !staffResponse.ok || !dataResponse.ok) throw new Error('Staff authentication required');
      const mePayload = await meResponse.json();
      const me = mePayload.user || mePayload;
      const staff = await staffResponse.json();
      const check = checkResponse.ok ? await checkResponse.json() : {};
      DataStore.hydrateLive(await dataResponse.json());
      // Access comes from the session flag or /api/staff/check — a missing
      // members-table row must not lock out staff (e.g. admin added by flag).
      const member = (staff.members || []).find(item => item.id === me.id);
      if (!me.staffAccess && !check.hasAccess) throw new Error('Staff access required');
      this.currentUser = {
        ...(member || {}), id: me.id,
        username: member?.username || check.username || me.displayName || 'Staff',
        permissions: member?.permissions || [], hasAccess: true
      };
      this.isStaffAdmin = !!member?.isAdmin || !!check.isAdmin;
    } catch (error) {
      document.getElementById('main-content').innerHTML = '<div class="sp-tab-content"><div class="sp-card"><strong>Staff sign-in required.</strong><p style="color:var(--sp-muted);">This portal only displays live test_data for authenticated staff accounts.</p><a class="sp-btn sp-btn-primary" href="../login.html">Sign in</a></div></div>';
      return;
    }

    document.getElementById('header-username').textContent = this.currentUser.username;
    this.updateNavVisibility();

    // Close modals on overlay click
    document.querySelectorAll('.sp-modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('open');
      });
    });

    // Live search while typing in the add-staff modal
    document.getElementById('staff-username-input').addEventListener('input', Utils.debounce(() => {
      this.searchStaffUsers();
    }, 250));

    this.navigate('home');
  },

  navigate(tab) {
    this.currentTab = tab;

    // Update sidebar active state
    document.querySelectorAll('.sp-nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.tab === tab);
    });
    // Update bottom nav active state
    document.querySelectorAll('.sp-bottom-nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.tab === tab);
    });

    const content = document.getElementById('main-content');
    content.innerHTML = '';

    switch (tab) {
      case 'home':      Home.render(content); break;
      case 'calendar':  Calendar.render(content); break;
      case 'goals':     Goals.render(content); break;
      case 'tasks':     Tasks.render(content); break;
      case 'work':      Work.render(content); break;
      case 'logs':      Logs.render(content); break;
      case 'resources': Resources.render(content); break;
      case 'admin':     Admin.render(content); break;
    }

    content.scrollTop = 0;
  },

  /**
   * Show/hide sidebar + mobile entries that depend on permissions.
   * Admin section only for the platform admin; the Work tab only for staff
   * holding a platform-control permission (skills_control or user_control).
   */
  updateNavVisibility() {
    const canWork = this.can('skills_control') || this.can('user_control') ||
      this.can('opportunities_control') || this.can('flagged_control');
    document.getElementById('work-nav').style.display = canWork ? '' : 'none';
    document.getElementById('more-work-nav').style.display = canWork ? '' : 'none';
    document.getElementById('admin-badge').style.display = this.isStaffAdmin ? '' : 'none';
    document.getElementById('admin-nav').style.display = this.isStaffAdmin ? '' : 'none';
    document.getElementById('admin-divider').style.display = this.isStaffAdmin ? '' : 'none';
    document.getElementById('admin-section-label').style.display = this.isStaffAdmin ? '' : 'none';
    document.getElementById('more-admin-nav').style.display = this.isStaffAdmin ? '' : 'none';
    if (!canWork && this.currentTab === 'work') this.navigate('home');
  },

  /**
   * Switch current user (for demo purposes)
   * INTEGRATION: Not needed in production — user is determined by session cookie
   */
  globalSearch(query) {
    // INTEGRATION: Could search across all endpoints with a unified search API
    // For now, delegate to the current tab's search
    if (this.currentTab === 'logs') {
      Logs.handleSearch(query);
    } else if (this.currentTab === 'resources') {
      Resources.handleSearch(query);
    }
  },

  // ── Modal Helpers ──────────────────────────────────────────
  openModal(id) {
    document.getElementById(id).classList.add('open');
  },

  closeModal(id) {
    document.getElementById(id).classList.remove('open');
  },

  toggleMobileMore() {
    this.openModal('more-modal');
  },

  // ── Goal Form ──────────────────────────────────────────────
  openAddGoalModal(type, userId) {
    // INTEGRATION: Same API shape — POST /api/staff/team-goals or /api/staff/user-goals/:userId
    document.getElementById('goal-modal-title').textContent = type === 'team' ? 'Add Company Goal' : 'Add Goal for User';
    document.getElementById('goal-form').reset();
    document.getElementById('goal-edit-id').value = '';
    document.getElementById('goal-type').value = type;
    document.getElementById('goal-user-id').value = userId || '';
    document.getElementById('goal-importance-group').style.display = type === 'user' ? '' : 'none';
    document.getElementById('goal-submit-btn').textContent = 'Add Goal';
    this.openModal('goal-modal');
  },

  openEditGoalModal(goal) {
    document.getElementById('goal-modal-title').textContent = 'Edit Goal';
    document.getElementById('goal-edit-id').value = goal.id;
    document.getElementById('goal-type').value = goal._type;
    document.getElementById('goal-user-id').value = goal._userId || '';
    document.getElementById('goal-title').value = goal.title;
    document.getElementById('goal-description').value = goal.description || '';
    document.getElementById('goal-deadline').value = goal.deadline;
    document.getElementById('goal-submit-btn').textContent = 'Save Changes';
    document.getElementById('goal-importance-group').style.display = goal._type === 'user' ? '' : 'none';

    if (goal._type === 'user' && goal.importance) {
      const radio = document.querySelector(`input[name="goal-importance"][value="${goal.importance}"]`);
      if (radio) radio.checked = true;
    }
    this.openModal('goal-modal');
  },

  handleGoalSubmit(e) {
    e.preventDefault();
    const editId = document.getElementById('goal-edit-id').value;
    const type = document.getElementById('goal-type').value;
    const userId = document.getElementById('goal-user-id').value;
    const title = document.getElementById('goal-title').value;
    const description = document.getElementById('goal-description').value;
    const deadline = document.getElementById('goal-deadline').value;

    if (editId) {
      const updates = { title, description, deadline };
      if (type === 'user') {
        updates.importance = document.querySelector('input[name="goal-importance"]:checked')?.value || 'medium';
      }
      DataStore.updateGoal(type, editId, userId, updates);
    } else {
      const goal = { title, description, deadline };
      if (type === 'user') {
        goal.importance = document.querySelector('input[name="goal-importance"]:checked')?.value || 'medium';
      } else goal.importance = 'medium';
      DataStore.addGoal(type, userId, goal);
    }

    this.closeModal('goal-modal');
    this.navigate(this.currentTab);
  },

  // ── Task Form ──────────────────────────────────────────────
  openAddTaskModal() {
    // INTEGRATION: POST /api/staff/tasks
    document.getElementById('task-form').reset();
    const assigneeSelect = document.getElementById('task-assignee');
    const members = DataStore.getStaffMembers();
    assigneeSelect.innerHTML = members.map(m =>
      `<option value="${m.userId}">${m.username}</option>`
    ).join('');
    this.openModal('task-modal');
  },

  handleTaskSubmit(e) {
    e.preventDefault();
    const members = DataStore.getStaffMembers();
    const assigneeIds = [...document.getElementById('task-assignee').selectedOptions].map(option => option.value);
    const assignees = members.filter(m => assigneeIds.includes(m.userId));

    DataStore.addTask({
      title: document.getElementById('task-title').value,
      description: document.getElementById('task-description').value,
      assigneeIds,
      assigneeNames: assignees.map(assignee => assignee.username),
      priority: document.querySelector('input[name="task-priority"]:checked')?.value || 'medium',
      dueDate: document.getElementById('task-due-date').value
    });

    this.closeModal('task-modal');
    this.navigate('tasks');
  },

  // ── Event Form ─────────────────────────────────────────────
  openAddEventModal(date) {
    // INTEGRATION: POST /api/staff/calendar
    document.getElementById('event-form').reset();
    if (date) document.getElementById('event-date').value = date;
    this.openModal('event-modal');
  },

  handleEventSubmit(e) {
    e.preventDefault();
    DataStore.addEvent({
      title: document.getElementById('event-title').value,
      date: document.getElementById('event-date').value,
      time: document.getElementById('event-time').value,
      duration: parseInt(document.getElementById('event-duration').value) || 0,
      type: document.getElementById('event-type').value,
      description: document.getElementById('event-description').value
    });

    this.closeModal('event-modal');
    Calendar.render(document.getElementById('main-content'));
  },

  // ── Resource Form ──────────────────────────────────────────
  openAddResourceModal() {
    // INTEGRATION: POST /api/staff/resources
    document.getElementById('resource-form').reset();
    this.openModal('resource-modal');
  },

  handleResourceSubmit(e) {
    e.preventDefault();
    DataStore.addResource({
      title: document.getElementById('resource-title').value,
      url: document.getElementById('resource-url').value,
      description: document.getElementById('resource-description').value,
      label: document.getElementById('resource-label')?.value || 'General'
    });

    this.closeModal('resource-modal');
    Resources.render(document.getElementById('main-content'));
  },

  // ── Staff Management ───────────────────────────────────────
  selectedStaffUser: null,

  openAddStaffModal() {
    this.selectedStaffUser = null;
    document.getElementById('staff-username-input').value = '';
    document.getElementById('staff-search-results').innerHTML = '';
    document.getElementById('staff-add-btn').disabled = true;
    this.openModal('staff-modal');
    this.searchStaffUsers();
  },

  // GET /api/staff/users?search= — searchable username dropdown
  async searchStaffUsers() {
    const search = (document.getElementById('staff-username-input').value || '').trim();
    const container = document.getElementById('staff-search-results');
    try {
      const res = await fetch(`/api/staff/users?search=${encodeURIComponent(search)}`, { credentials: 'include', cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load users');
      const data = await res.json();
      const memberIds = new Set(DataStore.getStaffMembers().map(m => m.userId));
      this._staffUserResults = (data.users || []).filter(u => !memberIds.has(u.userId));
      container.innerHTML = this._staffUserResults.length
        ? this._staffUserResults.map(user => `
            <div class="sp-search-option" onclick="App.selectStaffUser('${user.userId}')">${Utils.escapeHtml(user.display)}</div>
          `).join('')
        : '<div class="sp-search-empty">No users found.</div>';
    } catch (error) {
      container.innerHTML = '<div class="sp-search-empty">Failed to load users.</div>';
    }
  },

  selectStaffUser(userId) {
    const user = (this._staffUserResults || []).find(u => u.userId === userId);
    if (!user) return;
    this.selectedStaffUser = user;
    document.getElementById('staff-username-input').value = user.display;
    document.getElementById('staff-search-results').innerHTML = '';
    document.getElementById('staff-add-btn').disabled = false;
  },

  // POST /api/staff/members { userId } — persists to staff.json + users.json
  async handleAddStaff() {
    if (!this.selectedStaffUser) { alert('Search and select a user first.'); return; }
    const userId = this.selectedStaffUser.userId;
    const btn = document.getElementById('staff-add-btn');
    btn.disabled = true;
    try {
      await DataStore.addStaffMember(userId);
      this.closeModal('staff-modal');
      Admin.render(document.getElementById('main-content'));
    } catch (error) {
      btn.disabled = false;
      alert(error.message);
    }
  },

  // DELETE /api/staff/members/:userId
  async removeStaffMember(userId) {
    if (!confirm('Remove this staff member?')) return;
    try {
      await DataStore.removeStaffMember(userId);
      Admin.render(document.getElementById('main-content'));
    } catch (error) {
      alert(error.message);
    }
  }
};

// ── Boot ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => App.init());
