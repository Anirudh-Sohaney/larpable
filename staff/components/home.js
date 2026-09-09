/* Staff dashboard backed by /api/staff/overview. */
const Home = {
  async render(container) {
    container.innerHTML = '<div class="sp-tab-content"><div class="sp-card">Loading live platform metrics…</div></div>';
    try {
      const [response, inboxResponse] = await Promise.all([
        fetch('/api/staff/overview', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/staff/inbox', { credentials: 'include', cache: 'no-store' })
      ]);
      if (!response.ok || !inboxResponse.ok) throw new Error('Live dashboard request failed');
      const [overview, inbox] = await Promise.all([response.json(), inboxResponse.json()]);
      this.renderData(container, overview, inbox);
      fetch('/api/staff/portal-open', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => null);
    } catch (error) {
      container.innerHTML = '<div class="sp-tab-content"><div class="sp-card"><strong>Live dashboard unavailable.</strong><p style="color:var(--sp-muted);">Sign in with a staff account to view test_data metrics.</p></div></div>';
    }
  },
  esc(value) { return Utils.escapeHtml(String(value ?? '')); },
  number(value) { return Number(value || 0).toLocaleString(); },
  date(value) { return value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'; },
  card(label, value, note, tone = '') {
    return `<div class="sp-stat-card ${tone}"><div class="sp-stat-number">${this.number(value)}</div><div class="sp-stat-label">${this.esc(label)}</div><div class="sp-stat-note">${this.esc(note)}</div></div>`;
  },
  list(title, items, empty = 'No data') {
    const max = items[0]?.count || 1;
    return `<div class="sp-card sp-metric-list"><div class="sp-panel-heading">${this.esc(title)}</div>${items.length ? items.map(item => `<div class="sp-metric-row"><div class="sp-metric-label"><span>${this.esc(item.label)}</span><strong>${this.number(item.count)}</strong></div><div class="sp-metric-track"><div style="width:${Math.max(4, item.count / max * 100)}%"></div></div></div>`).join('') : `<div class="sp-empty-state">${this.esc(empty)}</div>`}</div>`;
  },
  inboxMarkup(inbox) {
    const items = [...(inbox.items || []), ...(inbox.approaching || [])];
    if (!items.length) return `<div class="sp-inbox-live"><div><strong>Latest inbox</strong><span>Nothing new since your last portal visit.</span></div><i>✓</i></div>`;
    return `<div class="sp-inbox-live"><div><strong>Latest inbox</strong><span>${items.slice(0, 6).map(item => `<span class="sp-inbox-line"><b>${this.esc(item.type)}</b> ${this.esc(item.message)}${item.deadline ? ` · due ${this.esc(item.deadline)}` : ''}</span>`).join('')}</span></div><i>${items.length}</i></div>`;
  },
  renderData(container, data, inbox) {
    const t = data.totals;
    const growth = data.growth || [];
    const maxUsers = Math.max(1, ...growth.map(point => point.users || 0));
    const recentGrowth = growth.slice(-14);
    const activeTypes = Object.entries(data.postsByType || {}).sort((a, b) => b[1] - a[1]);
    container.innerHTML = `<div class="sp-tab-content">${this.inboxMarkup(inbox)}
      <div class="sp-section-header"><div><h2 class="sp-section-title">LIVE PLATFORM OVERVIEW</h2><div class="sp-dashboard-subtitle">Real records from <code>/test_data/</code> · launched ${this.date(data.launchDate)}</div></div><span class="sp-live-pill"><i></i> LIVE · ${new Date(data.generatedAt).toLocaleTimeString()}</span></div>
      <div class="sp-stats-grid sp-stats-grid-wide">
        ${this.card('Total users', t.users, `+${this.number(t.usersSinceLaunch)} since launch`, 'sp-stat-primary')}
        ${this.card('New users · 7 days', t.usersLast7Days, `${this.number(t.usersLast30Days)} in 30 days`)}
        ${this.card('Opportunities', t.posts, `+${this.number(t.postsSinceLaunch)} since launch`)}
        ${this.card('New posts · 7 days', t.postsLast7Days, `${this.number(t.postsLast30Days)} in 30 days`)}
        ${this.card('Verified users', t.verifiedUsers, `${t.users ? Math.round(t.verifiedUsers / t.users * 100) : 0}% of users`)}
        ${this.card('Staff accounts', t.staff, 'with portal access')}
      </div>
      <div class="sp-dashboard-grid">
        <div class="sp-card sp-growth-card"><div class="sp-panel-heading"><span>User growth</span><small>Daily registrations since Aug 30</small></div><div class="sp-growth-chart">${recentGrowth.map(point => `<div class="sp-growth-column"><div class="sp-growth-value">${point.users ?? ''}</div><div class="sp-growth-bar" style="height:${(point.users || 0) / maxUsers * 100}%"></div><span>${this.esc(point.date.slice(5))}</span></div>`).join('')}</div><div class="sp-chart-legend"><span><i class="sp-legend-dot users"></i> Daily registrations</span><span><i class="sp-legend-dot posts"></i> ${this.number(t.posts)} total opportunities</span></div></div>
        <div class="sp-card"><div class="sp-panel-heading"><span>Opportunity mix</span><small>All published test records</small></div><div class="sp-type-list">${activeTypes.map(([type, count]) => `<div><span>${this.esc(type)}</span><strong>${this.number(count)}</strong></div>`).join('') || '<div class="sp-empty-state">No opportunities</div>'}</div></div>
      </div>
      <div class="sp-dashboard-grid sp-dashboard-grid-three">${this.list('Top user skills', data.topSkills)}${this.list('Top user interests', data.topInterests)}${this.list('Opportunity fields', data.topFields)}</div>
      <div class="sp-dashboard-grid">
        <div class="sp-card"><div class="sp-panel-heading"><span>Recent users</span><small>${this.number(t.users)} total</small></div><div class="sp-recent-list">${(data.recentUsers || []).map(user => `<div class="sp-recent-row"><div class="sp-avatar">${this.esc((user.username || '?')[0].toUpperCase())}</div><div><strong>${this.esc(user.username)}</strong><small>${this.date(user.created_at)} · ${(user.skills || []).length} skills · ${(user.interests || []).length} interests</small></div></div>`).join('') || '<div class="sp-empty-state">No users</div>'}</div></div>
        <div class="sp-card"><div class="sp-panel-heading"><span>Recent opportunities</span><small>${this.number(t.posts)} total</small></div><div class="sp-recent-list">${(data.recentPosts || []).map(post => `<div class="sp-recent-row"><div class="sp-post-mark">↗</div><div><strong>${this.esc(post.title)}</strong><small>${this.esc(post.type)} · ${this.esc(post.field || 'Unspecified field')} · ${this.date(post.created_at)}</small></div></div>`).join('') || '<div class="sp-empty-state">No opportunities</div>'}</div></div>
      </div>
      <div class="sp-dashboard-footnote">Metrics are computed from current decrypted test fixtures. Historical values are derived from each record’s <code>created_at</code>; no synthetic users or opportunities are included.</div>
    </div>`;
  }
};
