/**
 * LARPABLE — Staff Dashboard JavaScript
 * 
 * Handles all frontend functionality for the staff dashboard.
 * Includes tab switching, data loading, goal management, and logging.
 */

(function() {
  'use strict';

  // State
  let currentTab = 'home';
  let currentUser = null;
  let isStaffAdmin = false;
  let stats = null;
  let teamGoals = [];
  let userGoals = [];
  let logs = [];
  let staffMembers = [];
  let users = [];
  let editingGoal = null;
  let selectedStaffUser = null;

  // ── Initialization ──────────────────────────────────────────
  async function init() {
    // Check auth and staff access
    const accessCheck = await checkStaffAccess();
    if (!accessCheck) {
      window.location.href = '/feed';
      return;
    }

    // Load initial data
    await loadUserData();
    
    // Set up tab listeners
    setupTabs();
    
    // Load initial tab
    loadTab('home');
  }

  // ── Auth & Access ───────────────────────────────────────────
  async function checkStaffAccess() {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (!res.ok) {
        return false;
      }
      
      const data = await res.json();
      currentUser = data.user;
      
      // Check staff access
      const staffRes = await fetch('/api/staff/check', { credentials: 'include' });
      if (!staffRes.ok) {
        return false;
      }
      
      const staffData = await staffRes.json();
      isStaffAdmin = staffData.isAdmin;
      
      return staffData.hasAccess;
    } catch (e) {
      console.error('Auth check failed:', e);
      return false;
    }
  }

  async function loadUserData() {
    try {
      const res = await fetch('/api/users/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        currentUser = { ...currentUser, ...data };
      }
    } catch (e) {
      console.error('Failed to load user data:', e);
    }
  }

  // ── Tab Management ──────────────────────────────────────────
  function setupTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentTab = tab.dataset.tab;
        loadTab(currentTab);
      });
    });
  }

  async function loadTab(tab) {
    const content = document.getElementById('tab-content');
    
    switch (tab) {
      case 'home':
        await loadHomeTab(content);
        break;
      case 'team':
        await loadTeamTab(content);
        break;
      case 'me':
        await loadMeTab(content);
        break;
      case 'logs':
        await loadLogsTab(content);
        break;
    }
  }

  // ── Home Tab ────────────────────────────────────────────────
  async function loadHomeTab(container) {
    container.innerHTML = '<div class="empty-msg">Loading...</div>';
    
    try {
      // Record portal open and fetch stats + inbox in parallel
      const [statsRes, inboxRes] = await Promise.all([
        fetch('/api/staff/stats', { credentials: 'include' }),
        fetch('/api/staff/inbox', { credentials: 'include' }),
        fetch('/api/staff/portal-open', { method: 'POST', credentials: 'include' })
      ]);
      
      if (statsRes.status === 401 || inboxRes.status === 401) { window.location.href = '/login'; return; }
      if (statsRes.status === 403 || inboxRes.status === 403) { container.innerHTML = '<div class="empty-msg">Access denied. <a href="/feed">Go back</a></div>'; return; }
      if (!statsRes.ok) throw new Error('Failed to load stats');
      
      stats = await statsRes.json();
      const inbox = await inboxRes.json();
      
      let inboxHtml = '';
      
      // Build inbox section
      const hasNewTasks = inbox.newTasks > 0;
      const hasNewTeamGoals = inbox.newTeamGoals > 0;
      const hasUrgency = inbox.urgencyAlerts && inbox.urgencyAlerts.length > 0;
      
      if (hasNewTasks || hasNewTeamGoals || hasUrgency) {
        inboxHtml += `
          <div class="card" style="margin-bottom: 16px;">
            <div style="font-size: 0.78rem; font-weight: 600; color: var(--muted); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
              INBOX
            </div>
        `;
        
        // New individual tasks
        if (hasNewTasks) {
          inboxHtml += `
            <div style="padding: 10px 14px; background: rgba(59, 130, 246, 0.1); border-radius: 8px; margin-bottom: 8px; border-left: 3px solid #3b82f6;">
              <div style="font-size: 0.9rem; font-weight: 500; color: var(--accent);">
                ${inbox.newTasks === 1 ? 'New task for you' : `${inbox.newTasks} new tasks for you`}
              </div>
            </div>
          `;
        }
        
        // New team goals
        if (hasNewTeamGoals) {
          const goalText = inbox.newTeamGoals === 1 
            ? `New team goal: "${inbox.newTeamGoalTitles[0]}"`
            : `${inbox.newTeamGoals} new team goals`;
          inboxHtml += `
            <div style="padding: 10px 14px; background: rgba(16, 185, 129, 0.1); border-radius: 8px; margin-bottom: 8px; border-left: 3px solid #10b981;">
              <div style="font-size: 0.9rem; font-weight: 500; color: #10b981;">
                ${goalText}
              </div>
            </div>
          `;
        }
        
        // Urgency alerts
        if (hasUrgency) {
          inbox.urgencyAlerts.forEach(alert => {
            const isUrgent = alert.urgency === 'urgent';
            const bgColor = isUrgent ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)';
            const borderColor = isUrgent ? '#ef4444' : '#f59e0b';
            const textColor = isUrgent ? '#ef4444' : '#f59e0b';
            const icon = isUrgent ? '🔴' : '🟡';
            
            inboxHtml += `
              <div style="padding: 10px 14px; background: ${bgColor}; border-radius: 8px; margin-bottom: 8px; border-left: 3px solid ${borderColor};">
                <div style="font-size: 0.9rem; font-weight: 500; color: ${textColor};">
                  ${icon} ${alert.message}
                </div>
                ${alert.importance ? `<div style="font-size: 0.78rem; color: var(--muted); margin-top: 4px;">Priority: ${alert.importance}</div>` : ''}
              </div>
            `;
          });
        }
        
        inboxHtml += '</div>';
      }
      
      container.innerHTML = `
        <div class="section-header">
          <h2 class="section-title">STAFF DASHBOARD</h2>
        </div>
        
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-number">${stats.users}</div>
            <div class="stat-label">Users</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">${stats.totalPosts}</div>
            <div class="stat-label">Active Posts</div>
            <div class="stat-breakdown">
              <div><span>Nonprofits</span><span>${stats.nonprofits}</span></div>
              <div><span>Projects</span><span>${stats.projects}</span></div>
              <div><span>Companies</span><span>${stats.companies}</span></div>
            </div>
          </div>
        </div>
        
        ${inboxHtml}
        
        <div class="last-updated">
          Last updated: ${new Date().toLocaleTimeString()}
        </div>
      `;
      
      // Auto-refresh every 30 seconds
      setTimeout(() => {
        if (currentTab === 'home') loadHomeTab(container);
      }, 30000);
      
    } catch (e) {
      container.innerHTML = '<div class="empty-msg">Failed to load stats</div>';
    }
  }

  // ── Team Tab ────────────────────────────────────────────────
  async function loadTeamTab(container) {
    container.innerHTML = '<div class="empty-msg">Loading...</div>';
    
    try {
      const res = await fetch('/api/staff/team-goals', { credentials: 'include' });
      if (res.status === 401) { window.location.href = '/login'; return; }
      if (res.status === 403) { container.innerHTML = '<div class="empty-msg">Access denied. <a href="/feed">Go back</a></div>'; return; }
      if (!res.ok) throw new Error('Failed to load team goals');
      
      const data = await res.json();
      teamGoals = data.goals;
      
      let html = `
        <div class="section-header">
          <h2 class="section-title">TEAM GOALS</h2>
          ${isStaffAdmin ? '<button class="btn-primary" onclick="openAddGoalModal()">+ Add Goal</button>' : ''}
        </div>
      `;
      
      if (teamGoals.length === 0) {
        html += '<div class="empty-msg">No team goals yet.</div>';
      } else {
        html += '<div class="timeline">';
        
        teamGoals.forEach(goal => {
          const deadlineDate = new Date(goal.deadline);
          const isOverdue = deadlineDate < new Date() && !goal.completed;
          
          html += `
            <div class="timeline-item ${goal.completed ? 'completed' : ''}">
              <div class="goal-card ${goal.completed ? 'completed' : ''}">
                <div class="goal-header">
                  <div class="goal-title ${goal.completed ? 'completed' : ''}">${escapeHtml(goal.title)}</div>
                </div>
                ${goal.description ? `<div class="goal-description">${escapeHtml(goal.description)}</div>` : ''}
                <div class="goal-meta">
                  <span style="font-size: 0.95rem; font-weight: 600; color: var(--accent);">📅 ${formatDate(goal.deadline)}${isOverdue ? ' (Overdue)' : ''}</span>
                </div>
                <div class="goal-actions">
                  <button class="complete-btn" onclick="toggleTeamGoal('${goal.id}', ${!goal.completed})">
                    ${goal.completed ? '↩ Undo' : '✓ Complete'}
                  </button>
                  ${isStaffAdmin ? `
                    <button class="edit-btn" onclick="openEditGoalModal('${goal.id}', 'team')">Edit</button>
                    <button class="delete-btn" onclick="deleteTeamGoal('${goal.id}', ${goal.completed})">Delete</button>
                  ` : ''}
                </div>
              </div>
            </div>
          `;
        });
        
        html += '</div>';
      }
      
      container.innerHTML = html;
      
    } catch (e) {
      container.innerHTML = '<div class="empty-msg">Failed to load team goals</div>';
    }
  }

  // ── Me Tab ──────────────────────────────────────────────────
  async function loadMeTab(container) {
    container.innerHTML = '<div class="empty-msg">Loading...</div>';
    
    try {
      const userId = currentUser?.id;
      if (!userId) {
        container.innerHTML = '<div class="empty-msg">User not found. <a href="/feed">Go back</a></div>';
        return;
      }
      
      // Fetch goals and completion history in parallel
      const [goalsRes, completionsRes] = await Promise.all([
        fetch(`/api/staff/user-goals/${userId}`, { credentials: 'include' }),
        fetch(`/api/staff/goal-completions/${userId}`, { credentials: 'include' })
      ]);
      
      if (goalsRes.status === 401 || completionsRes.status === 401) { window.location.href = '/login'; return; }
      if (goalsRes.status === 403 || completionsRes.status === 403) { container.innerHTML = '<div class="empty-msg">Access denied. <a href="/feed">Go back</a></div>'; return; }
      if (!goalsRes.ok) throw new Error('Failed to load user goals');
      
      const goalsData = await goalsRes.json();
      userGoals = goalsData.goals;
      const completionsData = await completionsRes.json();
      const completions = completionsData.completions || [];
      
      // Fetch data size for anisohaney
      let dataSize = null;
      if (isStaffAdmin) {
        try {
          const sizeRes = await fetch('/api/staff/data-size', { credentials: 'include' });
          if (sizeRes.ok) {
            const sizeData = await sizeRes.json();
            dataSize = sizeData.sizeGB;
          }
        } catch (e) { /* ignore */ }
      }
      
      let html = `
        <div class="section-header">
          <h2 class="section-title">MY GOALS</h2>
        </div>
      `;
      
      // Show data size for staff admin
      if (dataSize !== null) {
        html += `
          <div class="card" style="margin-bottom: 16px; padding: 12px 16px;">
            <div style="font-size: 0.78rem; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">
              DATA USAGE
            </div>
            <div style="font-size: 1.1rem; font-weight: 600; color: var(--accent);">
              ${dataSize} GB
            </div>
          </div>
        `;
      }
      
      if (userGoals.length === 0) {
        html += '<div class="empty-msg">No goals assigned yet.</div>';
      } else {
        // Group by importance
        const highGoals = userGoals.filter(g => g.importance === 'high' && !g.completed);
        const mediumGoals = userGoals.filter(g => g.importance === 'medium' && !g.completed);
        const lowGoals = userGoals.filter(g => g.importance === 'low' && !g.completed);
        const completedGoals = userGoals.filter(g => g.completed);
        
        if (highGoals.length > 0) {
          html += renderGoalGroup('HIGH PRIORITY', highGoals, 'high');
        }
        if (mediumGoals.length > 0) {
          html += renderGoalGroup('MEDIUM PRIORITY', mediumGoals, 'medium');
        }
        if (lowGoals.length > 0) {
          html += renderGoalGroup('LOW PRIORITY', lowGoals, 'low');
        }
        if (completedGoals.length > 0) {
          html += renderGoalGroup('COMPLETED', completedGoals, 'completed');
        }
      }
      
      // Self-goal creation for anisohaney
      if (isStaffAdmin) {
        html += `
          <div class="card" style="margin-top: 24px;">
            <div style="font-size: 0.78rem; font-weight: 600; color: var(--muted); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
              CREATE A GOAL
            </div>
            <div class="form-group">
              <label class="form-label">Title</label>
              <input type="text" class="form-input" id="self-goal-title" placeholder="Goal title">
            </div>
            <div class="form-group">
              <label class="form-label">Description (optional)</label>
              <input type="text" class="form-input" id="self-goal-desc" placeholder="Description">
            </div>
            <div class="form-group">
              <label class="form-label">Deadline</label>
              <input type="date" class="form-input" id="self-goal-deadline">
            </div>
            <div class="form-group">
              <label class="form-label">Importance</label>
              <select class="form-input" id="self-goal-importance">
                <option value="high">High</option>
                <option value="medium" selected>Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <button class="btn-primary" onclick="createSelfGoal()">Create Goal</button>
          </div>
        `;
      }
      
      // Completion history
      if (completions.length > 0) {
        html += `
          <div class="card" style="margin-top: 24px;">
            <div style="font-size: 0.78rem; font-weight: 600; color: var(--muted); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
              COMPLETION HISTORY
            </div>
        `;
        
        // Sort by most recent first
        const sortedCompletions = [...completions].sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));
        
        sortedCompletions.forEach(c => {
          const onTime = c.on_time;
          const statusColor = onTime ? '#10b981' : '#ef4444';
          const statusText = onTime ? 'On Time' : 'Late';
          const statusIcon = onTime ? '✓' : '✗';
          
          html += `
            <div style="padding: 10px 14px; background: ${onTime ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)'}; border-radius: 8px; margin-bottom: 8px; border-left: 3px solid ${statusColor};">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="font-size: 0.9rem; font-weight: 500;">${escapeHtml(c.title)}</div>
                <div style="font-size: 0.78rem; color: ${statusColor}; font-weight: 600;">
                  ${statusIcon} ${statusText}
                </div>
              </div>
              <div style="font-size: 0.78rem; color: var(--muted); margin-top: 4px;">
                Completed: ${formatDateTime(c.completed_at)} | Due: ${formatDate(c.deadline)}
              </div>
            </div>
          `;
        });
        
        html += '</div>';
      }
      
      // Staff admin section: Manage other users' goals
      if (isStaffAdmin) {
        html += `
          <div class="staff-section">
            <div class="staff-section-header">
              <h3 class="staff-section-title">STAFF MANAGEMENT</h3>
            </div>
            
            <div class="form-group">
              <label class="form-label">Add Staff Member</label>
              <button class="btn-primary" onclick="openAddStaffModal()">+ Add Staff Member</button>
            </div>
            
            <div class="form-group">
              <label class="form-label">View/Edit Staff Goals</label>
              <div class="dropdown-wrap" id="user-dropdown">
                <button class="dropdown-toggle" id="user-dropdown-toggle">Select user...</button>
                <div class="dropdown-menu" id="user-dropdown-menu">
                  <!-- Users loaded dynamically -->
                </div>
              </div>
            </div>
            
            <div id="selected-user-goals">
              <!-- Selected user's goals loaded here -->
            </div>
          </div>
        `;
      }
      
      container.innerHTML = html;
      
      // Load users for dropdown AFTER DOM is set
      if (isStaffAdmin) {
        await loadUsersDropdown();
      }

    } catch (e) {
      container.innerHTML = '<div class="empty-msg">Failed to load goals</div>';
    }
  }

  function renderGoalGroup(title, goals, importance) {
    let html = `
      <div class="card" style="margin-bottom: 16px;">
        <div style="font-size: 0.78rem; font-weight: 600; color: var(--muted); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
          ${title}
        </div>
    `;
    
    goals.forEach(goal => {
      const deadlineDate = new Date(goal.deadline);
      const isOverdue = deadlineDate < new Date() && !goal.completed;
      const daysLeft = Math.ceil((deadlineDate - new Date()) / (1000 * 60 * 60 * 24));
      
      html += `
        <div class="goal-card ${goal.completed ? 'completed' : ''}">
          <div class="goal-header">
            <div class="goal-title ${goal.completed ? 'completed' : ''}">${escapeHtml(goal.title)}</div>
            ${!goal.completed && importance !== 'completed' ? `<span class="importance-badge importance-${importance}">${importance}</span>` : ''}
          </div>
          ${goal.description ? `<div class="goal-description">${escapeHtml(goal.description)}</div>` : ''}
          <div class="goal-meta">
            <span>📅 ${formatDate(goal.deadline)}${isOverdue ? ' (Overdue)' : (!goal.completed ? ` (${daysLeft} days)` : '')}</span>
            ${goal.completed_at ? `<span>✓ Completed ${formatDate(goal.completed_at)}</span>` : ''}
          </div>
          ${!goal.completed ? `
            <div class="goal-actions">
              <button class="complete-btn" onclick="toggleUserGoal('${goal.id}', true)">✓ Complete</button>
            </div>
          ` : ''}
        </div>
      `;
    });
    
    html += '</div>';
    return html;
  }

  // ── Logs Tab ────────────────────────────────────────────────
  async function loadLogsTab(container) {
    container.innerHTML = '<div class="empty-msg">Loading...</div>';
    
    try {
      // Fetch both activity logs and git logs in parallel
      const [logsRes, gitRes] = await Promise.all([
        fetch('/api/staff/logs', { credentials: 'include' }),
        fetch('/api/staff/git-logs', { credentials: 'include' })
      ]);
      
      if (logsRes.status === 401 || gitRes.status === 401) { window.location.href = '/login'; return; }
      if (logsRes.status === 403 || gitRes.status === 403) { container.innerHTML = '<div class="empty-msg">Access denied. <a href="/feed">Go back</a></div>'; return; }
      
      const logsData = await logsRes.json();
      const gitData = await gitRes.json();
      logs = logsData.logs || [];
      const gitCommits = gitData.commits || [];
      
      let html = `
        <div class="section-header">
          <h2 class="section-title">ACTIVITY LOGS</h2>
        </div>
        
        <input type="text" class="search-input" placeholder="Search logs..." id="log-search-input" oninput="filterLogs()">
        
        <div id="logs-container">
      `;
      
      // Activity logs
      if (logs.length === 0) {
        html += '<div class="empty-msg">No activity logs yet.</div>';
      } else {
        logs.forEach(log => {
          html += `
            <div class="log-card" data-search="${escapeHtml(log.details)} ${escapeHtml(log.username)} ${escapeHtml(log.metadata?.title || '')}">
              <div class="log-header">
                <span class="log-timestamp">${formatDateTime(log.timestamp)}</span>
                <span class="log-type ${log.type}">${log.type.replace('_', ' ')}</span>
              </div>
              <div class="log-action">${log.action}</div>
              <div class="log-details">${escapeHtml(log.details)}</div>
            </div>
          `;
        });
      }
      
      // Git logs section
      html += `
        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border);">
          <div style="font-size: 0.78rem; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">
            GIT PUSHES
          </div>
      `;
      
      if (gitCommits.length === 0) {
        html += '<div class="empty-msg">No git commits found.</div>';
      } else {
        gitCommits.forEach(commit => {
          html += `
            <div class="log-card" data-search="${escapeHtml(commit.message)} ${escapeHtml(commit.hash)}">
              <div class="log-header">
                <span class="log-timestamp">${formatDateTime(commit.date)}</span>
                <span class="log-type git_push">git_push</span>
              </div>
              <div class="log-action">${escapeHtml(commit.hash)}</div>
              <div class="log-details">${escapeHtml(commit.message)}</div>
            </div>
          `;
        });
      }
      
      html += '</div></div></div>';
      
      container.innerHTML = html;
      
    } catch (e) {
      console.error('Failed to load logs:', e);
      container.innerHTML = '<div class="empty-msg">Failed to load logs</div>';
    }
  }

  // ── Goal Management ─────────────────────────────────────────
  window.openAddGoalModal = function() {
    document.getElementById('goal-modal-title').textContent = 'Add Team Goal';
    document.getElementById('goal-form').reset();
    document.getElementById('importance-group').style.display = 'none';
    document.getElementById('goal-submit-btn').textContent = 'Add Goal';
    
    // Set form to team goal mode
    editingGoal = { type: 'team' };
    
    openModal('add-goal-modal');
  };

  window.openAddUserGoalModal = function(userId) {
    document.getElementById('goal-modal-title').textContent = 'Add User Goal';
    document.getElementById('goal-form').reset();
    document.getElementById('importance-group').style.display = 'block';
    document.getElementById('goal-submit-btn').textContent = 'Add Goal';
    
    // Set form to user goal mode
    editingGoal = { type: 'user', userId };
    
    openModal('add-goal-modal');
  };

  window.openEditGoalModal = function(goalId, type, userId) {
    let goal;
    if (type === 'team') {
      goal = teamGoals.find(g => g.id === goalId);
    } else {
      goal = userGoals.find(g => g.id === goalId);
    }
    
    if (!goal) return;
    
    document.getElementById('edit-goal-id').value = goalId;
    document.getElementById('edit-goal-type').value = type;
    document.getElementById('edit-goal-user-id').value = userId || '';
    document.getElementById('edit-goal-title').value = goal.title;
    document.getElementById('edit-goal-description').value = goal.description || '';
    document.getElementById('edit-goal-deadline').value = goal.deadline.split('T')[0];
    
    if (type === 'user') {
      document.getElementById('edit-importance-group').style.display = 'block';
      const importanceRadio = document.querySelector(`input[name="edit-importance"][value="${goal.importance}"]`);
      if (importanceRadio) importanceRadio.checked = true;
    } else {
      document.getElementById('edit-importance-group').style.display = 'none';
    }
    
    openModal('edit-goal-modal');
  };

  // Form submissions
  document.getElementById('goal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const title = document.getElementById('goal-title').value;
    const description = document.getElementById('goal-description').value;
    const deadline = document.getElementById('goal-deadline').value;
    
    if (editingGoal.type === 'team') {
      await addTeamGoal(title, description, deadline);
    } else {
      const importance = document.querySelector('input[name="importance"]:checked').value;
      await addUserGoal(editingGoal.userId, title, description, deadline, importance);
    }
    
    closeModal('add-goal-modal');
    loadTab(currentTab);
  });

  document.getElementById('edit-goal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const goalId = document.getElementById('edit-goal-id').value;
    const type = document.getElementById('edit-goal-type').value;
    const userId = document.getElementById('edit-goal-user-id').value;
    const title = document.getElementById('edit-goal-title').value;
    const description = document.getElementById('edit-goal-description').value;
    const deadline = document.getElementById('edit-goal-deadline').value;
    
    const updates = { title, description, deadline };
    
    if (type === 'user') {
      updates.importance = document.querySelector('input[name="edit-importance"]:checked').value;
    }
    
    await updateGoal(type, goalId, userId, updates);
    
    closeModal('edit-goal-modal');
    loadTab(currentTab);
  });

  // Goal API calls
  async function addTeamGoal(title, description, deadline) {
    try {
      const res = await fetch('/api/staff/team-goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title, description, deadline })
      });
      
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to add goal');
      }
    } catch (e) {
      alert('Network error');
    }
  }

  async function addUserGoal(userId, title, description, deadline, importance) {
    try {
      const res = await fetch(`/api/staff/user-goals/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title, description, deadline, importance })
      });
      
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to add goal');
      }
    } catch (e) {
      alert('Network error');
    }
  }

  async function updateGoal(type, goalId, userId, updates) {
    try {
      let url;
      if (type === 'team') {
        url = `/api/staff/team-goals/${goalId}`;
      } else {
        url = `/api/staff/user-goals/${userId}/${goalId}`;
      }
      
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updates)
      });
      
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to update goal');
      }
    } catch (e) {
      alert('Network error');
    }
  }

  window.toggleTeamGoal = async function(goalId, completed) {
    await updateGoal('team', goalId, null, { completed });
    loadTab('team');
  };

  window.toggleUserGoal = async function(goalId, completed) {
    const userId = currentUser.id;
    await updateGoal('user', goalId, userId, { completed });
    loadTab('me');
  };

  window.createSelfGoal = async function() {
    const title = document.getElementById('self-goal-title').value.trim();
    const description = document.getElementById('self-goal-desc').value.trim();
    const deadline = document.getElementById('self-goal-deadline').value;
    const importance = document.getElementById('self-goal-importance').value;
    
    if (!title) { alert('Title required'); return; }
    if (!deadline) { alert('Deadline required'); return; }
    
    try {
      const res = await fetch(`/api/staff/user-goals/${currentUser.id}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, deadline, importance })
      });
      
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to create goal');
        return;
      }
      
      loadTab('me');
    } catch (e) {
      alert('Failed to create goal');
    }
  };

  window.deleteTeamGoal = async function(goalId, isCompleted) {
    if (!isCompleted) {
      if (!confirm('Are you sure you want to delete this goal?')) return;
    }
    
    try {
      const res = await fetch(`/api/staff/team-goals/${goalId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      if (res.ok) {
        loadTab('team');
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete goal');
      }
    } catch (e) {
      alert('Network error');
    }
  };

  // ── Staff Management ────────────────────────────────────────
  window.openAddStaffModal = function() {
    selectedStaffUser = null;
    document.getElementById('staff-search-input').value = '';
    document.getElementById('staff-search-results').innerHTML = '';
    document.getElementById('add-staff-submit-btn').disabled = true;
    
    openModal('add-staff-modal');
    loadStaffSearchResults();
  };

  document.getElementById('staff-search-input').addEventListener('input', () => {
    loadStaffSearchResults();
  });

  document.getElementById('add-staff-submit-btn').addEventListener('click', async () => {
    if (!selectedStaffUser) return;
    
    try {
      const res = await fetch('/api/staff/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: selectedStaffUser.userId })
      });
      
      if (res.ok) {
        closeModal('add-staff-modal');
        alert('Staff member added successfully');
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to add staff member');
      }
    } catch (e) {
      alert('Network error');
    }
  });

  async function loadStaffSearchResults() {
    const search = document.getElementById('staff-search-input').value;
    const container = document.getElementById('staff-search-results');
    
    try {
      const res = await fetch(`/api/staff/users?search=${encodeURIComponent(search)}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load users');
      
      const data = await res.json();
      users = data.users;
      
      container.innerHTML = users.map(user => `
        <div class="dropdown-option" onclick="selectStaffUser('${user.userId}', '${escapeHtml(user.display)}')">
          ${escapeHtml(user.display)}
        </div>
      `).join('');
      
    } catch (e) {
      container.innerHTML = '<div class="empty-msg">Failed to load users</div>';
    }
  }

  window.selectStaffUser = function(userId, display) {
    selectedStaffUser = users.find(u => u.userId === userId);
    document.getElementById('staff-search-input').value = display;
    document.getElementById('add-staff-submit-btn').disabled = false;
    document.getElementById('staff-search-results').innerHTML = '';
  };

  // User dropdown for viewing/editing goals — only staff members
  async function loadUsersDropdown() {
    try {
      const res = await fetch('/api/staff/members', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load staff members');
      
      const data = await res.json();
      users = data.members.map(m => ({
        userId: m.userId,
        username: m.username,
        first_name: m.first_name,
        last_name_initial: m.last_name_initial,
        display: m.username
          ? `${m.username}: ${m.first_name.toLowerCase()} ${m.last_name_initial.toLowerCase()}`.trim()
          : `${m.first_name} ${m.last_name_initial}`.trim() || 'Unknown'
      }));
      
      const menu = document.getElementById('user-dropdown-menu');
      menu.innerHTML = users.map(user => `
        <button type="button" class="dropdown-option" onclick="selectUserForGoals('${user.userId}')">
          ${escapeHtml(user.display)}
        </button>
      `).join('');
      
      // Toggle dropdown
      const toggle = document.getElementById('user-dropdown-toggle');
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.toggle('open');
      });
      
      document.addEventListener('click', () => {
        menu.classList.remove('open');
      });
      
    } catch (e) {
      console.error('Failed to load users dropdown:', e);
    }
  }

  window.selectUserForGoals = async function(userId) {
    const user = users.find(u => u.userId === userId);
    if (!user) return;
    
    document.getElementById('user-dropdown-toggle').textContent = user.display;
    document.getElementById('user-dropdown-menu').classList.remove('open');
    
    // Load user's goals
    const container = document.getElementById('selected-user-goals');
    container.innerHTML = '<div class="empty-msg">Loading goals...</div>';
    
    try {
      const res = await fetch(`/api/staff/user-goals/${userId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load user goals');
      
      const data = await res.json();
      const goals = data.goals;
      
      if (goals.length === 0) {
        container.innerHTML = `
          <div class="card">
            <div class="empty-msg">No goals for this user.</div>
            <button class="btn-primary" onclick="openAddUserGoalModal('${userId}')">+ Add Goal</button>
          </div>
        `;
        return;
      }
      
      let html = `
        <div class="card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div style="font-size: 0.78rem; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px;">
              Goals for ${escapeHtml(user.username)}
            </div>
            <button class="btn-primary" onclick="openAddUserGoalModal('${userId}')">+ Add Goal</button>
          </div>
      `;
      
      goals.forEach(goal => {
        const deadlineDate = new Date(goal.deadline);
        const isOverdue = deadlineDate < new Date() && !goal.completed;
        
        html += `
          <div class="goal-card ${goal.completed ? 'completed' : ''}">
            <div class="goal-header">
              <div class="goal-title ${goal.completed ? 'completed' : ''}">${escapeHtml(goal.title)}</div>
              <span class="importance-badge importance-${goal.importance}">${goal.importance}</span>
            </div>
            ${goal.description ? `<div class="goal-description">${escapeHtml(goal.description)}</div>` : ''}
            <div class="goal-meta">
              <span>📅 ${formatDate(goal.deadline)}${isOverdue ? ' (Overdue)' : ''}</span>
              ${goal.completed_at ? `<span>✓ Completed ${formatDate(goal.completed_at)}</span>` : ''}
            </div>
            <div class="goal-actions">
              <button class="complete-btn" onclick="toggleUserGoalForUser('${userId}', '${goal.id}', ${!goal.completed})">
                ${goal.completed ? '↩ Undo' : '✓ Complete'}
              </button>
              <button class="edit-btn" onclick="openEditGoalModal('${goal.id}', 'user', '${userId}')">Edit</button>
              <button class="delete-btn" onclick="deleteUserGoal('${userId}', '${goal.id}', ${goal.completed})">Delete</button>
            </div>
          </div>
        `;
      });
      
      html += '</div>';
      container.innerHTML = html;
      
    } catch (e) {
      container.innerHTML = '<div class="empty-msg">Failed to load goals</div>';
    }
  };

  window.toggleUserGoalForUser = async function(userId, goalId, completed) {
    await updateGoal('user', goalId, userId, { completed });
    selectUserForGoals(userId);
  };

  window.deleteUserGoal = async function(userId, goalId, isCompleted) {
    if (!isCompleted) {
      if (!confirm('Are you sure you want to delete this goal?')) return;
    }
    
    try {
      const res = await fetch(`/api/staff/user-goals/${userId}/${goalId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      if (res.ok) {
        selectUserForGoals(userId);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete goal');
      }
    } catch (e) {
      alert('Network error');
    }
  };

  // ── Log Filtering ───────────────────────────────────────────
  window.filterLogs = function() {
    const search = document.getElementById('log-search-input').value.toLowerCase();
    const logCards = document.querySelectorAll('.log-card');
    
    logCards.forEach(card => {
      const searchData = card.dataset.search.toLowerCase();
      card.style.display = searchData.includes(search) ? '' : 'none';
    });
  };

  // ── Modal Helpers ───────────────────────────────────────────
  window.openModal = function(id) {
    document.getElementById(id).classList.add('open');
  };

  window.closeModal = function(id) {
    document.getElementById(id).classList.remove('open');
  };

  // Close modal on outside click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('open');
      }
    });
  });

  // ── Utility Functions ───────────────────────────────────────
  function escapeHtml(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatDateTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit', 
      minute: '2-digit'
    });
  }

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
