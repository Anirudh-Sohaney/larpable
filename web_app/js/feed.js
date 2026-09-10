const Feed = {
  opportunities: [], drafts: [], matchScores: {}, distanceMap: {}, showingYours: false, currentSort: 'foryou',

  async init() {
    await DataStore.init();
    if (!DataStore.requireAuth()) return;
    this.currentUser = DataStore.getCurrentUser();
    this.opportunities = await DataStore.getOpportunities();
    this.drafts = await DataStore.getDrafts();
    this.matchScores = await DataStore.computeMatchScores(this.opportunities);
    this.computeDistances();
    this.scored = this.currentUser && ((this.currentUser.skills || []).length || (this.currentUser.interests || []).length);
    this.setupControls();
    Filters.fillSelects();
    this.render();
  },

  computeDistances() {
    const uLat = this.currentUser?.latitude;
    const uLon = this.currentUser?.longitude;
    if (uLat == null || uLon == null) return;
    for (const o of this.opportunities) {
      if (o.remote) { this.distanceMap[o.id] = 0; continue; }
      if (o.latitude == null || o.longitude == null) { this.distanceMap[o.id] = Infinity; continue; }
      const R = 3958.8;
      const dLat = (o.latitude - uLat) * Math.PI / 180;
      const dLon = (o.longitude - uLon) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(uLat * Math.PI / 180) * Math.cos(o.latitude * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
      this.distanceMap[o.id] = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
  },

  setupControls() {
    document.getElementById('q')?.addEventListener('input', () => this.render());
    document.getElementById('f-sort')?.addEventListener('change', e => { this.currentSort = e.target.value; this.render(); });
    document.getElementById('yours-btn')?.addEventListener('click', e => {
      this.showingYours = !this.showingYours;
      e.currentTarget.classList.toggle('is-on', this.showingYours);
      this.render();
    });
  },

  render() {
    const list = document.getElementById('list');
    const count = document.getElementById('count');
    if (!list) return;
    const q = (document.getElementById('q')?.value || '').trim().toLowerCase();
    const type = Filters.getType();
    const selectedTotal = Filters.selectedTotal();
    const user = DataStore.getCurrentUser();
    let rows = this.showingYours ? this.opportunities.filter(o => (o.created_by || o.issuer_id) === user?.id) : [...this.opportunities];
    if (type) rows = rows.filter(o => o.type === type);
    rows = Filters.apply(rows).filter(o => !q || [o.title, o.description, o.issuer_name].some(v => String(v || '').toLowerCase().includes(q)) || (o.skills || []).some(s => (typeof normalizeSynonym === 'function' ? normalizeSynonym(s) : s).toLowerCase().includes(q)));
    rows.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    if (this.currentSort === 'oldest') rows.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
    if (this.currentSort === 'name-az') rows.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    if (this.currentSort === 'foryou') rows.sort((a, b) => (this.matchScores[b.id] || 0) - (this.matchScores[a.id] || 0));
    if (this.currentSort === 'closest') rows.sort((a, b) => (this.distanceMap[a.id] ?? Infinity) - (this.distanceMap[b.id] ?? Infinity));
    if (selectedTotal) rows.sort((a, b) => (Filters.matchCounts[b.id] || 0) - (Filters.matchCounts[a.id] || 0));

    const clear = document.getElementById('clear');
    if (clear) clear.hidden = !(q || type || selectedTotal);
    const typeSel = document.getElementById('f-type');
    if (typeSel) typeSel.classList.toggle('is-set', !!type);

    const draftHtml = (this.showingYours ? this.drafts : []).map(d => this.renderDraft(d)).join('');
    const n = rows.length + (this.showingYours ? this.drafts.length : 0);
    if (count) {
      const forYouDead = this.currentSort === 'foryou' && !selectedTotal && !this.scored;
      const closestDead = this.currentSort === 'closest' && this.currentUser?.latitude == null;
      count.title = forYouDead ? 'Add skills and interests to your profile to personalise this order'
        : closestDead ? 'Add your location to your profile to sort by distance' : '';
      count.textContent = this.showingYours
        ? `${n} of your ${n === 1 ? 'post' : 'posts'}`
        : `${n} ${n === 1 ? 'opportunity' : 'opportunities'}`;
    }

    list.innerHTML = (draftHtml + rows.map(o => this.renderCard(o)).join(''))
      || `<div class="d-empty">${this.showingYours
          ? 'You have not posted anything yet.'
          : 'Nothing matches those filters. <button class="d-btn-ghost" onclick="Filters.clearAll(); Feed.render()">Clear filters</button>'}</div>`;
  },

  renderCard(o) {
    const selected = Filters.selectedTotal();
    const showDist = this.currentSort === 'closest' && this.distanceMap[o.id] != null && this.distanceMap[o.id] !== Infinity;
    const hits = Filters.matchCounts[o.id] || 0;
    const loc = Utils.locText(o.location);
    const isRemote = o.remote !== undefined ? !!o.remote : /remote/i.test(o.location || '');
    const all = o.skills || [];
    const skills = all.slice(0, 6).map(s => `<span class="d-skill-tag">${Utils.escapeHtml(s)}</span>`).join('')
      + (all.length > 6 ? `<span class="d-skill-tag d-skill-tag--more">+${all.length - 6} more</span>` : '');
    const links = (o.contact_links || []).length;
    const mine = this.showingYours && (o.created_by || o.issuer_id) === DataStore.getCurrentUser()?.id;
    const TYPE = { project: 'Project', nonprofit: 'Nonprofit', company: 'Company' };

    const bits = [
      o.looking_for ? Utils.meta('◦', 'Looking for', '<strong>' + Utils.escapeHtml(o.looking_for) + '</strong>') : '',
      loc ? Utils.meta('⌖', 'Location', Utils.escapeHtml(loc) + (isRemote ? ' · remote ok' : ''))
          : (isRemote ? Utils.meta('⌖', 'Location', 'Remote') : ''),
      Utils.fieldOf(o) ? Utils.meta('▪', o.type === 'nonprofit' ? 'Field' : 'Industry', Utils.escapeHtml(Utils.fieldOf(o))) : '',
      links ? Utils.meta('↗', 'Contact', links + (links === 1 ? ' link' : ' links')) : ''
    ].filter(Boolean).join('');

    return `<a class="d-opp-card" href="/opportunity?id=${encodeURIComponent(o.id)}">
      <div class="d-opp-top">
        <div class="d-opp-title">${Utils.escapeHtml(o.title || 'Untitled')}</div>
        <div style="display:flex;gap:0.35rem;align-items:center;">
          ${selected ? `<span class="d-badge d-badge--match">${hits}/${selected} matched</span>` : ''}
          ${showDist ? `<span class="d-badge d-badge--match">${this.distanceMap[o.id] === 0 ? 'Remote' : Math.round(this.distanceMap[o.id]) + ' mi'}</span>` : ''}
          <span class="d-badge d-badge--${o.type || 'project'}">${TYPE[o.type] || 'Project'}</span>
        </div>
      </div>
      <div class="d-opp-issuer">Posted by <strong>${Utils.escapeHtml(o.issuer_name || 'Unknown')}</strong>${o.issuer_context ? ' · ' + Utils.escapeHtml(o.issuer_context) : ''}</div>
      ${o.description ? `<div class="d-opp-desc">${Utils.escapeHtml(o.description)}</div>` : ''}
      ${bits ? `<div class="d-opp-meta">${bits}</div>` : ''}
      ${skills ? `<div class="d-opp-looking">${skills}</div>` : ''}
      <div class="d-opp-footer">
        <span class="d-opp-posted">${Utils.escapeHtml(o.posted || Utils.postedAgo(o.created_at))}</span>
        <span class="d-opp-action">${mine ? 'Manage' : 'Learn more'} →</span>
      </div>
    </a>`;
  },

  renderDraft(d) {
    const f = d.fields || {};
    const skills = (f.skills || []).slice(0, 6).map(s => `<span class="d-skill-tag">${Utils.escapeHtml(s)}</span>`).join('');
    return `<a class="d-opp-card d-opp-card--draft" href="/create_student?draft=${encodeURIComponent(d.id)}">
      <div class="d-opp-top">
        <div class="d-opp-title">${Utils.escapeHtml(f.title || 'Untitled draft')}</div>
        <span class="d-badge d-badge--draft">Draft</span>
      </div>
      ${f.description ? `<div class="d-opp-desc">${Utils.escapeHtml(f.description)}</div>` : ''}
      ${skills ? `<div class="d-opp-looking">${skills}</div>` : ''}
      <div class="d-opp-footer">
        <span class="d-opp-posted">Saved ${Utils.timeAgo(d.updated_at)}</span>
        <span class="d-opp-action">Finish it →</span>
      </div>
    </a>`;
  }
};
