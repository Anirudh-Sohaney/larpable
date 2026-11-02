const Feed = {
  opportunities: [], myPosts: [], projects: [], drafts: [], yoursTab: 'projects', matchScores: {}, showingYours: false, currentSort: 'foryou',

  async init() {
    await DataStore.init();
    this.currentUser = DataStore.getCurrentUser();
    if(typeof Panels!=='undefined')Panels.init();
    if(typeof FeedVideos!=='undefined' && !(typeof Panels!=='undefined' && Panels.embedded && window.top!==window))FeedVideos.init();

    // Guests (server-issued pass, no session) get a capped, newest-first,
    // read-only feed. Anyone else without a session is sent to login.
    if (!this.currentUser) {
      const hasGuestPass = typeof App !== 'undefined' && App.isGuest();
      if (!hasGuestPass) { App.navigate('/login'); return; }
      this.guest = true;
      this.opportunities = await DataStore.getOpportunities();
      this.currentSort = 'newest';
      const sortSel = document.getElementById('f-sort');
      if (sortSel) sortSel.value = 'newest';
      this.setupGuestGuards();
      this.render();
      return;
    }

    this.guest = false;
    this.opportunities = await DataStore.getOpportunities();
    [this.myPosts,this.projects,this.drafts] = await Promise.all([
      DataStore.getMyOpportunities(),DataStore.getProjects(),DataStore.getDrafts()
    ]);
    this.matchScores = await DataStore.computeMatchScores(this.opportunities);
    this.scored = this.currentUser && ((this.currentUser.skills || []).length || (this.currentUser.interests || []).length);
    this.setupControls();
    // Deep-link: /feed?mine=1 (used after delete) opens the Your projects tab
    try {
      const params = new URLSearchParams(window.location.search);
      this.yoursTab = params.get('view') === 'posts' ? 'posts' : 'projects';
      if (params.get('mine') === '1' || params.get('mine') === 'true' || window.location.hash === '#yours') {
        this.showingYours = true;
        document.getElementById('yours-btn')?.classList.add('is-on');
      }
    } catch {}
    this.render();
    // Feed data and unread-comment state refresh on page load/explicit refresh.
    // Avoid a background full-feed request every few seconds per open tab.
  },

  setupControls() {
    document.getElementById('q')?.addEventListener('input', () => this.render());
    document.getElementById('yours-btn')?.addEventListener('click', e => {
      this.showingYours = !this.showingYours;
      e.currentTarget.classList.toggle('is-on', this.showingYours);
      try {
        const url = new URL(window.location.href);
        if (this.showingYours) url.searchParams.set('mine', '1');
        else url.searchParams.delete('mine');
        history.replaceState(null, '', url);
      } catch {}
      this.closeDetail();this.render();
    });
    document.querySelectorAll('[data-yours-tab]').forEach(button=>{
      button.addEventListener('click',()=>{
        this.yoursTab=button.dataset.yoursTab;
        const url=new URL(location.href);url.searchParams.set('mine','1');url.searchParams.set('view',this.yoursTab);
        history.replaceState(null,'',url);this.closeDetail();this.render();
      });
      button.addEventListener('keydown',event=>{
        if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
        event.preventDefault();const other=document.querySelector(`[data-yours-tab="${this.yoursTab==='projects' ? 'posts' : 'projects'}"]`);other.click();other.focus();
      });
    });
    document.getElementById('list')?.addEventListener('click',event=>{
      const button=event.target.closest('[data-delete-project],[data-delete-draft]');
      if(!button)return;
      event.preventDefault();event.stopPropagation();
      if(button.dataset.deleteProject)this.deleteProject(button.dataset.deleteProject);
      if(button.dataset.deleteDraft)this.deleteDraft(button.dataset.deleteDraft);
    });
  },

  // Guests see the search box and filters, but every one of them is a gateway
  // to the login page. Capture-phase listeners on the control zones fire
  // before the real handlers, so nothing actually filters or searches.
  setupGuestGuards() {
    const redirect = event => {
      event.preventDefault();
      event.stopPropagation();
      App.navigate('/login');
    };
    for (const selector of ['.d-search-wrap', '.d-filter-row']) {
      const zone = document.querySelector(selector);
      if (!zone) continue;
      for (const type of ['click', 'mousedown', 'input', 'keydown', 'focusin']) {
        zone.addEventListener(type, redirect, true);
      }
    }
    const yoursBtn = document.getElementById('yours-btn');
    if (yoursBtn) yoursBtn.style.display = 'none';
    const createLink = document.getElementById('header-create-link');
    if (createLink) createLink.style.display = 'none';
  },

  render() {
    const list = document.getElementById('list');
    const count = document.getElementById('count');
    if (!list) return;
    document.body.classList.toggle('is-yours',this.showingYours);
    document.getElementById('yours-controls').hidden=!this.showingYours;
    if(this.showingYours){this.renderYours(list,count);return;}
    list.removeAttribute('role');list.removeAttribute('aria-labelledby');
    const q = (document.getElementById('q')?.value || '').trim().toLowerCase();
    const user = DataStore.getCurrentUser();
    let rows = [...this.opportunities];
    const isSavedMode = new URLSearchParams(window.location.search).get('saved') === 'true';
    if (isSavedMode && user) {
      const savedIds = user.saved_posts || [];
      rows = rows.filter(o => savedIds.includes(o.id));
    }
    rows = Filters.apply(rows).filter(o => !q || [o.title,o.content,o.project_name, o.description, o.looking_for, o.issuer_name].some(v => String(v || '').toLowerCase().includes(q)) || (o.skills || []).some(s => (typeof normalizeSynonym === 'function' ? normalizeSynonym(s) : s).toLowerCase().includes(q)));
    rows = Filters.sort(rows,this.currentSort,this.matchScores);

    // Guests only ever get the newest six. The API already caps an anonymous
    // response, so this is a second, purely presentational guard.
    if (this.guest) rows = rows.slice(0, 6);

    const activeFilters=Filters.updateControls();
    const clear = document.getElementById('clear');
    if (clear) clear.hidden=!(q || activeFilters);

    const n = rows.length;
    if (count) {
      if (this.guest) {
        const total = DataStore.opportunityTotal;
        count.title = '';
        count.textContent = total > rows.length
          ? `Showing the ${rows.length} newest of ${total} posts`
          : `${n} ${n === 1 ? 'post' : 'posts'}`;
      } else {
        const forYouDead = this.currentSort === 'foryou' && !this.scored;
        count.title = forYouDead ? 'Add skills and interests to your profile to personalise this order'
          : '';
        count.textContent = `${n} ${n === 1 ? 'post' : 'posts'}`;
      }
    }

    list.innerHTML = rows.map(o => this.renderCard(o)).join('')
      || `<div class="d-empty">${isSavedMode
            ? 'You haven\'t saved anything yet — tap ☆ Save on a post to keep it here.'
            : this.guest
              ? 'Nothing to show yet.'
              : 'Nothing matches those filters. <button class="d-btn-ghost" onclick="Filters.clearAll(); Feed.render()">Clear filters</button>'}</div>`;
    if (this.guest) list.insertAdjacentHTML('beforeend', this.guestCta());
  },

  // End-of-feed prompt for guests: sign up to see everything and apply.
  guestCta() {
    const total = DataStore.opportunityTotal;
    const more = Number.isFinite(total) && total > 6;
    return `<div class="d-guest-cta">
      <h2>${more ? 'There’s more where that came from' : 'Want to apply?'}</h2>
      <p>${more
        ? `You’re seeing the ${Math.min(6, total)} newest posts. Create a free account to see all ${total} — and apply to the ones that fit.`
        : 'Create a free account to apply, save posts, and get matched with opportunities that fit your skills.'}</p>
      <div class="d-btn-wrap"><a href="/signup" class="d-btn d-btn-accent">Sign up</a><a href="/login" class="d-btn">Log in</a></div>
    </div>`;
  },

  async toggleSave(oppId) {
    if (!DataStore.getCurrentUser()) { if(typeof Panels!=='undefined')Panels.navigate('/login');else window.location.href='/login';return; }
    const isSaved = await DataStore.toggleSavePost(oppId);
    this.render(); // Re-render feed to reflect new saved state
  },

  closeDetail() {
    if(typeof Panels!=='undefined')Panels.close();
  },

  renderCard(o) {
    if(o.kind==='post')return this.renderRegularPost(o);
    const loc = Utils.locText(o.location);
    const isRemote = o.remote !== undefined ? !!o.remote : /remote/i.test(o.location || '');
    const all = o.skills || [];
    const skills = all.slice(0, 6).map(s => `<span class="d-skill-tag">${Utils.escapeHtml(s)}</span>`).join('')
      + (all.length > 6 ? `<span class="d-skill-tag d-skill-tag--more">+${all.length - 6} more</span>` : '');
    const links = (o.contact_links || []).length;
    const mine = this.showingYours && (o.created_by || o.issuer_id) === DataStore.getCurrentUser()?.id;
    const isSaved = DataStore.getCurrentUser()?.saved_posts?.includes(o.id);
    const TYPE = { project: 'Project', nonprofit: 'Nonprofit', company: 'Company' };
    const preference = o.opportunity_preference;
    const preferenceBadge = preference === 'paid' || preference === 'volunteering'
      ? `<span class="d-badge d-badge--${preference}">${preference === 'paid' ? 'Paid' : 'Volunteering'}</span>`
      : '';

    const bits = [
      o.looking_for ? Utils.meta('◦', 'Looking for', '<strong>' + Utils.escapeHtml(o.looking_for) + '</strong>') : '',
      loc ? Utils.meta('⌖', 'Location', Utils.escapeHtml(loc) + (isRemote ? ' · remote ok' : ''))
          : (isRemote ? Utils.meta('⌖', 'Location', 'Remote') : ''),
      Utils.fieldOf(o) ? Utils.meta('▪', o.type === 'nonprofit' ? 'Field' : 'Industry', Utils.escapeHtml(Utils.fieldOf(o))) : '',
      links ? Utils.meta('↗', 'Contact', links + (links === 1 ? ' link' : ' links')) : ''
    ].filter(Boolean).join('');

    return `<article class="d-opp-card d-opportunity-card${o.promoted===true ? ' is-promoted' : ''}" tabindex="0" role="link" data-pane-href="/opportunity?id=${encodeURIComponent(o.id)}${o.has_unread_applications && o.latest_unread_application_at >= (o.latest_unread_comment_at || '') ? '#applied' : (o.unread_reply_comment_id ? '#comment-' + o.unread_reply_comment_id : (o.has_unread_comments ? '#comments' : ''))}" style="${o.has_unread_comments || o.has_unread_applications || o.unread_reply_comment_id ? 'border-color: #dc3545;' : ''}">
      <div class="d-opp-top">
        <div class="d-opp-title">
          ${(o.has_unread_comments || o.has_unread_applications || o.unread_reply_comment_id) ? `<span style="display:inline-block; margin-right:4px; background:#dc3545; color:white; font-size:0.65rem; font-weight:bold; border-radius:50%; width:16px; height:16px; text-align:center; line-height:16px;">!</span>` : ''}
          <a class="d-post-open" href="/opportunity?id=${encodeURIComponent(o.id)}${o.has_unread_applications && o.latest_unread_application_at >= (o.latest_unread_comment_at || '') ? '#applied' : (o.unread_reply_comment_id ? '#comment-' + o.unread_reply_comment_id : (o.has_unread_comments ? '#comments' : ''))}">${Utils.escapeHtml(o.project_name || 'Untitled')}</a>
        </div>
        <div class="d-opportunity-badges" style="display:flex;gap:0.35rem;align-items:center;">
          ${o.flagged ? '<span class="d-badge d-badge--draft">Under review</span>' : ''}
          <span class="d-badge d-opportunity-label">Opportunity</span>
          ${preferenceBadge}
          <span class="d-badge d-badge--${o.type || 'project'}">${TYPE[o.type] || 'Project'}</span>
        </div>
      </div>
      ${o.looking_for ? `<p class="d-phone-looking">Looking for: ${Utils.escapeHtml(o.looking_for)}</p>` : ''}
      <div class="d-opp-issuer">Posted by <strong>${Utils.userLink(o.created_by,o.issuer_name || 'Unknown')}</strong>${o.issuer_context ? ' · ' + Utils.escapeHtml(o.issuer_context) : ''}</div>
      ${o.description ? `<div class="d-opp-desc">${Utils.escapeHtml(Utils.truncate(o.description, 30))}</div>` : ''}
      ${bits ? `<div class="d-opp-meta">${bits}</div>` : ''}
      ${skills ? `<div class="d-opp-looking">${skills}</div>` : ''}
      ${mine ? `<div style="display:flex;gap:0.4rem;margin-bottom:0.6rem;">
        <button class="d-btn d-btn-sm" type="button" onclick="event.preventDefault();event.stopPropagation();Feed.editOpportunity('${String(o.id || '').replace(/'/g, "\\'")}', '${o.type || 'project'}')">Edit</button>
        <button class="d-btn d-btn-sm d-btn-danger" type="button" onclick="event.preventDefault();event.stopPropagation();Feed.deleteOpportunity('${String(o.id || '').replace(/'/g, "\\'")}')">Delete</button>
      </div>` : ''}
      <div class="d-opp-footer">
        <span class="d-opp-posted">${Utils.escapeHtml(o.posted || Utils.postedAgo(o.created_at))}</span>
        <span class="d-opp-action">
          <button class="d-btn d-btn-sm" style="margin-right:8px; padding:2px 8px; font-size:0.7rem;" type="button" onclick="event.preventDefault();event.stopPropagation();Feed.toggleSave('${String(o.id || '').replace(/'/g, "\\'")}')">
            ${isSaved ? '★ Saved' : '☆ Save'}
          </button>
          ${mine ? 'Manage' : 'Learn more'} →
        </span>
      </div>
    </article>`;
  },

  renderRegularPost(post) {
    const esc=Utils.escapeHtml;
    const href='/post?id='+encodeURIComponent(post.id)+(post.unread_reply_comment_id ? '#comment-'+encodeURIComponent(post.unread_reply_comment_id) : (post.has_unread_comments ? '#comments' : ''));
    const mine=this.showingYours && post.created_by===this.currentUser?.id;
    const asset=post.media;
    const preview=asset ? (asset.kind==='video' ? `<video class="d-post-media" controls playsinline loop preload="metadata" src="${esc(asset.url)}"></video>` : `<img class="d-post-media" loading="lazy" src="${esc(asset.url)}" alt="${esc(post.title)}">`) : '';
    return `<article class="d-opp-card d-regular-post${post.promoted===true ? ' is-promoted' : ''}" data-pane-href="${esc(href)}" tabindex="0" role="link">
      <div class="d-opp-top"><a class="d-post-open d-opp-title" href="${href}">${esc(post.title)}</a><span class="d-badge">Post</span></div>
      <div class="d-opp-issuer">${esc(post.project_name)} · Posted by <strong>${Utils.userLink(post.created_by,post.issuer_name)}</strong></div>
      <p class="d-opp-desc">${esc(post.content)}</p>${preview}
      ${mine ? `<div class="d-own-actions"><button class="d-btn d-btn-sm" type="button" onclick="Feed.editOpportunity('${post.id}','${post.type}','post')">Edit</button><button class="d-btn d-btn-sm d-btn-danger" type="button" onclick="Feed.deleteOpportunity('${post.id}','post')">Delete</button></div>` : ''}
      <div class="d-opp-footer"><button class="d-btn d-btn-sm" type="button" aria-pressed="${post.liked}" onclick="Feed.toggleLike('${post.id}',this)">${post.liked ? '♥ Liked' : '♡ Like'} · ${post.like_count}</button><a class="d-post-open" href="${href}">${post.comment_count} comments →</a><span class="d-opp-posted">${Utils.postedAgo(post.created_at)}</span></div>
    </article>`;
  },

  async toggleLike(id,button) {
    if(!this.currentUser){if(typeof Panels!=='undefined')Panels.navigate('/login');else location.href='/login';return;}
    const post=[...this.opportunities,...this.myPosts].find(p=>p.id===id);
    if(!post)return;
    button.disabled=true;
    try{
      const result=await DataStore.request('/api/posts/'+encodeURIComponent(id)+'/like',{method:post.liked ? 'DELETE' : 'POST'});
      for(const row of [...this.opportunities,...this.myPosts])if(row.id===id)Object.assign(row,result);
      button.textContent=(result.liked ? '♥ Liked' : '♡ Like')+' · '+result.like_count;
      button.setAttribute('aria-pressed',String(result.liked));
    }catch(error){alert(error.message);}finally{button.disabled=false;}
  },

  editOpportunity(id, type,kind='opportunity') {
    const url=`/create_student?kind=${encodeURIComponent(kind)}&edit=${encodeURIComponent(id)}`;
    if(typeof Panels!=='undefined')Panels.navigate(url);else window.location.href=url;
  },

  async deleteOpportunity(id,kind='opportunity') {
    if (!confirm('Are you sure you want to delete this post? This cannot be undone.')) return;
    try {
      const res = await fetch((kind==='post' ? '/api/posts/' : '/api/opportunities/') + encodeURIComponent(id), { method: 'DELETE', credentials: 'same-origin' });
      if (!res.ok) { alert('Failed to delete.'); return; }
      this.opportunities = this.opportunities.filter(o => o.id !== id);
      this.myPosts = this.myPosts.filter(o => o.id !== id);
      this.closeDetail();this.render();
    } catch { alert('Network error.'); }
  },

  renderYours(list,count) {
    count.title='';
    const projectsTab=this.yoursTab==='projects';
    document.querySelectorAll('[data-yours-tab]').forEach(button=>{
      const active=button.dataset.yoursTab===this.yoursTab;
      button.setAttribute('aria-selected',String(active));button.tabIndex=active ? 0 : -1;
    });
    list.setAttribute('role','tabpanel');list.setAttribute('aria-labelledby','yours-'+this.yoursTab);
    const create=document.getElementById('yours-create');
    create.href=projectsTab ? '/create_student?new_project=1' : '/create_student';
    create.textContent=projectsTab ? '+ Create project' : '+ Create post';
    if(projectsTab){
      count.textContent=`${this.projects.length} ${this.projects.length===1 ? 'project' : 'projects'}`;
      list.innerHTML=this.projects.map(project=>this.renderProject(project)).join('') || '<div class="d-empty">You have not created a project yet.</div>';
      return;
    }
    const rows=[...this.myPosts].sort((a,b)=>(b.latest_notification_at || b.created_at || '').localeCompare(a.latest_notification_at || a.created_at || ''));
    count.textContent=`${rows.length} ${rows.length===1 ? 'post' : 'posts'} · ${this.drafts.length} ${this.drafts.length===1 ? 'draft' : 'drafts'}`;
    list.innerHTML=(this.drafts.length ? '<h2 class="d-own-section">Drafts</h2>'+this.drafts.map(d=>this.renderDraft(d)).join('') : '')
      +(rows.length ? '<h2 class="d-own-section">Posts</h2>'+rows.map(o=>this.renderCard(o)).join('') : '')
      || '<div class="d-empty">You have no posts or drafts yet.</div>';
  },

  renderProject(project) {
    const fields=project.fields || {};
    const posts=this.myPosts.filter(p=>p.project_id===project.id).length;
    const drafts=this.drafts.filter(d=>d.project_id===project.id).length;
    const busy=posts || drafts;
    const esc=Utils.escapeHtml;
    return `<article class="d-opp-card">
      <div class="d-opp-top"><h2 class="d-opp-title">${esc(fields.name)}</h2><span class="d-badge d-badge--${esc(project.type)}">${esc({project:'Project',nonprofit:'Nonprofit',company:'Company / startup'}[project.type])}</span></div>
      <p class="d-opp-desc">${esc(fields.elevator_pitch)}</p>
      <div class="d-opp-looking">${(fields.tags || []).map(t=>`<span class="d-skill-tag">${esc(t)}</span>`).join('')}</div>
      <p class="d-own-note">${posts} ${posts===1 ? 'post' : 'posts'} · ${drafts} ${drafts===1 ? 'draft' : 'drafts'}</p>
      <div class="d-own-actions"><a class="d-btn d-btn-sm" href="/create_student?project=${encodeURIComponent(project.id)}">Create post</a><a class="d-btn d-btn-sm" href="/create_student?edit_project=${encodeURIComponent(project.id)}">Edit project</a><button type="button" class="d-btn d-btn-sm d-btn-danger" data-delete-project="${esc(project.id)}" ${busy ? 'disabled' : ''}>Delete project</button></div>
      ${busy ? '<p class="d-own-note">Delete its posts and drafts before deleting this project.</p>' : ''}
    </article>`;
  },

  async deleteProject(id) {
    if(!confirm('Delete this project? This cannot be undone.'))return;
    try{
      await DataStore.request('/api/projects/'+encodeURIComponent(id),{method:'DELETE'});
      this.projects=this.projects.filter(p=>p.id!==id);this.render();
    }catch(error){document.getElementById('yours-error').textContent=error.message;}
  },

  async deleteDraft(id) {
    if(!confirm('Delete this draft? This cannot be undone.'))return;
    try{
      await DataStore.request('/api/drafts/'+encodeURIComponent(id),{method:'DELETE'});
      this.drafts=this.drafts.filter(d=>d.id!==id);this.render();
    }catch(error){document.getElementById('yours-error').textContent=error.message;}
  },

  renderDraft(d) {
    const f=d.fields || {};
    return `<article class="d-opp-card d-opp-card--draft">
      <div class="d-opp-top"><div class="d-opp-title">${Utils.escapeHtml(d.project_name || f.title || 'Choose a project')}</div><span class="d-badge d-badge--draft">Draft</span></div>
      ${d.kind==='post' ? `<p class="d-opp-desc">${Utils.escapeHtml(f.title || 'Untitled post')}</p>` : ''}
      ${f.looking_for ? `<p class="d-opp-desc">${Utils.escapeHtml(f.looking_for)}</p>` : ''}
      ${f.description || f.content ? `<p class="d-opp-desc">${Utils.escapeHtml(f.description || f.content)}</p>` : ''}
      <div class="d-own-actions"><a class="d-btn d-btn-sm" href="/create_student?draft=${encodeURIComponent(d.id)}">Edit draft</a><button type="button" class="d-btn d-btn-sm d-btn-danger" data-delete-draft="${Utils.escapeHtml(d.id)}">Delete draft</button></div>
      <p class="d-own-note">Saved ${Utils.timeAgo(d.updated_at)}</p>
    </article>`;
  }
};
