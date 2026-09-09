const Filters = {
  picks: { skill: new Set(), field: new Set() },
  facets: { skill: new Map(), field: new Map() },
  taxonomy: { skills: [], fields: [] },
  matchCounts: {},

  normalize(value) {
    return typeof normalizeSynonym === 'function' ? normalizeSynonym(value) : value;
  },

  async init() {
    const entities = await DataStore.getEntities();
    this.taxonomy.skills = entities.filter(e => e.type === 'skill').map(e => e.name);
    this.taxonomy.fields = entities.filter(e => e.type === 'interest' || e.type === 'industry').map(e => e.name);
    this.setupDropdowns();
    this.setupControls();
  },

  setupDropdowns() {
    for (const kind of ['skill', 'field']) {
      const button = document.getElementById('btn-' + kind);
      if (!button) continue;
      const menu = document.getElementById('menu-' + kind);
      const wrapper = document.getElementById('dd-' + kind);
      button.addEventListener('click', e => {
        e.stopPropagation();
        const open = menu.hidden;
        this.closeAll(kind);
        menu.hidden = !open;
        wrapper.classList.toggle('is-open', open);
        if (open) document.getElementById('search-' + kind).focus();
      });
      document.getElementById('search-' + kind).addEventListener('input', () => this.paint(kind));
      menu.addEventListener('click', e => e.stopPropagation());
      document.getElementById('list-' + kind).addEventListener('change', e => {
        const input = e.target.closest('input');
        if (!input) return;
        if (input.checked) this.picks[kind].add(input.value); else this.picks[kind].delete(input.value);
        this.paint(kind);
        Feed.render();
      });
      menu.querySelector('[data-clear]').addEventListener('click', () => {
        this.picks[kind].clear(); this.paint(kind); Feed.render();
      });
    }
    document.addEventListener('click', () => this.closeAll());
    document.addEventListener('keydown', e => { if (e.key === 'Escape') this.closeAll(); });
  },

  fillSelects() {
    const tally = (kind, values, read) => {
      const map = new Map(values.map(v => [v, 0]));
      for (const opp of Feed.opportunities) for (const value of read(opp)) if (value) {
        const normalized = this.normalize(value);
        map.set(normalized, (map.get(normalized) || 0) + 1);
      }
      this.facets[kind] = new Map([...map].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
      this.paint(kind);
    };
    tally('skill', this.taxonomy.skills, o => o.skills || []);
    tally('field', this.taxonomy.fields, o => [Utils.fieldOf(o)]);
  },

  paint(kind) {
    const search = document.getElementById('search-' + kind);
    const list = document.getElementById('list-' + kind);
    if (!search || !list) return;
    const query = search.value.trim().toLowerCase();
    const chosen = this.picks[kind];
    const rows = [...this.facets[kind]].filter(([name]) => !query || name.toLowerCase().includes(query) || chosen.has(name));
    list.innerHTML = rows.length ? rows.map(([name, count]) =>
      `<label class="d-dd-opt${count ? '' : ' is-off'}"><input type="checkbox" value="${Utils.escapeHtml(name)}"${chosen.has(name) ? ' checked' : ''}><span>${Utils.escapeHtml(name)}</span><span class="n">${count}</span></label>`
    ).join('') : '<div class="d-dd-empty">Nothing matches that.</div>';
    const button = document.getElementById('btn-' + kind);
    button.textContent = chosen.size === 0 ? `Any ${kind}` : chosen.size === 1 ? [...chosen][0] : `${chosen.size} ${kind}s`;
    button.classList.toggle('is-set', chosen.size > 0);
    document.getElementById('tally-' + kind).textContent = `${rows.length} shown · ${chosen.size} selected`;
  },

  closeAll(except) {
    for (const kind of ['skill', 'field']) {
      if (kind === except) continue;
      const menu = document.getElementById('menu-' + kind);
      if (menu) menu.hidden = true;
      const wrapper = document.getElementById('dd-' + kind);
      if (wrapper) wrapper.classList.remove('is-open');
    }
  },

  setupControls() {
    document.getElementById('f-type')?.addEventListener('change', () => Feed.render());
    document.getElementById('clear')?.addEventListener('click', () => { this.clearAll(); Feed.render(); });
  },
  getType() { return document.getElementById('f-type')?.value || ''; },
  selectedTotal() { return this.picks.skill.size + this.picks.field.size; },
  apply(opportunities) {
    const skills = [...this.picks.skill], fields = [...this.picks.field];
    this.matchCounts = {};
    if (!skills.length && !fields.length) return [...opportunities];
    return opportunities.filter(o => {
      const oppSkills = (o.skills || []).map(value => this.normalize(value));
      const oppField = this.normalize(Utils.fieldOf(o));
      const hits = skills.filter(s => oppSkills.includes(this.normalize(s))).length + fields.filter(f => oppField === this.normalize(f)).length;
      this.matchCounts[o.id] = hits;
      return hits > 0;
    });
  },
  clearAll() {
    this.picks.skill.clear(); this.picks.field.clear();
    ['q', 'search-skill', 'search-field'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
    const type = document.getElementById('f-type'); if (type) type.value = '';
    const sort = document.getElementById('f-sort'); if (sort) sort.value = 'foryou';
    this.paint('skill'); this.paint('field');
  }
};
