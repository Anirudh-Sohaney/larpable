const ProfilePage={
  profile:null,projects:[],posts:[],project:null,request:0,
  async init(){
    await App.init();
    if(!Panels.embedded)App.setupUserMenu();
    const id=new URLSearchParams(location.search).get('id') || App.currentUser?.id;
    const root=document.getElementById('public-profile');
    if(!id){root.innerHTML='<div class="d-empty">Open a profile from a post, or <a href="/login">log in</a> to view yours.</div>';return;}
    try{
      const data=await DataStore.request('/api/profiles/'+encodeURIComponent(id));
      this.profile=data.profile;this.projects=data.projects;
      document.title='LARPABLE. — '+this.profile.name;
      const esc=Utils.escapeHtml;
      root.innerHTML=`<header class="d-public-profile-header"><img class="d-profile-picture" width="112" height="112" src="/api/profiles/${encodeURIComponent(id)}/picture" alt="Profile picture"><h1>${esc(this.profile.name)}</h1><div class="d-profile-handle"><span>@${esc(this.profile.username)}</span>${App.currentUser?.id===id ? '<a class="d-btn d-btn-sm" href="/edit_profile">Edit profile</a>' : ''}</div><div class="d-profile-stats"><span class="d-score-with-info"><span class="d-profile-score" aria-label="LarpScore: ${this.profile.larpscore ?? 0}">${this.profile.larpscore ?? 0} <span>LarpScore</span></span>${LarpScoreInfo.button}</span><button type="button" data-profile-popup="skills">${this.profile.skills.length} ${this.profile.skills.length===1 ? "skill" : "skills"}</button><button type="button" data-profile-popup="interests">${this.profile.interests.length} ${this.profile.interests.length===1 ? "interest" : "interests"}</button>${this.profile.experiences.length ? '<button type="button" data-profile-popup="experiences">Experiences</button>' : ''}</div></header><section id="profile-projects" aria-label="Projects"></section>`;
      root.querySelectorAll('[data-profile-popup]').forEach(button=>button.addEventListener('click',()=>this.showPopup(button.dataset.profilePopup)));
      const dialog=document.getElementById('profile-dialog');
      document.getElementById('profile-dialog-close').onclick=()=>dialog.close();
      dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom)dialog.close();}});
      Feed.currentUser=App.currentUser;Feed.render=()=>this.renderPosts();
      this.renderProjects();if(!Panels.embedded || window.top===window)FeedVideos.init();
    }catch(error){root.textContent=error.message;}
  },
  showPopup(kind){
    const esc=Utils.escapeHtml;
    document.getElementById('profile-dialog-title').textContent=`${this.profile.name}'s ${kind}`;
    document.getElementById('profile-dialog-content').innerHTML=kind==='experiences'
      ? this.profile.experiences.map(item=>`<article class="d-profile-experience"><h3>${esc(item.title)}</h3><p class="d-profile-project-meta">${esc(item.company_name || item.type)}</p><p>${esc(item.description)}</p><div class="d-detail-skills">${item.skills.map(skill=>`<span class="d-chip">${esc(skill)}</span>`).join('')}</div></article>`).join('')
      : `<div class="d-profile-popup-chips">${this.profile[kind].map(item=>`<span class="d-chip">${esc(item)}</span>`).join('') || '<p>Nothing added yet.</p>'}</div>`;
    document.getElementById('profile-dialog').showModal();
  },
  renderProjects(){
    this.request++;this.project=null;this.posts=[];Feed.opportunities=[];
    const section=document.getElementById('profile-projects'),esc=Utils.escapeHtml;
    section.innerHTML=`<div class="d-profile-section-heading"><h2>Projects</h2><span>${this.projects.length}</span></div><div class="d-profile-project-list">${this.projects.map(p=>`<button type="button" class="d-profile-project" data-project-id="${esc(p.id)}"><span><span class="d-profile-project-name">${esc(p.fields.name)}</span><span class="d-profile-project-meta">${esc({project:'Project',nonprofit:'Nonprofit',company:'Company / startup'}[p.type] || p.type)}</span><span class="d-profile-project-pitch">${esc(p.fields.elevator_pitch)}</span></span><span aria-hidden="true">↗</span></button>`).join('') || '<p class="d-profile-empty">No projects yet.</p>'}</div>`;
    section.querySelectorAll('[data-project-id]').forEach(button=>button.addEventListener('click',()=>this.openProject(button.dataset.projectId)));
    FeedVideos.refresh();
  },
  async openProject(id){
    const sequence=++this.request;
    this.project=this.projects.find(p=>p.id===id);if(!this.project)return;
    const section=document.getElementById('profile-projects');
    section.innerHTML=`<button type="button" class="d-profile-back">← All projects</button><div class="d-profile-section-heading"><h2>${Utils.escapeHtml(this.project.fields.name)}</h2></div><details class="d-project-more"><summary><span class="d-project-more-open">See more about project</span><span class="d-project-more-close">See less</span></summary><div class="d-project-more-content">${this.project.fields.elevator_pitch ? `<p class="d-detail-desc">${Utils.escapeHtml(this.project.fields.elevator_pitch)}</p>` : ''}${this.project.fields.description ? `<p class="d-detail-desc">${Utils.escapeHtml(this.project.fields.description)}</p>` : ''}</div></details><div class="d-profile-post-scroll" tabindex="0" aria-label="Project posts"><div id="list"><p class="d-profile-empty">Loading posts…</p></div></div>`;
    section.querySelector('.d-profile-back').onclick=()=>this.renderProjects();
    FeedVideos.refresh();
    try{
      const data=await DataStore.request('/api/profiles/'+encodeURIComponent(this.profile.id)+'/projects/'+encodeURIComponent(id)+'/posts');
      if(sequence!==this.request)return;
      this.posts=data.posts;Feed.opportunities=this.posts;this.renderPosts();
    }catch(error){if(sequence===this.request)document.getElementById('list').textContent=error.message;}
  },
  renderPosts(){
    const list=document.getElementById('list');if(!list || !this.project)return;
    list.innerHTML=this.posts.map(post=>Feed.renderCard(post)).join('') || '<p class="d-profile-empty">No posts yet.</p>';
    FeedVideos.refresh();
  }
};
ProfilePage.init();
