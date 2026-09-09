const Utils = {
  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    const div = document.createElement('div'); div.textContent = String(value); return div.innerHTML;
  },
  formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  },
  timeAgo(value) {
    if (!value) return '';
    const diff = Date.now() - new Date(value).getTime();
    if (!Number.isFinite(diff)) return '';
    const mins = Math.floor(diff / 60000), hours = Math.floor(diff / 3600000), days = Math.floor(diff / 86400000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return Utils.formatDate(value);
  },
  postedAgo(value) {
    const ago = Utils.timeAgo(value);
    return ago ? `Posted ${ago}` : '';
  },
  initials(name) {
    return String(name || '?').trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || '?';
  },
  fieldOf(opportunity) {
    return opportunity?.industry || opportunity?.nonprofit_field || opportunity?.field || '';
  },
  locText(location) {
    if (!location) return '';
    if (typeof location === 'string') return location;
    return location.display || [location.city, location.state, location.country].filter(Boolean).join(', ');
  },
  meta(icon, label, value) {
    if (!value) return '';
    return `<span class="d-meta-item"><span class="d-meta-icon">${icon}</span><span class="d-meta-label">${label}</span> ${value}</span>`;
  }
};
