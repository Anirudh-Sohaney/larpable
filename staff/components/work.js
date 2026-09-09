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
 *   - user_control: browse platform users (search / filter / sort, 6 at a
 *     time in a scrollable list), open a full profile popup and remove
 *     accounts after a confirmation.
 *
 * INTEGRATION:
 *   GET  /api/staff/work/taxonomy          (skills_control)
 *   POST /api/staff/work/taxonomy          (skills_control)
 *   DELETE /api/staff/work/taxonomy/:kind/:label (skills_control)
 *   GET  /api/staff/work/users             (user_control)
 *   DELETE /api/staff/work/users/:id       (user_control)
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
    uVisible: 70
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

  async render(container) {
    const canSkills = App.can('skills_control');
    const canUsers = App.can('user_control');
    if (!canSkills && !canUsers) {
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
  }
};