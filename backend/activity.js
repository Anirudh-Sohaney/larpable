/**
 * LARPABLE — Page-visit activity tracking
 *
 * Why this exists as a frontend beacon + tiny API (and not nginx logs):
 * nginx serves every static page directly — Node never sees those requests —
 * so page loads are invisible to the backend unless pages report themselves.
 * A 1-line script tag on each page POSTs here on load.
 *
 * What is tracked (anonymous, first-party only):
 * - visitor: random UUID in the `larpable_vid` cookie (per browser, 1 year).
 *   This counts PEOPLE, not sessions or IPs: refreshes and reopens on the
 *   same browser reuse the cookie; shared wifi is unaffected (cookies are
 *   per-browser, never per-IP). Cleared/incognito browsers count again —
 *   the metric is best-effort by design.
 * - page: normalized pathname (lowercased, `.html` stripped, `/index`→`/`).
 * - day: UTC calendar date. Per-day maps cap memory; file keeps 30 days.
 *
 * Data safety: writes go ONLY to the new `activity.json` via atomicUpdate
 * (one small merge per flush, pruned to 30 days). No existing record is
 * ever read-modify-written here. Pings buffer in memory and flush on the
 * already-existing 5-minute interval — no new timers. A restart loses at
 * most minutes of counts, never user data.
 *
 * Timezone: UTC everywhere (ISO strings, UTC calendar dates).
 */

const crypto = require('crypto');
const store = require('./store');

const ACTIVITY_FILE = 'activity.json';
const KEEP_DAYS = 30;
const MAX_PAGE_LEN = 120;
const MAX_PAGES_PER_DAY = 2000;
const MAX_VISITORS_PER_DAY = 200000;

const VISITOR_COOKIE = 'larpable_vid';
const VID_RE = /^[A-Za-z0-9_-]{8,64}$/;

const LANDING_PAGES = new Set(['/', '/loading_page']);
const SIGNUP_PAGE = '/signup';
const LOGIN_PAGE = '/login';

// Obvious non-humans only — kept deliberately narrow so real browsers
// (including in-app webviews) are never filtered.
const BOT_RE = /bot|crawl|spider|slurp|mediapartners|baidu|yandex|sogou|exabot|facebot|ia_archiver|pingdom|uptimerobot|headless/i;

function utcDateString(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Normalize a pathname into a stable page key, or null when unusable. */
function normalizePage(raw) {
  let p = String(raw || '').trim().toLowerCase();
  if (!p.startsWith('/')) return null;
  p = p.split('?')[0].split('#')[0];
  if (p.endsWith('.html')) p = p.slice(0, -5);
  if (p === '/index') p = '/';
  if (p.length < 1 || p.length > MAX_PAGE_LEN) return null;
  if (!/^[a-z0-9/_\-.~%]+$/.test(p)) return null;
  return p;
}

function isBot(userAgent) {
  return BOT_RE.test(String(userAgent || ''));
}

function newVisitorId() {
  return crypto.randomUUID().replace(/-/g, '');
}

// day -> vid -> { first, last, pages: { page: { n: count, first: ms } } }
const dayBuffer = new Map();

function bufferPing(day, vid, page, nowMs) {
  let visitors = dayBuffer.get(day);
  if (!visitors) {
    visitors = new Map();
    dayBuffer.set(day, visitors);
  }
  if (!visitors.has(vid) && visitors.size >= MAX_VISITORS_PER_DAY) return false;
  let entry = visitors.get(vid);
  if (!entry) {
    entry = { first: nowMs, last: nowMs, pages: {} };
    visitors.set(vid, entry);
  }
  // Bound distinct pages per visitor; each page keeps a count plus the
  // first-seen timestamp so landing→signup/login order is provable.
  if (!entry.pages[page] && Object.keys(entry.pages).length >= MAX_PAGES_PER_DAY) return false;
  entry.last = nowMs;
  const slot = entry.pages[page] || (entry.pages[page] = { n: 0, first: nowMs });
  slot.n += 1;
  return true;
}

/**
 * Record one page-load ping. Pure bookkeeping, never throws.
 * @returns {{ vid: string, fresh: boolean }} vid to ensure in the cookie.
 */
function recordPing({ vid, page, userAgent, nowMs = Date.now() }) {
  const validVid = vid && VID_RE.test(vid) ? vid : newVisitorId();
  const fresh = validVid !== vid;
  if (isBot(userAgent)) return { vid: validVid, fresh };
  const key = normalizePage(page);
  if (!key) return { vid: validVid, fresh };
  bufferPing(utcDateString(nowMs), validVid, key, nowMs);
  return { vid: validVid, fresh };
}

/** Merge the in-memory buffer into activity.json (additive, pruned). */
async function flushActivity() {
  if (!dayBuffer.size) return { flushed: false };
  const snapshot = [];
  for (const [day, visitors] of dayBuffer) {
    const plain = {};
    for (const [vid, entry] of visitors) plain[vid] = { first: entry.first, last: entry.last, pages: entry.pages };
    snapshot.push([day, plain]);
  }
  dayBuffer.clear();
  await store.atomicUpdate(ACTIVITY_FILE, (data) => {
    const out = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    if (!out.days || typeof out.days !== 'object' || Array.isArray(out.days)) out.days = {};
    for (const [day, visitors] of snapshot) {
      const target = (out.days[day] && typeof out.days[day] === 'object' ? out.days[day] : {});
      for (const [vid, entry] of Object.entries(visitors)) {
        const cur = target[vid];
        if (!cur || typeof cur !== 'object') {
          target[vid] = entry;
        } else {
          cur.first = Math.min(cur.first || entry.first, entry.first);
          cur.last = Math.max(cur.last || entry.last, entry.last);
          cur.pages = cur.pages && typeof cur.pages === 'object' ? cur.pages : {};
          for (const [page, slot] of Object.entries(entry.pages || {})) {
            const n = Number((slot && slot.n) || 0) || 0;
            const first = Number((slot && slot.first) || 0) || 0;
            const prev = cur.pages[page] && typeof cur.pages[page] === 'object' ? cur.pages[page] : { n: 0, first: 0 };
            prev.n += n;
            prev.first = prev.first && first ? Math.min(prev.first, first) : (prev.first || first);
            cur.pages[page] = prev;
          }
        }
      }
      out.days[day] = target;
    }
    const cutoff = utcDateString(Date.now() - KEEP_DAYS * 864e5);
    for (const day of Object.keys(out.days)) {
      if (day < cutoff) delete out.days[day];
    }
    return out;
  });
  return { flushed: true, days: snapshot.length };
}

function pageFirst(pages, page) {
  const slot = pages[page];
  const t = Number(slot && slot.first) || 0;
  return t || Infinity;
}

function summarizeDay(visitors) {
  const vids = Object.keys(visitors || {});
  let landingPeople = 0, toSignup = 0, toLogin = 0, pageLoads = 0;
  for (const vid of vids) {
    const entry = visitors[vid];
    if (!entry || typeof entry !== 'object') continue;
    const pages = entry.pages && typeof entry.pages === 'object' ? entry.pages : {};
    for (const slot of Object.values(pages)) pageLoads += Number((slot && slot.n) || 0) || 0;
    const seen = Object.keys(pages);
    const landingFirst = Math.min(...[...LANDING_PAGES].map(p => pageFirst(pages, p)));
    if (!Number.isFinite(landingFirst)) continue;
    landingPeople++;
    // Ordered funnel: the landing page must be seen at/before signup/login.
    if (seen.includes(SIGNUP_PAGE) && landingFirst <= pageFirst(pages, SIGNUP_PAGE)) toSignup++;
    if (seen.includes(LOGIN_PAGE) && landingFirst <= pageFirst(pages, LOGIN_PAGE)) toLogin++;
  }
  return { people: vids.length, landingPeople, toSignup, toLogin, pageLoads };
}

/**
 * Staff-dashboard summary. Merges the persisted file with the live buffer
 * so numbers are current to within seconds.
 */
async function getActivitySummary(nowMs = Date.now()) {
  const today = utcDateString(nowMs);
  const file = await store.read(ACTIVITY_FILE).catch(() => ({}));
  const days = (file && file.days && typeof file.days === 'object' ? file.days : {});
  const merged = {};
  for (const [day, visitors] of Object.entries(days)) merged[day] = { ...(visitors || {}) };
  for (const [day, visitors] of dayBuffer) {
    merged[day] = merged[day] || {};
    for (const [vid, entry] of visitors) {
      if (!merged[day][vid]) merged[day][vid] = { first: entry.first, last: entry.last, pages: { ...entry.pages } };
    }
  }
  const t = summarizeDay(merged[today] || {});
  const weekCutoff = utcDateString(nowMs - 6 * 864e5);
  const weekVids = new Set();
  let weekLoads = 0;
  for (const [day, visitors] of Object.entries(merged)) {
    if (day < weekCutoff || day > today) continue;
    for (const [vid, entry] of Object.entries(visitors || {})) {
      weekVids.add(vid);
      const pages = (entry && entry.pages) || {};
      for (const slot of Object.values(pages)) weekLoads += Number((slot && slot.n) || 0) || 0;
    }
  }
  return {
    date: today,
    landingPeopleToday: t.landingPeople,
    toSignupToday: t.toSignup,
    toLoginToday: t.toLogin,
    pageLoadsToday: t.pageLoads,
    uniquePeople7d: weekVids.size,
    pageLoads7d: weekLoads
  };
}

module.exports = {
  ACTIVITY_FILE,
  VISITOR_COOKIE,
  LANDING_PAGES,
  normalizePage,
  isBot,
  recordPing,
  flushActivity,
  getActivitySummary
};
