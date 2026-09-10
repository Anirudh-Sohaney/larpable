/**
 * LARPABLE Staff Portal — Work Component
 *
 * Platform controls, shown only to staff holding a platform-control
 * permission (admins always have them). Each control is gated by its own
 * permission:
 *
 *   - skills_control: the skills / interests / fields vocabulary that powers
 *     the matching algorithm and the searchable pickers across the site.
 *       Add: pick a kind, type the word (the display label), definition
 *            sentences (fed into the transformer so the stored vector is
 *            attracted to the intended sense) and synonyms (used for search;
 *            also averaged into the vector).
 *       Existing: search the vocabulary (words + synonyms) and remove
 *            entries, 6 at a time.
*  - user_control: browse platform users (search / filter / sort, in a
 *    scrollable list), open a full profile popup and remove accounts after
 *    a confirmation.
 *  - opportunities_control: browse published opportunity posts (search /
 *    filter by type, newest first, scrollable list), open a full detail
 *    popup and remove posts after a confirmation.
 *  - flagged_control: moderate the flagged-posts queue — every post matched
 *    by the profanity filter lands here immediately; approve it to publish it
 *    (clears the flag so it shows in the public feed like any other post) or
 *    delete it to remove it from all data.
 *
 * INTEGRATION:
 *   GET  /api/staff/work/taxonomy          (skills_control)
 *   POST /api/staff/work/taxonomy          (skills_control)
 *   DELETE /api/staff/work/taxonomy/:kind/:label (skills_control)
 *   GET  /api/staff/work/users             (user_control)
 *   DELETE /api/staff/work/users/:id       (user_control)
 *   GET  /api/staff/work/opportunities     (opportunities_control)
 *   DELETE /api/staff/work/opportunities/:id (opportunities_control)
 *   GET  /api/staff/work/flagged            (flagged_control)
 *   POST /api/staff/work/flagged/:id/approve (flagged_control)
 *   DELETE /api/staff/work/flagged/:id      (flagged_control)
 */

const Work = {
  state: {
    addKind: 'skill',
    listKind: 'skill',
    search: '',
    visible: 70,
    data: null,
    loading: false,
    users: null,
    uSearch: '',
    uFilter: 'all',
    uSort: 'newest',
    uVisible: 70,
    opps: null,
    oSearch: '',
    oFilter: 'all',
    oVisible: 70,
    flagged: null,
    fSearch: '',
    fVisible: 70
  },

  kinds() {
    return [
      { id: 'skill', label: 'Skill' },
      { id: 'interest', label: 'Interest' },
      { id: 'field', label: 'Field' }
    ];
  },

  listLabel() {
    return this.state.listKind === 'skill' ? 'Skills' : this.state.listKind === 'interest' ? 'Interests' : 'Fields';
  },

  async fetchTaxonomy() {
    const response = await fetch('/api/staff/work/taxonomy', { credentials: 'include', cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load the vocabulary.');
    return response.json();
  },

  async fetchUsers() {
    const response = await fetch('/api/staff/work/users', { credentials: 'include', cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load the user list.');
    return response.json();
  },

  async fetchOpportunities() {
    const response = await fetch('/api/staff/work/opportunities', { credentials: 'include', cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load opportunity posts.');
    return response.json();
  },

  async fetchFlagged() {
    const response = await fetch('/api/staff/work/flagged', { credentials: 'include', cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load flagged posts.');
    return response.json();
  },

  async render(container) {
    const canSkills = App.can('skills_control');
    const canUsers = App.can('user_control');
    const canOpps = App.can('opportunities_control');
    const canFlagged = App.can('flagged_control');
    if (!canSkills && !canUsers && !canOpps && !canFlagged) {
      container.innerHTML = '<div class="sp-tab-content"><div class="sp-empty">Access denied. A platform-control permission is required.</div></div>';
      return;
    }

    container.innerHTML = `
      <div class="sp-tab-content">
        <div class="sp-section-header">
          <h2 class="sp-section-title">WORK</h2>
        </div>

        ${canSkills ? `
        <div class="sp-admin-section">
          <div class="sp-admin-section-title">ADD</div>
          <div class="sp-work-kind-tabs" id="work-add-kind-tabs">
            ${this.kinds().map(k => `<button class="sp-work-kind${k.id === this.state.addKind ? ' active' : ''}" onclick="Work.setAddKind('${k.id}')">${k.label}</button>`).join('')}
          </div>
          <div class="sp-form-group">
            <label class="sp-form-label">Word <span style="color:var(--sp-muted); font-weight:400;">— shown everywhere skills/interests/fields appear</span></label>
            <input type="text" class="sp-form-input" id="work-label" placeholder="e.g. Python" maxlength="80">
          </div>
          <div class="sp-form-group">
            <label class="sp-form-label">Sentences <span style="color:var(--sp-muted); font-weight:400;">— one per line, fed into the transformer to attract the vector</span></label>
            <textarea class="sp-form-input" id="work-sentences" rows="4" placeholder="Python is a high-level programming language used for backend development.&#10;Python is widely used to build API servers and web applications."></textarea>
          </div>
          <div class="sp-form-group">
            <label class="sp-form-label">Synonyms <span style="color:var(--sp-muted); font-weight:400;">— comma separated, so searching them still finds this word</span></label>
            <input type="text" class="sp-form-input" id="work-synonyms" placeholder="coding, scripting, programming language" maxlength="500">
          </div>
          <div class="sp-form-actions">
            <button class="sp-btn sp-btn-primary" id="work-add-btn" onclick="Work.submit()">Add ${this.state.addKind}</button>
            <span id="work-status" style="font-size:0.78rem; color:var(--sp-muted); align-self:center;"></span>
          </div>
        </div>

        <div class="sp-admin-section">
          <div class="sp-admin-section-title">EXISTING</div>
          <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:12px;">
            <div class="sp-work-kind-tabs" id="work-list-kind-tabs">
              ${this.kinds().map(k => `<button class="sp-work-kind${k.id === this.state.listKind ? ' active' : ''}" onclick="Work.setListKind('${k.id}')">${k.label === 'Skill' ? 'Skills' : k.label === 'Interest' ? 'Interests' : 'Fields'}</button>`).join('')}
            </div>
            <input type="search" class="sp-form-input" id="work-search" placeholder="Search ${this.listLabel().toLowerCase()}..." style="max-width:280px;" oninput="Work.handleSearch(this.value)">
            <span style="font-size:0.78rem; color:var(--sp-muted);" id="work-count"></span>
          </div>
          <div id="work-list" style="max-height:380px; overflow-y:auto; border:1px solid var(--sp-border); border-radius:var(--sp-radius);"><div class="sp-empty" style="padding:24px;">Loading…</div></div>
        </div>
        ` : ''}

        ${canUsers ? `
        <div class="sp-admin-section">
          <div class="sp-admin-section-title">USERS</div>
          <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:12px;">
            <input type="search" class="sp-form-input" id="work-user-search" placeholder="Search users..." style="max-width:240px;" oninput="Work.handleUserSearch(this.value)">
            <select class="sp-form-input" id="work-user-filter" style="max-width:170px;" onchange="Work.handleUserFilter(this.value)">
              <option value="all">All types</option>
              <option value="staff">Staff access</option>
            </select>
            <select class="sp-form-input" id="work-user-sort" style="max-width:180px;" onchange="Work.handleUserSort(this.value)">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="az">Name A–Z</option>
              <option value="za">Name Z–A</option>
            </select>
            <span style="font-size:0.78rem; color:var(--sp-muted);" id="work-user-count"></span>
          </div>
          <div class="sp-users-list" id="work-user-list" style="max-height:380px; overflow-y:auto; border:1px solid var(--sp-border); border-radius:var(--sp-radius);"><div class="sp-empty" style="padding:24px;">Loading…</div></div>
        </div>
        ` : ''}

        ${canOpps ? `
        <div class="sp-admin-section">
          <div class="sp-admin-section-title">OPPORTUNITY POSTS</div>
          <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:12px;">
            <input type="search" class="sp-form-input" id="work-opp-search" placeholder="Search posts..." style="max-width:240px;" oninput="Work.handleOppSearch(this.value)">
            <select class="sp-form-input" id="work-opp-filter" style="max-width:170px;" onchange="Work.handleOppFilter(this.value)">
              <option value="all">All types</option>
              <option value="project">Project</option>
              <option value="nonprofit">Nonprofit</option>
              <option value="company">Company</option>
            </select>
            <span style="font-size:0.78rem; color:var(--sp-muted);" id="work-opp-count"></span>
          </div>
          <div class="sp-users-list" id="work-opp-list" style="max-height:380px; overflow-y:auto; border:1px solid var(--sp-border); border-radius:var(--sp-radius);"><div class="sp-empty" style="padding:24px;">Loading…</div></div>
        </div>
        ` : ''}

        ${canFlagged ? `
        <div class="sp-admin-section">
          <div class="sp-admin-section-title">FLAGGED POSTS</div>
          <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:12px;">
            <input type="search" class="sp-form-input" id="work-flag-search" placeholder="Search flagged posts..." style="max-width:240px;" oninput="Work.handleFlaggedSearch(this.value)">
            <span style="font-size:0.78rem; color:var(--sp-muted);" id="work-flag-count"></span>
          </div>
          <div class="sp-users-list" id="work-flag-list" style="max-height:380px; overflow-y:auto; border:1px solid var(--sp-border); border-radius:var(--sp-radius);"><div class="sp-empty" style="padding:24px;">Loading…</div></div>
        </div>
        ` : ''}
      </div>
    `;

    if (canSkills) {
      this.state.loading = true;
      try {
        this.state.data = await this.fetchTaxonomy();
        this.renderList();
      } catch (error) {
        document.getElementById('work-list').innerHTML = `<div class="sp-empty" style="padding:24px;">${Utils.escapeHtml(error.message)}</div>`;
      } finally {
        this.state.loading = false;
      }
    }

    if (canUsers) {
      try {
        const result = await this.fetchUsers();
        this.state.users = result.users || [];
        this.renderUsers();
      } catch (error) {
        document.getElementById('work-user-list').innerHTML = `<div class="sp-empty" style="padding:24px;">${Utils.escapeHtml(error.message)}</div>`;
      }
    }

    if (canOpps) {
      try {
        const result = await this.fetchOpportunities();
        this.state.opps = result.opportunities || [];
        this.renderOpps();
      } catch (error) {
        const el = document.getElementById('work-opp-list');
        if (el) el.innerHTML = `<div class="sp-empty" style="padding:24px;">${Utils.escapeHtml(error.message)}</div>`;
      }
    }

    if (canFlagged) {
      try {
        const result = await this.fetchFlagged();
        this.state.flagged = result.flagged || [];
        this.renderFlagged();
      } catch (error) {
        const el = document.getElementById('work-flag-list');
        if (el) el.innerHTML = `<div class="sp-empty" style="padding:24px;">${Utils.escapeHtml(error.message)}</div>`;
      }
    }
  },

  setAddKind(kind) {
    this.state.addKind = kind;
    const btn = document.getElementById('work-add-btn');
    if (btn) btn.textContent = `Add ${kind}`;
    const tabs = document.getElementById('work-add-kind-tabs');
    if (tabs) tabs.querySelectorAll('.sp-work-kind').forEach(b => b.classList.toggle('active', b.textContent.toLowerCase() === kind));
  },

  setListKind(kind) {
    this.state.listKind = kind;
    this.state.search = '';
    this.state.visible = 70;
    const search = document.getElementById('work-search');
    if (search) search.value = '';
    this.renderList();
    const tabs = document.getElementById('work-list-kind-tabs');
    if (tabs) tabs.querySelectorAll('.sp-work-kind').forEach(b => {
      const expected = kind === 'skill' ? 'Skills' : kind === 'interest' ? 'Interests' : 'Fields';
      b.classList.toggle('active', b.textContent === expected);
    });
  },

  handleSearch(value) {
    this.state.search = value;
    this.state.visible = 70;
    this.renderList();
  },

  showMore() {
    this.state.visible = Math.min(this.state.visible + 80, 150);
    this.renderList();
  },

  renderList() {
    const data = this.state.data;
    const container = document.getElementById('work-list');
    const countEl = document.getElementById('work-count');
    if (!data || !container) return;

    const list = data[this.state.listKind === 'skill' ? 'skills' : this.state.listKind === 'interest' ? 'interests' : 'fields'] || [];
    const synonyms = this.state.listKind === 'skill'
      ? (data.skill_synonyms || {})
      : ((data.taxonomy_synonyms || {})[this.state.listKind === 'interest' ? 'interests' : 'fields'] || {});
    const query = this.state.search.trim().toLowerCase();
    const matches = list
      .filter(item => {
        if (!query) return true;
        const word = String(item).toLowerCase();
        const syns = (synonyms[item] || []).map(s => String(s).toLowerCase());
        return word.includes(query) || syns.some(s => s.includes(query));
      })
      .sort((a, b) => a.localeCompare(b));

    countEl.textContent = `${matches.length} / ${list.length}`;
    if (!matches.length) {
      container.innerHTML = '<div class="sp-empty" style="padding:24px;">No matches found.</div>';
      return;
    }
    const shown = matches.slice(0, this.state.visible);
    const kind = this.state.listKind;
    container.innerHTML = shown.map(item => {
      const syns = synonyms[item] || [];
      return `
        <div class="sp-work-row">
          <div style="min-width:0;">
            <div style="font-size:0.88rem; font-weight:600;">${Utils.escapeHtml(item)}</div>
            ${syns.length ? `<div style="font-size:0.72rem; color:var(--sp-muted); margin-top:2px;">${Utils.escapeHtml(syns.join(', '))}</div>` : ''}
          </div>
          <button class="sp-btn" style="font-size:0.72rem; color:var(--sp-red); border-color:var(--sp-red); flex-shrink:0;" onclick="Work.remove('${kind}', '${encodeURIComponent(item)}')">Remove</button>
        </div>
      `;
    }).join('');
    if (matches.length > shown.length) {
      container.insertAdjacentHTML('beforeend', `
        <div style="text-align:center; margin-top:4px;">
          <button class="sp-btn" onclick="Work.showMore()">Show more (${matches.length - shown.length} remaining)</button>
        </div>
      `);
    }
  },

  async submit() {
    const label = (document.getElementById('work-label').value || '').trim();
    const sentences = (document.getElementById('work-sentences').value || '').split('\n').map(s => s.trim()).filter(Boolean);
    const synonyms = (document.getElementById('work-synonyms').value || '').split(',').map(s => s.trim()).filter(Boolean);
    const status = document.getElementById('work-status');
    const btn = document.getElementById('work-add-btn');

    if (!label) { status.textContent = 'A word is required.'; return; }
    if (!sentences.length && !synonyms.length) { status.textContent = 'Add at least one sentence or synonym.'; return; }

    status.textContent = 'Generating vector… this can take a moment.';
    btn.disabled = true;
    try {
      const response = await fetch('/api/staff/work/taxonomy', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: this.state.addKind, label, sentences, synonyms })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not add the word.');
      document.getElementById('work-label').value = '';
      document.getElementById('work-sentences').value = '';
      document.getElementById('work-synonyms').value = '';
      status.textContent = `Added "${label}" with a generated vector.`;
      this.state.data = await this.fetchTaxonomy();
      this.renderList();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      btn.disabled = false;
    }
  },

  async remove(kind, encodedLabel) {
    const label = decodeURIComponent(encodedLabel);
    if (!confirm(`Remove "${label}" from ${kind}s? It will no longer appear in pickers or matching.`)) return;
    try {
      const response = await fetch(`/api/staff/work/taxonomy/${encodeURIComponent(kind)}/${encodeURIComponent(label)}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not remove the word.');
      this.state.data = await this.fetchTaxonomy();
      this.renderList();
    } catch (error) {
      alert(error.message);
    }
  },

  // ── User View ──────────────────────────────────────────────
  userDisplayName(user) {
    return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || user.id;
  },

  handleUserSearch(value) {
    this.state.uSearch = value;
    this.state.uVisible = 70;
    this.renderUsers();
  },

  handleUserFilter(value) {
    this.state.uFilter = value;
    this.state.uVisible = 70;
    this.renderUsers();
  },

  handleUserSort(value) {
    this.state.uSort = value;
    this.renderUsers();
  },

  showMoreUsers() {
    this.state.uVisible = Math.min(this.state.uVisible + 80, 150);
    this.renderUsers();
  },

  matchedUsers() {
    const users = this.state.users || [];
    const query = this.state.uSearch.trim().toLowerCase();
    const filtered = users.filter(user => {
      if (this.state.uFilter === 'staff' && !user.staffAccess) return false;
      if (this.state.uFilter !== 'all' && this.state.uFilter !== 'staff' && user.type !== this.state.uFilter) return false;
      if (!query) return true;
      const haystack = [user.username, user.first_name, user.last_name, user.email, user.location, user.city, user.state, user.country]
        .filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(query);
    });
    const name = user => [user.first_name, user.last_name].filter(Boolean).join(' ').toLowerCase();
    switch (this.state.uSort) {
      case 'oldest': return filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      case 'az': return filtered.sort((a, b) => name(a).localeCompare(name(b)));
      case 'za': return filtered.sort((a, b) => name(b).localeCompare(name(a)));
      default: return filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
  },

  renderUsers() {
    const container = document.getElementById('work-user-list');
    const countEl = document.getElementById('work-user-count');
    if (!container || !countEl) return;
    const matches = this.matchedUsers();
    countEl.textContent = `${matches.length} / ${(this.state.users || []).length}`;
    if (!matches.length) {
      container.innerHTML = '<div class="sp-empty" style="padding:24px;">No users found.</div>';
      return;
    }
    const shown = matches.slice(0, this.state.uVisible);
    container.innerHTML = shown.map(user => `
      <div class="sp-work-row sp-user-row" onclick="Work.openUser('${user.id}')">
        <div style="min-width:0;">
          <div style="font-size:0.88rem; font-weight:600;">${Utils.escapeHtml(this.userDisplayName(user))}${user.staffAccess ? '<span class="sp-user-badge">staff</span>' : ''}</div>
          <div style="font-size:0.72rem; color:var(--sp-muted); margin-top:2px;">@${Utils.escapeHtml(user.username || user.id)} · ${Utils.escapeHtml(user.type)} · joined ${Utils.formatDate(user.created_at)}</div>
        </div>
        <span style="font-size:0.72rem; color:var(--sp-accent); flex-shrink:0;">View →</span>
      </div>
    `).join('');
    if (matches.length > shown.length) {
      container.insertAdjacentHTML('beforeend', `
        <div style="text-align:center; margin-top:4px;">
          <button class="sp-btn" onclick="Work.showMoreUsers()">Show more (${matches.length - shown.length} remaining)</button>
        </div>
      `);
    }
  },

  openUser(userId) {
    const user = (this.state.users || []).find(u => u.id === userId);
    if (!user) return;
    const chips = (items) => items && items.length
      ? items.map(item => `<span class="sp-chip">${Utils.escapeHtml(item)}</span>`).join('')
      : '<span style="color:var(--sp-muted); font-size:0.78rem;">—</span>';
    const location = [user.city, user.state, user.country].filter(Boolean).join(', ') || user.location || '—';
    const row = (label, value) => `
      <div style="display:flex; justify-content:space-between; gap:16px; padding:6px 0; border-bottom:1px solid var(--sp-border);">
        <span style="font-size:0.75rem; color:var(--sp-muted); flex-shrink:0;">${label}</span>
        <span style="font-size:0.82rem; text-align:right;">${value}</span>
      </div>
    `;
    const overlay = document.createElement('div');
    overlay.className = 'sp-modal-overlay open';
    overlay.id = 'work-user-modal';
    overlay.innerHTML = `
      <div class="sp-modal">
        <div class="sp-modal-header">
          <h3 class="sp-modal-title">${Utils.escapeHtml(this.userDisplayName(user))}</h3>
          <button class="sp-modal-close" onclick="Work.closeUserModal()">&times;</button>
        </div>
        <div style="margin-bottom:16px;">
          ${row('Username', `@${Utils.escapeHtml(user.username || user.id)}`)}
          ${row('Email', Utils.escapeHtml(user.email || '—'))}
          ${row('Type', Utils.escapeHtml(user.type))}
          ${row('Joined', Utils.formatDate(user.created_at))}
          ${row('Age', Utils.escapeHtml(user.age || '—'))}
          ${row('Grade', Utils.escapeHtml(user.grade || '—'))}
          ${row('Location', Utils.escapeHtml(location))}
          ${row('Staff access', user.staffAccess ? '<span style="color:var(--sp-green);">Yes</span>' : '<span style="color:var(--sp-muted);">No</span>')}
        </div>
        <div style="margin-bottom:12px;">
          <div style="font-size:0.72rem; font-weight:600; color:var(--sp-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Skills</div>
          <div>${chips(user.skills)}</div>
        </div>
        <div style="margin-bottom:20px;">
          <div style="font-size:0.72rem; font-weight:600; color:var(--sp-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Interests</div>
          <div>${chips(user.interests)}</div>
        </div>
        <div class="sp-form-actions">
          <button class="sp-btn" onclick="Work.closeUserModal()">Close</button>
          <button class="sp-btn" style="color:var(--sp-red); border-color:var(--sp-red);" onclick="Work.removeUser('${user.id}')">Remove user</button>
        </div>
      </div>
    `;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this.closeUserModal(); });
    document.body.appendChild(overlay);
  },

  closeUserModal() {
    const modal = document.getElementById('work-user-modal');
    if (modal) modal.remove();
  },

  async removeUser(userId) {
    const user = (this.state.users || []).find(u => u.id === userId);
    if (!user) return;
    const name = this.userDisplayName(user);
    if (!confirm(`Remove user "${name}" (@${user.username || userId})? Their account, sessions, drafts and opportunities will be permanently deleted. This cannot be undone.`)) return;
    try {
      const response = await fetch(`/api/staff/work/users/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not remove the user.');
      this.closeUserModal();
      this.state.users = this.state.users.filter(u => u.id !== userId);
      this.renderUsers();
    } catch (error) {
      alert(error.message);
    }
  },

  // ── Opportunity Posts ──────────────────────────────────────
  handleOppSearch(value) {
    this.state.oSearch = value;
    this.state.oVisible = 70;
    this.renderOpps();
  },

  handleOppFilter(value) {
    this.state.oFilter = value;
    this.state.oVisible = 70;
    this.renderOpps();
  },

  showMoreOpps() {
    this.state.oVisible = Math.min(this.state.oVisible + 80, 150);
    this.renderOpps();
  },

  matchedOpps() {
    const opps = this.state.opps || [];
    const query = this.state.oSearch.trim().toLowerCase();
    const filtered = opps.filter(opp => {
      if (this.state.oFilter !== 'all' && opp.type !== this.state.oFilter) return false;
      if (!query) return true;
      const haystack = [opp.title, opp.description, opp.looking_for, opp.location, opp.issuer_name, opp.details]
        .filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(query);
    });
    return filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  renderOpps() {
    const container = document.getElementById('work-opp-list');
    const countEl = document.getElementById('work-opp-count');
    if (!container || !countEl) return;
    const matches = this.matchedOpps();
    countEl.textContent = `${matches.length} / ${(this.state.opps || []).length}`;
    if (!matches.length) {
      container.innerHTML = '<div class="sp-empty" style="padding:24px;">No posts found.</div>';
      return;
    }
    const TYPE = { project: 'Project', nonprofit: 'Nonprofit', company: 'Company' };
    const shown = matches.slice(0, this.state.oVisible);
    container.innerHTML = shown.map(opp => {
      const brief = opp.description
        ? (opp.description.length > 120 ? opp.description.slice(0, 120).trimEnd() + '…' : opp.description)
        : '—';
      return `
        <div class="sp-work-row sp-user-row" onclick="Work.openOpp('${opp.id}')">
          <div style="min-width:0;">
            <div style="font-size:0.88rem; font-weight:600;">${Utils.escapeHtml(opp.title)}</div>
            <div style="font-size:0.72rem; color:var(--sp-muted); margin-top:2px;">${Utils.escapeHtml(TYPE[opp.type] || opp.type)} · ${Utils.formatDate(opp.created_at)} · <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:220px; display:inline-block; vertical-align:bottom;">${Utils.escapeHtml(brief)}</span></div>
          </div>
          <span style="font-size:0.72rem; color:var(--sp-accent); flex-shrink:0;">View →</span>
        </div>
      `;
    }).join('');
    if (matches.length > shown.length) {
      container.insertAdjacentHTML('beforeend', `
        <div style="text-align:center; margin-top:4px;">
          <button class="sp-btn" onclick="Work.showMoreOpps()">Show more (${matches.length - shown.length} remaining)</button>
        </div>
      `);
    }
  },

  openOpp(id, fromFlagged) {
    const opp = fromFlagged
      ? (this.state.flagged || []).find(o => o.id === id)
      : (this.state.opps || []).find(o => o.id === id);
    if (!opp) return;
    const TYPE = { project: 'Project', nonprofit: 'Nonprofit', company: 'Company' };
    const chips = (items) => items && items.length
      ? items.map(item => `<span class="sp-chip">${Utils.escapeHtml(item)}</span>`).join('')
      : '<span style="color:var(--sp-muted); font-size:0.78rem;">—</span>';
    const row = (label, value) => `
      <div style="display:flex; justify-content:space-between; gap:16px; padding:6px 0; border-bottom:1px solid var(--sp-border);">
        <span style="font-size:0.75rem; color:var(--sp-muted); flex-shrink:0;">${label}</span>
        <span style="font-size:0.82rem; text-align:right; max-width:320px; word-break:break-word;">${value}</span>
      </div>
    `;
    const overlay = document.createElement('div');
    overlay.className = 'sp-modal-overlay open';
    overlay.id = 'work-opp-modal';
    overlay.innerHTML = `
      <div class="sp-modal">
        <div class="sp-modal-header">
          <h3 class="sp-modal-title">${Utils.escapeHtml(opp.title)}</h3>
          <button class="sp-modal-close" onclick="Work.closeOppModal()">&times;</button>
        </div>
        ${fromFlagged ? `
        <div style="margin-bottom:16px; padding:10px 12px; border:1px solid var(--sp-red); border-radius:var(--sp-radius); background:rgba(220,53,69,0.06);">
          <div style="font-size:0.72rem; font-weight:600; color:var(--sp-red); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Flagged · held from public feed</div>
          <div style="font-size:0.82rem; color:var(--sp-muted); margin-bottom:6px;">Fields: ${Utils.escapeHtml((opp.flagged_fields || []).join(', ') || '—')} · ${Utils.formatDate(opp.flagged_at)}</div>
          <div>${(opp.flagged_terms || []).map(t => `<span class="sp-chip" style="background:rgba(220,53,69,0.08); color:var(--sp-red); border-color:var(--sp-red);">${Utils.escapeHtml(t)}</span>`).join('') || '—'}</div>
        </div>
        ` : ''}
        <div style="margin-bottom:16px;">
          ${row('Type', Utils.escapeHtml(TYPE[opp.type] || opp.type))}
          ${row('Posted', Utils.formatDate(opp.created_at))}
          ${row('Author', Utils.escapeHtml(opp.issuer_name || opp.created_by || '—'))}
          ${row('Location', Utils.escapeHtml(opp.location || '—'))}
          ${row('Remote', opp.remote ? '<span style="color:var(--sp-green);">Yes</span>' : '<span style="color:var(--sp-muted);">No</span>')}
          ${opp.industry ? row('Industry', Utils.escapeHtml(opp.industry)) : ''}
          ${opp.nonprofit_field ? row('Field', Utils.escapeHtml(opp.nonprofit_field)) : ''}
        </div>
        <div style="margin-bottom:12px;">
          <div style="font-size:0.72rem; font-weight:600; color:var(--sp-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Description</div>
          <div style="font-size:0.85rem; white-space:pre-wrap;">${Utils.escapeHtml(opp.description || '—')}</div>
        </div>
        ${opp.looking_for ? `
        <div style="margin-bottom:12px;">
          <div style="font-size:0.72rem; font-weight:600; color:var(--sp-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Looking for</div>
          <div style="font-size:0.85rem; white-space:pre-wrap;">${Utils.escapeHtml(opp.looking_for)}</div>
        </div>
        ` : ''}
        ${opp.details ? `
        <div style="margin-bottom:12px;">
          <div style="font-size:0.72rem; font-weight:600; color:var(--sp-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Details</div>
          <div style="font-size:0.85rem; white-space:pre-wrap;">${Utils.escapeHtml(opp.details)}</div>
        </div>
        ` : ''}
        <div style="margin-bottom:20px;">
          <div style="font-size:0.72rem; font-weight:600; color:var(--sp-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Skills</div>
          <div>${chips(opp.skills)}</div>
        </div>
        <div class="sp-form-actions">
          <button class="sp-btn" onclick="Work.closeOppModal()">Close</button>
          ${fromFlagged ? `<button class="sp-btn" style="color:var(--sp-green); border-color:var(--sp-green);" onclick="Work.approveFlagged('${opp.id}')">Approve post</button>` : ''}
          <button class="sp-btn" style="color:var(--sp-red); border-color:var(--sp-red);" onclick="Work.removeOpp('${opp.id}', ${fromFlagged})">Delete post</button>
        </div>
      </div>
    `;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this.closeOppModal(); });
    document.body.appendChild(overlay);
  },

  closeOppModal() {
    const modal = document.getElementById('work-opp-modal');
    if (modal) modal.remove();
  },

  async removeOpp(id, fromFlagged) {
    const opp = fromFlagged
      ? (this.state.flagged || []).find(o => o.id === id)
      : (this.state.opps || []).find(o => o.id === id);
    if (!opp) return;
    if (!confirm(`Delete ${fromFlagged ? 'flagged ' : 'the '}opportunity "${opp.title}"? This cannot be undone.`)) return;
    const url = fromFlagged
      ? `/api/staff/work/flagged/${encodeURIComponent(id)}`
      : `/api/staff/work/opportunities/${encodeURIComponent(id)}`;
    try {
      const response = await fetch(url, { method: 'DELETE', credentials: 'include' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not delete the opportunity.');
      this.closeOppModal();
      this.state.opps = (this.state.opps || []).filter(o => o.id !== id);
      this.state.flagged = (this.state.flagged || []).filter(o => o.id !== id);
      this.renderOpps();
      this.renderFlagged();
    } catch (error) {
      alert(error.message);
    }
  },

  // ── Flagged Posts ──────────────────────────────────────────
  handleFlaggedSearch(value) {
    this.state.fSearch = value;
    this.state.fVisible = 70;
    this.renderFlagged();
  },

  showMoreFlagged() {
    this.state.fVisible = Math.min(this.state.fVisible + 80, 150);
    this.renderFlagged();
  },

  matchedFlagged() {
    const flagged = this.state.flagged || [];
    const query = this.state.fSearch.trim().toLowerCase();
    return flagged
      .filter(opp => {
        if (!query) return true;
        const haystack = [opp.title, opp.issuer_name, (opp.flagged_terms || []).join(' '), opp.description, opp.looking_for]
          .filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => new Date(b.flagged_at || b.created_at) - new Date(a.flagged_at || a.created_at));
  },

  renderFlagged() {
    const container = document.getElementById('work-flag-list');
    const countEl = document.getElementById('work-flag-count');
    if (!container || !countEl) return;
    const matches = this.matchedFlagged();
    countEl.textContent = `${matches.length} / ${(this.state.flagged || []).length}`;
    if (!matches.length) {
      container.innerHTML = '<div class="sp-empty" style="padding:24px;">No flagged posts awaiting moderation.</div>';
      return;
    }
    const TYPE = { project: 'Project', nonprofit: 'Nonprofit', company: 'Company' };
    const shown = matches.slice(0, this.state.fVisible);
    container.innerHTML = shown.map(opp => {
      const terms = (opp.flagged_terms || []).map(t =>
        `<span class="sp-chip" style="background:rgba(220,53,69,0.08); color:var(--sp-red); border-color:var(--sp-red);">${Utils.escapeHtml(t)}</span>`
      ).join('');
      return `
        <div class="sp-work-row sp-user-row" onclick="Work.openOpp('${opp.id}', true)">
          <div style="min-width:0;">
            <div style="font-size:0.88rem; font-weight:600;">${Utils.escapeHtml(opp.title)}</div>
            <div style="font-size:0.72rem; color:var(--sp-muted); margin-top:2px;">${Utils.escapeHtml(TYPE[opp.type] || opp.type)} · ${Utils.formatDate(opp.created_at)} · ${Utils.escapeHtml(opp.issuer_name || 'Unknown')}</div>
            ${terms ? `<div style="margin-top:4px;">${terms}</div>` : ''}
          </div>
          <div style="flex-shrink:0; display:flex; gap:6px; align-items:center;">
            <button class="sp-btn" style="font-size:0.72rem; color:var(--sp-green); border-color:var(--sp-green);" onclick="event.stopPropagation();Work.approveFlagged('${opp.id}')">Approve</button>
            <button class="sp-btn" style="font-size:0.72rem; color:var(--sp-red); border-color:var(--sp-red);" onclick="event.stopPropagation();Work.removeFlagged('${opp.id}')">Delete</button>
          </div>
        </div>
      `;
    }).join('');
    if (matches.length > shown.length) {
      container.insertAdjacentHTML('beforeend', `
        <div style="text-align:center; margin-top:4px;">
          <button class="sp-btn" onclick="Work.showMoreFlagged()">Show more (${matches.length - shown.length} remaining)</button>
        </div>
      `);
    }
  },

  async approveFlagged(id) {
    const opp = (this.state.flagged || []).find(o => o.id === id);
    if (!opp) return;
    try {
      const response = await fetch(`/api/staff/work/flagged/${encodeURIComponent(id)}/approve`, {
        method: 'POST',
        credentials: 'include'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not approve the post.');
      this.closeOppModal();
      this.state.flagged = this.state.flagged.filter(o => o.id !== id);
      if (!(this.state.opps || []).some(o => o.id === id)) {
        this.state.opps = [opp, ...(this.state.opps || [])];
      }
      this.renderFlagged();
      this.renderOpps();
    } catch (error) {
      alert(error.message);
    }
  },

  async removeFlagged(id) {
    const opp = (this.state.flagged || []).find(o => o.id === id);
    if (!opp) return;
    if (!confirm(`Delete flagged opportunity "${opp.title}"? It will be removed from all data and cannot be undone.`)) return;
    try {
      const response = await fetch(`/api/staff/work/flagged/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not delete the post.');
      this.closeOppModal();
      this.state.flagged = this.state.flagged.filter(o => o.id !== id);
      this.state.opps = (this.state.opps || []).filter(o => o.id !== id);
      this.renderFlagged();
      this.renderOpps();
    } catch (error) {
      alert(error.message);
    }
  }
};