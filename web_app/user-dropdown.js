/**
 * LARPABLE — Shared User Dropdown
 * 
 * Include this script on any page with an element id="header-actions".
 * It fetches the username and renders a dropdown with Profile + Logout.
 * 
 * Usage: add <div id="header-actions"></div> to your header, then:
 *   <script src="/user-dropdown.js"></script>
 * 
 * The dropdown opens on click and closes on outside click.
 */

(function () {
  'use strict';

  const DROPDOWN_CSS = `
    .ud-wrap { position: relative; display: inline-block; }
    .ud-btn {
      display: flex; align-items: center; gap: 6px;
      padding: 6px 14px; border-radius: 6px; border: 1.5px solid var(--border, #D6D1C9);
      background: var(--card, #FFFDF8); cursor: pointer; font-family: inherit;
      font-size: 0.85rem; font-weight: 600; color: var(--font, #2D2A26);
      transition: border-color 0.15s; user-select: none;
    }
    .ud-btn:hover { border-color: var(--accent, #E8734A); }
    .ud-btn .ud-arrow { font-size: 0.6rem; color: var(--muted, #8A8580); transition: transform 0.15s; }
    .ud-wrap.open .ud-btn .ud-arrow { transform: rotate(180deg); }
    .ud-menu {
      display: none; position: absolute; top: calc(100% + 4px); right: 0; z-index: 200;
      min-width: 160px; background: var(--card, #FFFDF8); border: 1px solid var(--border, #D6D1C9);
      border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.1); overflow: hidden;
    }
    .ud-wrap.open .ud-menu { display: block; }
    .ud-menu a, .ud-menu button {
      display: block; width: 100%; padding: 10px 16px; border: none; background: none;
      font-family: inherit; font-size: 0.85rem; color: var(--font, #2D2A26);
      text-align: left; cursor: pointer; text-decoration: none; transition: background 0.12s;
    }
    .ud-menu a:hover, .ud-menu button:hover { background: rgba(232,115,74,0.06); }
    .ud-menu .ud-danger { color: #dc3545; }
    .ud-menu .ud-danger:hover { background: rgba(220,53,69,0.06); }
    .ud-divider { height: 1px; background: var(--border, #D6D1C9); margin: 0; }
  `;

  function injectStyles() {
    if (document.getElementById('ud-styles')) return;
    const style = document.createElement('style');
    style.id = 'ud-styles';
    style.textContent = DROPDOWN_CSS;
    document.head.appendChild(style);
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  async function init() {
    const container = document.getElementById('header-actions');
    if (!container) return;

    injectStyles();

    // Fetch username — try users/me first (has actual username), fall back to auth/me
    let displayName = 'User';
    try {
      const res = await fetch('/api/users/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        displayName = data.username || [data.first_name, data.last_name].filter(Boolean).join(' ') || 'User';
      } else {
        const res2 = await fetch('/api/auth/me', { credentials: 'include' });
        if (res2.ok) {
          const data2 = await res2.json();
          displayName = data2.user?.displayName || 'User';
        }
      }
    } catch {}

    // Build dropdown
    container.innerHTML = `
      <div class="ud-wrap" id="ud-wrap">
        <button class="ud-btn" id="ud-btn" type="button">
          <span id="ud-name">${esc(displayName)}</span>
          <span class="ud-arrow">▾</span>
        </button>
        <div class="ud-menu" id="ud-menu">
          <a href="/profile">Profile</a>
          <div class="ud-divider"></div>
          <button class="ud-danger" id="ud-logout">Log out</button>
        </div>
      </div>
    `;

    const wrap = document.getElementById('ud-wrap');
    const btn = document.getElementById('ud-btn');
    const menu = document.getElementById('ud-menu');
    const logoutBtn = document.getElementById('ud-logout');

    // Toggle dropdown
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      wrap.classList.toggle('open');
    });

    // Close on outside click
    document.addEventListener('click', () => {
      wrap.classList.remove('open');
    });

    // Prevent menu clicks from closing
    menu.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Logout
    logoutBtn.addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      window.location.href = '/loading_page';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
