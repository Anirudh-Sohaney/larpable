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
