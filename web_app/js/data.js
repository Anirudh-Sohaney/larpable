/* LARPABLE client data layer. API responses stay production-shaped; UI gets plain arrays. */
const DataStore = {
  currentUser: null,
  opportunities: [],
  drafts: [],
  entities: null,
  initialized: false,

  async request(url, options) {
    const response = await fetch(url, { credentials: 'same-origin', ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  },

  normalizeUser(user) {
    const u = user || {};
    const normalized = {
      id: u.id || '', username: u.username || '',
      firstName: u.first_name || u.firstName || '',
      lastName: u.last_name || u.lastName || '',
      email: u.email || '', age: u.age || '', grade: u.grade || '',
      location: u.location || '', city: u.city || '', state: u.state || '', country: u.country || '',
      latitude: u.latitude || null, longitude: u.longitude || null,
      skills: Array.isArray(u.skills) ? [...u.skills] : [],
      interests: Array.isArray(u.interests) ? [...u.interests] : [],
      type: u.type || 'student', role: u.role || (u.type === 'admin' ? 'admin' : 'student'),
      staff_access: !!u.staff_access
    };
    // Strip deprecated 'school' field — no longer used
    delete normalized.school;
    return normalized;
  },

  async init() {
    if (this.initialized) return this.currentUser;
    try {
      const auth = await this.request('/api/auth/me');
      this.currentUser = this.normalizeUser(auth.user);
      if (this.currentUser.role !== 'admin') {
        const profile = await this.request('/api/users/me');
        this.currentUser = this.normalizeUser(profile);
      }
    } catch {
      this.currentUser = null;
    }
    this.initialized = true;
    return this.currentUser;
  },

  getCurrentUser() { return this.currentUser; },

  requireAuth() {
    if (this.currentUser) return true;
    window.location.href = '/login';
    return false;
  },

  async login(username, password) {
    await this.request('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    this.initialized = false;
    await this.init();
    return this.currentUser;
  },

  async logout() {
    await this.request('/api/auth/logout', { method: 'POST' });
    this.currentUser = null;
    this.initialized = true;
  },

  async getOpportunities() {
    const data = await this.request('/api/opportunities');
    this.opportunities = Array.isArray(data) ? data : (data.opportunities || []);
    return this.opportunities.map(o => ({ ...o, skills: Array.isArray(o.skills) ? [...o.skills] : [] }));
  },

  async getDrafts() {
    if (!this.currentUser) return [];
    const data = await this.request('/api/drafts');
    this.drafts = Array.isArray(data) ? data : (data.drafts || []);
    return this.drafts;
  },

  async getEntities() {
    if (this.entities) return this.entities;
    const data = await this.request('/api/match/entities');
    this.entities = Array.isArray(data) ? data : (data.entities || []);
    return this.entities;
  },

  async computeMatchScores(opportunities) {
    const user = this.currentUser;
    if (!user || !opportunities.length) return {};
    const scores = {};
    for (let i = 0; i < opportunities.length; i += 50) {
      const batch = opportunities.slice(i, i + 50).map(o => ({
        id: o.id, skills: o.skills || [], industry: o.industry || o.nonprofit_field || '', type: o.type,
        latitude: o.latitude || null, longitude: o.longitude || null, remote: o.remote
      }));
      try {
        const data = await this.request('/api/match/rank', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user: { skills: user.skills, interests: user.interests }, opportunities: batch })
        });
        for (const item of data.ranked || []) scores[item.opportunity.id] = item.score;
      } catch {
        for (const o of batch) scores[o.id] = this.localScore(o);
      }
    }
    return scores;
  },

  localScore(opp) {
    const skills = new Set((this.currentUser?.skills || []).map(s => s.toLowerCase()));
    const required = opp.skills || [];
    if (!required.length) return 0;
    return Math.round(required.filter(s => skills.has(String(s).toLowerCase())).length / required.length * 100) / 100;
  }
};
