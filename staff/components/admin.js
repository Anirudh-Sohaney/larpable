/**
 * LARPABLE Staff Portal — Admin Component
 * 
 * Admin-only panel: data management, staff management, team management.
 * Only visible to anisohaney (staff admin).
 * 
 * INTEGRATION:
 *   Data size: GET /api/staff/data-size (requireStaffAdmin)
 *     Source: fs.readdirSync(DATA_DIR) + fs.statSync per file
 *   Staff: GET /api/staff/members, POST /api/staff/members, DELETE /api/staff/members/:userId
 *   Users: GET /api/staff/users?search= (requireStaffAdmin)
 *   Cleanup: New endpoints for bulk operations on old data
 *   Source: data/staff.json, data/users.json
 */

// Permission catalog shown in the staff management table. Admin permissions
// are fixed; these are the grants anisohaney can toggle for other staff.
const PERMISSIONS = [
  { id: 'modify_calendar', label: 'Calendar', desc: 'Create and edit calendar events' },
  { id: 'assign_goals', label: 'Goals', desc: 'Create and edit goals' },
  { id: 'assign_tasks', label: 'Tasks', desc: 'Create and edit tasks' },
  { id: 'manage_staff', label: 'Manage staff', desc: 'Add/remove staff and edit their permissions' },
  { id: 'skills_control', label: 'Skills control', desc: 'Access the Work tab and manage skills, interests and fields' },
  { id: 'user_control', label: 'User control', desc: 'Browse users and remove accounts from the Work tab' },
  { id: 'opportunities_control', label: 'Opportunity posts', desc: 'Browse and remove opportunity posts from the Work tab' },
  { id: 'flagged_control', label: 'Flagged posts', desc: 'Access the flagged posts section in the Work tab' }
];

const Admin = {
  render(container) {
    if (!App.isStaffAdmin) {
      container.innerHTML = '<div class="sp-empty">Access denied. Admin only.</div>';
      return;
    }

    const dataInfo = DataStore.getDataInfo();
    const members = DataStore.getStaffMembers();
    const allLogs = DataStore.getLogs('all', '');
    const allGoals = DataStore.getCompanyGoals();

    let html = `<div class="sp-tab-content">`;

    // ── Header
    html += `
      <div class="sp-section-header">
        <h2 class="sp-section-title">ADMIN PANEL</h2>
      </div>
    `;

    // ── Data Management
    // INTEGRATION: GET /api/staff/data-size returns { sizeGB, path }
    //   File breakdown: iterate data/ directory and report each file's size
    //   Cleanup endpoints: DELETE /api/staff/data/cleanup-logs?olderThan=30d
    //     POST /api/staff/data/archive (compress old data)
    html += `
      <div class="sp-admin-section">
        <div class="sp-admin-section-title">DATA MANAGEMENT</div>
        <div style="display:flex; gap:20px; align-items:center; margin-bottom:16px; flex-wrap:wrap;">
          <div>
            <div style="font-size:0.78rem; color:var(--sp-muted);">Total Data Size</div>
            <div style="font-size:1.4rem; font-weight:700; color:var(--sp-accent);">${dataInfo.sizeGB} GB</div>
            <div style="font-size:0.72rem; color:var(--sp-muted);">Path: ${Utils.escapeHtml(dataInfo.path)}</div>
          </div>
        </div>

        <div style="font-size:0.78rem; font-weight:600; color:var(--sp-muted); margin-bottom:8px; text-transform:uppercase; letter-spacing:0.5px;">Files</div>
    `;

    dataInfo.files.forEach(file => {
      html += `
        <div class="sp-data-file-row">
          <span class="sp-data-file-name">${Utils.escapeHtml(file.name)}</span>
          <div style="display:flex; gap:16px; align-items:center;">
            <span class="sp-data-file-size">${file.sizeKB} KB</span>
            <span style="font-size:0.72rem; color:var(--sp-muted);">${Utils.timeAgo(file.lastModified)}</span>
          </div>
        </div>
      `;
    });

    html += `
        <div style="margin-top:16px; display:flex; gap:8px; flex-wrap:wrap;">
          <button class="sp-btn" onclick="Admin.cleanupLogs()">Cleanup Old Logs (30+ days)</button>
          <button class="sp-btn" onclick="Admin.archiveCompleted()">Archive Completed Goals</button>
        </div>
      </div>
    `;

    // ── Staff Management
    // INTEGRATION: GET/POST/DELETE /api/staff/members
    html += `
      <div class="sp-admin-section">
        <div class="sp-admin-section-title">STAFF MANAGEMENT</div>
        <div style="margin-bottom:14px;">
          <button class="sp-btn sp-btn-primary" onclick="App.openAddStaffModal()">+ Add Staff Member</button>
        </div>

        <table class="sp-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Name</th>
              <th>Permissions</th>
              <th>Added</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
    `;

    members.forEach(member => {
      const isSelf = member.userId === App.currentUser.id;
      html += `
        <tr>
          <td><strong>${Utils.escapeHtml(member.username)}</strong>${isSelf ? ' <span style="font-size:0.68rem; color:var(--sp-accent);">(you)</span>' : ''}</td>
          <td>${Utils.escapeHtml(member.firstName)} ${Utils.escapeHtml(member.lastNameInitial)}.</td>
          <td class="sp-perm-cell" id="perm-${member.userId}">
            ${member.isAdmin
              ? '<span style="font-size:0.78rem; color:var(--sp-green);">All permissions</span>'
              : PERMISSIONS.map(p => `<label class="sp-perm-chip" title="${p.desc}"><input type="checkbox" data-perm="${p.id}" ${(member.permissions || []).includes(p.id) ? 'checked' : ''}> ${p.label}</label>`).join('') +
                `<button class="sp-btn" style="font-size:0.72rem;" onclick="Admin.savePermissions('${member.userId}')">Save</button>`}
          </td>
          <td style="font-size:0.78rem; color:var(--sp-muted);">${Utils.formatDate(member.addedAt)}</td>
          <td>
            ${!isSelf ? `<button class="sp-btn" onclick="App.removeStaffMember('${member.userId}')" style="font-size:0.72rem; color:var(--sp-red); border-color:var(--sp-red);">Remove</button>` : ''}
          </td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;

    // ── System Overview
    html += `
      <div class="sp-admin-section">
        <div class="sp-admin-section-title">SYSTEM OVERVIEW</div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:12px;">
          <div class="sp-card" style="text-align:center;">
            <div style="font-size:1.6rem; font-weight:700; color:var(--sp-accent);">${members.length}</div>
            <div style="font-size:0.78rem; color:var(--sp-muted);">Staff Members</div>
          </div>
          <div class="sp-card" style="text-align:center;">
            <div style="font-size:1.6rem; font-weight:700; color:var(--sp-indigo);">${allGoals.length}</div>
            <div style="font-size:0.78rem; color:var(--sp-muted);">Company Goals</div>
          </div>
          <div class="sp-card" style="text-align:center;">
            <div style="font-size:1.6rem; font-weight:700; color:var(--sp-green);">${allLogs.length}</div>
            <div style="font-size:0.78rem; color:var(--sp-muted);">Log Entries</div>
          </div>
        </div>
      </div>
    `;

    html += `</div>`;
    container.innerHTML = html;
  },

  async savePermissions(userId) {
    // INTEGRATION: PATCH /api/staff/members/:userId/permissions { permissions }
    // Auth: requireStaffAdmin (manage_staff)
    const cell = document.getElementById('perm-' + userId);
    const permissions = [...cell.querySelectorAll('input[data-perm]:checked')].map(c => c.dataset.perm);
    try {
      const response = await fetch(`/api/staff/members/${encodeURIComponent(userId)}/permissions`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not save permissions');
      const member = DEMO_DATA.staffMembers.find(m => m.userId === userId);
      if (member) member.permissions = permissions;
      alert('Permissions saved.');
    } catch (error) {
      alert(error.message);
    }
  },

  async refreshLive() {
    const res = await fetch('/api/staff/data', { credentials: 'include', cache: 'no-store' });
    if (!res.ok) throw new Error('Could not refresh data');
    DataStore.hydrateLive(await res.json());
  },

  async cleanupLogs() {
    if (!confirm('Remove all logs older than 30 days? This cannot be undone.')) return;
    try {
      const res = await fetch('/api/staff/data/cleanup-logs?olderThan=30', { method: 'DELETE', credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Cleanup failed');
      alert(`Removed ${data.removed} old log${data.removed === 1 ? '' : 's'}.`);
      await this.refreshLive();
      this.render(document.getElementById('main-content'));
    } catch (error) {
      alert(error.message);
    }
  },

  async archiveCompleted() {
    if (!confirm('Archive completed goals older than 60 days?')) return;
    try {
      const res = await fetch('/api/staff/data/archive', { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Archive failed');
      alert(data.archived
        ? `Archived ${data.archived} completed goal${data.archived === 1 ? '' : 's'}.`
        : 'No completed goals older than 60 days.');
      await this.refreshLive();
      this.render(document.getElementById('main-content'));
    } catch (error) {
      alert(error.message);
    }
  }
};
