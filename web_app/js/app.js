const App = {
  currentUser: null,

  async init() {
    await DataStore.init();
    this.currentUser = DataStore.getCurrentUser();
  },

  requireAuth() { return DataStore.requireAuth(); },
  isAuthenticated() { return !!this.currentUser; },

  setupUserMenu() {
    const user = this.currentUser;
    if (!user) return;

    const avatar = document.getElementById('header-avatar');
    const name = document.getElementById('header-username');
    if (avatar) avatar.textContent = Utils.initials(user.firstName + ' ' + user.lastName);
    if (name) name.textContent = user.username;

    if (user.role === 'admin' || user.staff_access) {
      const staffLink = document.getElementById('staff-portal-link');
      if (staffLink) staffLink.style.display = '';
    }

    const btn = document.querySelector('.d-user-btn');
    const dropdown = document.querySelector('.d-user-dropdown');
    if (btn && dropdown) {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        dropdown.classList.toggle('open');
      });
      document.addEventListener('click', () => dropdown.classList.remove('open'));
    }

    // Inject bottom nav globally if not present
    if (!document.querySelector('.d-bottom-nav')) {
       const nav = document.createElement('nav');
       nav.className = 'd-bottom-nav';
       nav.innerHTML = `
        <a href="/feed" class="d-nav-item ${location.pathname==='/feed' && !location.search.includes('saved=true') ? 'is-active' : ''}">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
          <span>Feed</span>
        </a>
        <a href="/feed?saved=true" class="d-nav-item ${location.pathname==='/feed' && location.search.includes('saved=true') ? 'is-active' : ''}">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
          <span>Saved</span>
        </a>
        <a href="/create_student" class="d-nav-item ${location.pathname==='/create_student' ? 'is-active' : ''}">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          <span>Create</span>
        </a>
        <div class="d-nav-item-wrap" style="position:relative; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;">
          <button type="button" class="d-nav-item ${location.pathname==='/profile' ? 'is-active' : ''}" id="bottom-nav-profile-btn" style="border: none; background: transparent; width: 100%; cursor: pointer;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            <span>Profile</span>
          </button>
          <div id="bottom-nav-profile-menu" style="display:none; position:absolute; bottom: 100%; right: 10px; margin-bottom: 8px; background: var(--card, #FFFDF8); border: 1px solid var(--border, #D6D1C9); border-radius: 8px; box-shadow: 0 -4px 16px rgba(0,0,0,0.1); flex-direction: column; min-width: 140px; overflow: hidden; text-align: left;">
            <a href="/profile" style="padding: 12px 16px; text-decoration: none; color: var(--font, #2D2A26); font-size: 0.9rem; display: block; border-bottom: 1px solid var(--border, #D6D1C9);">Profile</a>
            ${(user.role === 'admin' || user.staff_access) ? '<a href="/staff" style="padding: 12px 16px; text-decoration: none; color: var(--accent, #E8734A); font-weight: 600; font-size: 0.9rem; display: block; border-bottom: 1px solid var(--border, #D6D1C9);">Staff Portal</a>' : ''}
            <button type="button" onclick="App.logout()" style="padding: 12px 16px; border: none; background: transparent; color: #dc3545; font-size: 0.9rem; width: 100%; text-align: left; cursor: pointer;">Log out</button>
          </div>
        </div>
       `;
       const main = document.querySelector('main');
       if (main) main.appendChild(nav);
       else document.body.appendChild(nav);

       const profileBtn = document.getElementById('bottom-nav-profile-btn');
       const profileMenu = document.getElementById('bottom-nav-profile-menu');
       if (profileBtn && profileMenu) {
         profileBtn.addEventListener('click', e => {
           e.stopPropagation();
           profileMenu.style.display = profileMenu.style.display === 'none' ? 'flex' : 'none';
         });
         document.addEventListener('click', () => {
           profileMenu.style.display = 'none';
         });
         profileMenu.addEventListener('click', e => e.stopPropagation());
       }
    }
  },

  navigate(page) {
    window.location.href = page;
  },

  async logout() {
    await DataStore.logout();
    this.currentUser = null;
    window.location.href = '/loading_page';
  }
};
