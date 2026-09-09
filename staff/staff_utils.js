/**
 * LARPABLE Staff Portal — Utility Functions
 * 
 * Shared helpers used across all components.
 * These are pure functions with no data dependencies.
 */

const Utils = {
  /**
   * Escape HTML to prevent XSS
   * INTEGRATION: Use the same escapeHtml function from backend/sanitize.js
   *   or apply server-side sanitization before rendering
   */
  escapeHtml(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  },

  /**
   * Format date string to readable format
   * INTEGRATION: No change needed — this is client-side formatting
   */
  formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  },

  /**
   * Format date and time
   * INTEGRATION: No change needed — this is client-side formatting
   */
  formatDateTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  },

  /**
   * Format time only
   * INTEGRATION: No change needed
   */
  formatTime(timeStr) {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${m} ${ampm}`;
  },

  /**
   * Get relative time string (e.g., "2 hours ago")
   * INTEGRATION: No change needed — client-side calculation
   */
  timeAgo(dateStr) {
    if (!dateStr) return '';
    const now = new Date();
    const date = new Date(dateStr);
    const diff = now - date;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return Utils.formatDate(dateStr);
  },

  /**
   * Calculate days until a date
   * INTEGRATION: No change needed — client-side calculation
   */
  daysUntil(dateStr) {
    if (!dateStr) return null;
    const now = new Date();
    const date = new Date(dateStr);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
  },

  /**
   * Get priority/status color class
   * INTEGRATION: No change needed — pure CSS class mapping
   */
  priorityClass(priority) {
    const map = { high: 'priority-high', medium: 'priority-medium', low: 'priority-low' };
    return map[priority] || 'priority-medium';
  },

  statusClass(status) {
    const map = { todo: 'status-todo', in_progress: 'status-progress', review: 'status-review', done: 'status-done' };
    return map[status] || 'status-todo';
  },

  statusLabel(status) {
    const map = { todo: 'To Do', in_progress: 'In Progress', review: 'In Review', done: 'Done' };
    return map[status] || status;
  },

  /**
   * Get team color from team ID
   * INTEGRATION: fetch('/api/staff/teams') to get team definitions
   */
  teamColor(teamId) {
    const colors = {
      dev: '#5C6BC0',
      business: '#E8734A',
      design: '#10B981',
      marketing: '#F59E0B'
    };
    return colors[teamId] || '#8A8580';
  },

  teamName(teamId) {
    const names = {
      dev: 'Development',
      business: 'Business',
      design: 'Design',
      marketing: 'Marketing'
    };
    return names[teamId] || teamId;
  },

  /**
   * Generate a unique ID
   * INTEGRATION: Backend generates IDs via crypto.sha256(title + Date.now())
   *   See staff.routes.js: 'tgoal_' + crypto.sha256(title + Date.now()).hash.substring(0, 12)
   */
  generateId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  },

  /**
   * Create element with attributes
   * INTEGRATION: No change needed — DOM helper
   */
  el(tag, attrs, ...children) {
    const elem = document.createElement(tag);
    if (attrs) {
      for (const [key, val] of Object.entries(attrs)) {
        if (key === 'className') elem.className = val;
        else if (key === 'dataset') Object.assign(elem.dataset, val);
        else if (key.startsWith('on')) elem.addEventListener(key.slice(2).toLowerCase(), val);
        else elem.setAttribute(key, val);
      }
    }
    children.forEach(child => {
      if (typeof child === 'string') elem.appendChild(document.createTextNode(child));
      else if (child) elem.appendChild(child);
    });
    return elem;
  },

  /**
   * Debounce function for search inputs
   * INTEGRATION: No change needed — client-side utility
   */
  debounce(fn, delay) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  },

  /**
   * Get today's date in YYYY-MM-DD format
   * INTEGRATION: No change needed
   */
  today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  /**
   * Get month string from YYYY-MM-DD
   * INTEGRATION: No change needed
   */
  monthKey(dateStr) {
    return dateStr.substring(0, 7);
  }
};
