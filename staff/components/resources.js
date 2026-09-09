/**
 * LARPABLE Staff Portal — Resources Component
 * 
 * Resource hub: documents, links, tools, categorized by team or company-wide.
 * 
 * INTEGRATION:
 *   Resources: GET /api/staff/resources?scope=company|team|all&search=
 *   Add: POST /api/staff/resources (admin only)
 *   Delete: DELETE /api/staff/resources/:id (admin only)
 *   Source: data/staff.json -> resources (new section)
 */

const Resources = {
  render(container) {
    const resources = DataStore.getResources(App.resourcesScope, App.resourcesSearch);

    let html = `<div class="sp-tab-content">`;

    // ── Header
    html += `
      <div class="sp-section-header">
        <h2 class="sp-section-title">RESOURCES</h2>
        ${App.isStaffAdmin ? '<button class="sp-btn sp-btn-primary" onclick="App.openAddResourceModal()">+ Add Resource</button>' : ''}
      </div>
    `;

    // ── Shared resource labels
    html += `
      <div class="sp-filter-bar">
        <button class="sp-filter-btn active">Everyone</button>
      </div>
    `;

    // ── Search
    html += `
      <input type="text" class="sp-search" placeholder="Search resources..." value="${Utils.escapeHtml(App.resourcesSearch)}" oninput="Resources.handleSearch(this.value)">
    `;

    // ── Resource List
    if (resources.length === 0) {
      html += '<div class="sp-empty">No resources found.</div>';
    } else {
      // Group by shared label
      const grouped = {};
      resources.forEach(res => {
        const key = res.label || res.category || 'General';
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(res);
      });

      for (const [teamId, teamResources] of Object.entries(grouped)) {
        const teamName = teamId;
        const teamColor = 'var(--sp-muted)';

        html += `
          <div style="margin-bottom:20px;">
            <div style="font-size:0.78rem; font-weight:600; color:${teamColor}; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:10px;">
              ${Utils.escapeHtml(teamName)}
            </div>
        `;

        teamResources.forEach(res => {
          html += `
            <div class="sp-resource-card">
              <div class="sp-resource-title">
                <a href="${Utils.escapeHtml(res.url)}" target="_blank">${Utils.escapeHtml(res.title)}</a>
              </div>
              ${res.description ? `<div class="sp-resource-desc">${Utils.escapeHtml(res.description)}</div>` : ''}
              <div class="sp-resource-meta">
                <span>Added by ${Utils.escapeHtml(res.addedBy)}</span>
                <span>${Utils.formatDate(res.addedAt)}</span>
              </div>
            </div>
          `;
        });

        html += `</div>`;
      }
    }

    html += `</div>`;
    container.innerHTML = html;
  },

  setScope(scope) {
    App.resourcesScope = scope;
    this.render(document.getElementById('main-content'));
  },

  handleSearch: Utils.debounce(function(query) {
    App.resourcesSearch = query;
    Resources.render(document.getElementById('main-content'));
  }, 300)
};
