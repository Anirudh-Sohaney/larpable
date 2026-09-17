const Outreach = {
  data: [],
  pollingInterval: null,

  async render(container) {
    const isAdmin = App.currentUser?.username === 'anisohaney' || App.isStaffAdmin;
    const adminHtml = isAdmin ? `
      <button class="sp-btn sp-btn-primary" id="outreach-run-btn" onclick="Outreach.runPipeline()" style="margin-left:auto;">
        <svg style="width:16px;height:16px;vertical-align:middle;margin-right:4px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        Run Pipeline
      </button>
    ` : '';

    let html = `<div class="sp-tab-content">
      <div class="sp-section-header">
        <h2 class="sp-section-title">OUTREACH</h2>
        ${adminHtml}
      </div>
      
      <div id="outreach-pipeline-visuals" style="display:none; background: #000; color: #0f0; font-family: monospace; padding: 12px; border-radius: 8px; margin-bottom: 16px; height: 250px; overflow-y: auto; white-space: pre-wrap; font-size: 12px; box-shadow: inset 0 0 10px rgba(0,0,0,0.5);"></div>

      <div style="display: flex; gap: 8px;">
        <button class="sp-btn sp-btn-secondary active" id="outreach-tab-candidates" onclick="Outreach.switchTab('candidates')">Candidates</button>
        <button class="sp-btn sp-btn-secondary" id="outreach-tab-completed" onclick="Outreach.switchTab('completed')">Completed</button>
      </div>
      <div id="outreach-list" class="sp-card-list" style="margin-top: 16px;">
        <div style="text-align:center; padding: 40px; color: var(--muted, #858076);">Loading outreach targets...</div>
      </div>
    </div>`;
    container.innerHTML = html;
    
    this.currentTab = 'candidates';
    await this.fetchData();
    
    if (isAdmin) {
      this.pollStatus();
    }
  },
  
  async pollStatus() {
    if (this.pollingInterval) clearInterval(this.pollingInterval);
    
    const check = async () => {
      try {
        const res = await fetch('/api/staff/outreach/status');
        if (res.ok) {
          const { running, logs } = await res.json();
          const visuals = document.getElementById('outreach-pipeline-visuals');
          const btn = document.getElementById('outreach-run-btn');
          
          if (!visuals || !btn) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
            return;
          }
          
          if (running || logs.length > 0) {
            visuals.style.display = 'block';
            visuals.textContent = logs || 'Starting pipeline...';
            visuals.scrollTop = visuals.scrollHeight;
          } else {
            visuals.style.display = 'none';
          }
          
          if (running) {
            btn.disabled = true;
            btn.innerHTML = `<svg style="width:16px;height:16px;vertical-align:middle;margin-right:4px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> Pipeline Running...`;
          } else {
            btn.disabled = false;
            btn.innerHTML = `<svg style="width:16px;height:16px;vertical-align:middle;margin-right:4px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Run Pipeline`;
          }
        }
      } catch(e) {}
    };
    
    await check();
    this.pollingInterval = setInterval(check, 2000);
  },
  
  async runPipeline() {
    try {
      const res = await fetch('/api/staff/outreach/run', { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to start pipeline');
      } else {
        this.pollStatus();
      }
    } catch(e) {
      alert('Network error starting pipeline');
    }
  },

  async fetchData() {
    try {
      const res = await fetch('/api/staff/outreach');
      if (res.ok) {
        this.data = await res.json();
      }
    } catch(e) {
      console.error('Failed to fetch outreach data', e);
    }
    this.updateList();
  },

  switchTab(tab) {
    this.currentTab = tab;
    document.getElementById('outreach-tab-candidates').classList.toggle('active', tab === 'candidates');
    document.getElementById('outreach-tab-completed').classList.toggle('active', tab === 'completed');
    this.updateList();
  },

  updateList() {
    const list = document.getElementById('outreach-list');
    if (!list) return;
    
    const isCompletedTab = this.currentTab === 'completed';
    const filtered = this.data.filter(org => (!!org.completed) === isCompletedTab);
    
    if (filtered.length === 0) {
      list.innerHTML = `<div style="text-align:center; padding: 40px; color: var(--muted, #858076);">
        No ${this.currentTab} outreach targets found.
      </div>`;
      return;
    }
    
    list.innerHTML = filtered.map(org => {
      const escapedName = encodeURIComponent(org.name);
      const buttonHtml = isCompletedTab 
        ? `<button class="sp-btn" style="padding:4px 8px; font-size:12px; background:var(--bg-light, #FAF9F7);" onclick="event.stopPropagation(); Outreach.toggleComplete('${escapedName}', false)">Undo</button>`
        : `<button class="sp-btn sp-btn-primary" style="padding:4px 8px; font-size:12px;" onclick="event.stopPropagation(); Outreach.toggleComplete('${escapedName}', true)">Mark Completed</button>`;

      return `
      <div class="sp-card" style="cursor: pointer; padding: 16px; margin-bottom: 8px;" onclick="Outreach.showDetails('${escapedName}')">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <h3 style="margin:0 0 4px 0; font-size:16px; color:var(--text, #3a3835);">${org.name}</h3>
            <div style="color:var(--muted, #858076); font-size:13px;">${org.description || ''}</div>
          </div>
          <div>
            ${buttonHtml}
          </div>
        </div>
      </div>
      `;
    }).join('');
  },
  
  async toggleComplete(encodedName, completed) {
    const name = decodeURIComponent(encodedName);
    const org = this.data.find(o => o.name === name);
    if (org) org.completed = completed;
    this.updateList(); // Optimistic update
    
    try {
      await fetch('/api/staff/outreach', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, completed })
      });
    } catch(e) {
      console.error(e);
      // Revert if error
      if (org) org.completed = !completed;
      this.updateList();
    }
  },

  showDetails(encodedName) {
    const name = decodeURIComponent(encodedName);
    const org = this.data.find(o => o.name === name);
    if (!org) return;
    
    const leadershipHtml = org.leadership && org.leadership.length > 0 
      ? org.leadership.map(l => `<div><b>${l.name}</b> - ${l.title}</div>`).join('')
      : '<div>No leadership info found.</div>';
      
    const emailsHtml = org.emails && org.emails.length > 0 
      ? org.emails.map(e => `<div><a href="mailto:${e}">${e}</a></div>`).join('')
      : '<div>No emails found.</div>';
      
    let html = `
      <div style="margin-bottom:20px;">
        <h2 style="margin:0 0 8px 0; color:var(--text, #3a3835);">${org.name}</h2>
        <p style="color:var(--muted, #858076); font-size:14px; margin:0;">${org.description || ''}</p>
      </div>
      
      <h3 style="font-size:14px; margin:0 0 8px 0; text-transform:uppercase; color:var(--muted, #858076);">Leadership</h3>
      <div style="background:var(--bg-light, #FAF9F7); border:1px solid var(--border, #D6D1C9); border-radius:8px; padding:12px; margin-bottom:16px;">
        ${leadershipHtml}
      </div>
      
      <h3 style="font-size:14px; margin:0 0 8px 0; text-transform:uppercase; color:var(--muted, #858076);">Contact Emails</h3>
      <div style="background:var(--bg-light, #FAF9F7); border:1px solid var(--border, #D6D1C9); border-radius:8px; padding:12px;">
        ${emailsHtml}
      </div>
    `;
    
    this.openPopup(org.name, html);
  },
  
  openPopup(title, contentHtml) {
    let modal = document.getElementById('outreach-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'outreach-modal';
      modal.className = 'sp-modal-overlay';
      modal.innerHTML = `
        <div class="sp-modal" style="max-width:500px;">
          <div class="sp-modal-header">
            <h2 class="sp-modal-title" id="outreach-modal-title"></h2>
            <button class="sp-modal-close" onclick="document.getElementById('outreach-modal').classList.remove('open')">✕</button>
          </div>
          <div class="sp-modal-body" id="outreach-modal-body"></div>
        </div>
      `;
      document.body.appendChild(modal);
    }
    
    document.getElementById('outreach-modal-title').textContent = title;
    document.getElementById('outreach-modal-body').innerHTML = contentHtml;
    modal.classList.add('open');
  }
};
