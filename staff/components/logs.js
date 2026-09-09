/**
 * LARPABLE Staff Portal — Logs Component
 * 
 * Activity logs: git pushes, goal changes, staff actions, system events.
 * Filterable by type and searchable.
 * 
 * INTEGRATION:
 *   Logs: GET /api/staff/logs?search=&type=&limit=50
 *   Git logs: GET /api/staff/git-logs (runs git log on the app repo)
 *   Add: POST /api/staff/logs (manual entry)
 *   Source: data/staff.json -> logs
 *   Git: child_process.execSync('git log ...') on the app directory
 */

const Logs = {
  render(container) {
    const logs = DataStore.getLogs(App.logsFilter, App.logsSearch);

    // Count by type for filter badges
    const allLogs = DataStore.getLogs('all', '');
    const counts = {
      all: allLogs.length,
      git_push: allLogs.filter(l => l.type === 'git_push').length,
      team_goal: allLogs.filter(l => l.type === 'team_goal').length,
      user_goal: allLogs.filter(l => l.type === 'user_goal').length,
      staff: allLogs.filter(l => l.type === 'staff').length,
      system: allLogs.filter(l => l.type === 'system').length
    };

    let html = `<div class="sp-tab-content">`;

    // ── Header
    html += `
      <div class="sp-section-header">
        <h2 class="sp-section-title">ACTIVITY LOGS</h2>
      </div>
    `;

    // ── Search
    // INTEGRATION: Server-side search via ?search= query param
    html += `
      <input type="text" class="sp-search" placeholder="Search logs..." value="${Utils.escapeHtml(App.logsSearch)}" oninput="Logs.handleSearch(this.value)">
    `;

    // ── Type Filter
    html += `
      <div class="sp-filter-bar">
        <button class="sp-filter-btn ${App.logsFilter === 'all' ? 'active' : ''}" onclick="Logs.setFilter('all')">All (${counts.all})</button>
        <button class="sp-filter-btn ${App.logsFilter === 'git_push' ? 'active' : ''}" onclick="Logs.setFilter('git_push')">Git (${counts.git_push})</button>
        <button class="sp-filter-btn ${App.logsFilter === 'team_goal' ? 'active' : ''}" onclick="Logs.setFilter('team_goal')">Company Goals (${counts.team_goal})</button>
        <button class="sp-filter-btn ${App.logsFilter === 'user_goal' ? 'active' : ''}" onclick="Logs.setFilter('user_goal')">User Goals (${counts.user_goal})</button>
        <button class="sp-filter-btn ${App.logsFilter === 'staff' ? 'active' : ''}" onclick="Logs.setFilter('staff')">Staff (${counts.staff})</button>
        <button class="sp-filter-btn ${App.logsFilter === 'system' ? 'active' : ''}" onclick="Logs.setFilter('system')">System (${counts.system})</button>
      </div>
    `;

    // ── Log List
    if (logs.length === 0) {
      html += '<div class="sp-empty">No logs match this filter.</div>';
    } else {
      html += `<div style="font-size:0.72rem; color:var(--sp-muted); margin-bottom:8px;">Showing ${logs.length} log${logs.length !== 1 ? 's' : ''}</div>`;
      logs.forEach(log => {
        const typeLabel = {
          git_push: 'Git Push',
      team_goal: 'Company Goal',
          user_goal: 'User Goal',
          staff: 'Staff',
          system: 'System'
        }[log.type] || log.type;

        html += `
          <div class="sp-log-card">
            <div class="sp-log-header">
              <span class="sp-log-timestamp">${Utils.formatDateTime(log.timestamp)}</span>
              <div style="display:flex; gap:6px; align-items:center;">
                <span class="sp-log-type ${log.type}">${typeLabel}</span>
                <span style="font-size:0.72rem; color:var(--sp-muted);">${Utils.escapeHtml(log.action)}</span>
              </div>
            </div>
            <div class="sp-log-details">${Utils.escapeHtml(log.details)}</div>
            ${log.metadata?.hash ? `<div style="font-size:0.72rem; color:var(--sp-muted); margin-top:4px; font-family:monospace;">${Utils.escapeHtml(log.metadata.hash)}${log.metadata.branch ? ' → ' + Utils.escapeHtml(log.metadata.branch) : ''}</div>` : ''}
          </div>
        `;
      });
    }

    html += `</div>`;
    container.innerHTML = html;
  },

  setFilter(filter) {
    App.logsFilter = filter;
    this.render(document.getElementById('main-content'));
  },

  handleSearch: Utils.debounce(function(query) {
    App.logsSearch = query;
    Logs.render(document.getElementById('main-content'));
  }, 300)
};
