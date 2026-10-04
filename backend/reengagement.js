/**
 * LARPABLE — Re-engagement + Application Notifications
 *
 * (a) Nightly re-engagement: users whose last login (UTC date) was 2 or
 *     more days ago get one email with their top-2 matched opportunities
 *     (same ranking algorithm as the For You feed), preferring posts
 *     created since they last logged in. One nudge per idle stretch: once
 *     emailed, a user is not emailed again until they log in anew.
 *
 * (b) Application notifications: the author of an opportunity is emailed
 *     whenever someone new applies through the inbuilt apply system.
 *
 * Data safety: every persistence here is additive-only via atomicUpdate —
 * new top-level fields (`last_login_at`, `last_notif_email_sent`) and the
 * `notifications.json` guard. Nothing is ever deleted or overwritten except
 * the single field being recorded. The nightly pass does ONE batched
 * users.json write; the run is triggered from an already-existing interval
 * (no new timers or processes).
 *
 * Timezone: all stored timestamps are ISO-8601 UTC (`toISOString()`); the
 * "2 days ago" and "midnight" boundaries are UTC calendar dates.
 */

const store = require('./store');
const { decryptObject } = require('./crypto');
const matching = require('./matching');
const { sendEmail } = require('./mailer');

const SITE_URL = (process.env.SITE_URL || 'https://larpable.me').replace(/\/+$/, '');
const NOTIFY_FILE = 'notifications.json';
const REENGAGEMENT_DELAY_DAYS = 2;
// Nightly send cap: stays under Resend's 100/day free quota (shared with
// verification + application emails). Due users beyond the cap keep no sent
// marker and are picked up the next night, longest-idle first.
const MAX_NIGHTLY_SENDS = 50;
const SEND_GAP_MS = 300;

// ── Small helpers ──────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function toMs(value) {
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : NaN;
}

function utcDateString(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function displayName(fields) {
  const first = fields.first_name || fields.firstName || '';
  const last = fields.last_name || fields.lastName || '';
  return [first, last].filter(Boolean).join(' ') ||
    fields.org_name || fields.company_name || fields.username || 'there';
}

function emailShell(title, bodyHtml) {
  return (
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1e1b18;">' +
    '<h2 style="font-size:20px;margin:0 0 4px;">LARPABLE.</h2>' +
    '<h3 style="font-size:16px;font-weight:normal;color:#555;margin:0 0 20px;">' + escapeHtml(title) + '</h3>' +
    bodyHtml +
    '<p style="font-size:12px;color:#999;margin-top:28px;">You received this because you have a LARPABLE account.</p>' +
    '</div>'
  );
}

function oppButton(url, label) {
  return (
    '<a href="' + url + '" style="display:inline-block;padding:10px 22px;background:#111;color:#fff;' +
    'text-decoration:none;border-radius:8px;font-size:14px;font-weight:bold;">' + escapeHtml(label) + '</a>'
  );
}

// ── Activity index (backfill source) ───────────────────────────
// One linear pass per file; returns Map userId -> latest activity ms.
// users.created_at is handled by the caller (already in hand).

function collectActivity({ sessions, opportunities, applications, drafts, feedback, staffLogs }) {
  const latest = new Map();
  const note = (userId, ms) => {
    if (!userId || !Number.isFinite(ms)) return;
    if (!latest.has(userId) || ms > latest.get(userId)) latest.set(userId, ms);
  };

  for (const session of Object.values(sessions || {})) {
    if (session && session.user_id) note(session.user_id, toMs(session.created_at));
  }
  for (const opp of Object.values(opportunities || {})) {
    if (!opp || typeof opp !== 'object') continue;
    if (opp.created_by) note(opp.created_by, toMs(opp.created_at));
    let fields = null;
    try { fields = decryptObject(opp.encrypted_fields || {}); } catch { fields = null; }
    if (!fields || typeof fields !== 'object') continue;
    for (const comment of Array.isArray(fields.comments) ? fields.comments : []) {
      if (comment && comment.user_id) note(comment.user_id, toMs(comment.created_at));
      for (const reply of Array.isArray(comment && comment.replies) ? comment.replies : []) {
        if (reply && reply.user_id) note(reply.user_id, toMs(reply.created_at));
      }
    }
  }
  for (const applicants of Object.values(applications || {})) {
    if (!applicants || typeof applicants !== 'object') continue;
    for (const [userId, entry] of Object.entries(applicants)) {
      if (entry && typeof entry === 'object') note(userId, toMs(entry.applied_at));
    }
  }
  for (const draft of Object.values(drafts || {})) {
    if (draft && draft.user_id) note(draft.user_id, toMs(draft.updated_at || draft.created_at));
  }
  const records = feedback && feedback.records && typeof feedback.records === 'object'
    ? feedback.records
    : {};
  for (const record of Object.values(records)) {
    if (record && record.user_id) note(record.user_id, toMs(record.created_at));
  }
  const prompts = feedback && feedback.post_prompts && typeof feedback.post_prompts === 'object'
    ? feedback.post_prompts
    : {};
  for (const [userId, perOpp] of Object.entries(prompts)) {
    if (!perOpp || typeof perOpp !== 'object') continue;
    for (const state of Object.values(perOpp)) {
      if (!state || typeof state !== 'object') continue;
      note(userId, toMs(state.last_prompted_at));
      note(userId, toMs(state.last_deferred_at));
    }
  }
  const logs = staffLogs && staffLogs.logs && typeof staffLogs.logs === 'object' && !Array.isArray(staffLogs.logs)
    ? staffLogs.logs
    : {};
  for (const entry of Object.values(logs)) {
    if (!entry || typeof entry !== 'object') continue;
    if (!entry.user_id || entry.user_id === 'system') continue;
    note(entry.user_id, toMs(entry.timestamp));
  }
  return latest;
}

// ── Due logic ──────────────────────────────────────────────────

function isDueForReengagement(lastLoginAt, lastNotifEmailSentAt, nowMs) {
  const loginMs = toMs(lastLoginAt);
  if (!Number.isFinite(loginMs) || loginMs > nowMs) return false;
  const loginDay = Date.parse(utcDateString(loginMs));
  const todayDay = Date.parse(utcDateString(nowMs));
  if (Math.round((todayDay - loginDay) / 864e5) < REENGAGEMENT_DELAY_DAYS) return false;
  const sentMs = toMs(lastNotifEmailSentAt);
  if (Number.isFinite(sentMs) && sentMs > loginMs) return false; // already nudged for this idle stretch
  if (Number.isFinite(sentMs) && utcDateString(sentMs) === utcDateString(nowMs)) return false; // already nudged today
  return true;
}

// ── Matching (same algorithm + input shape as the For You feed) ─
// Feed parity: web_app/js/data.js computeMatchScores builds opp inputs as
// {id, skills, industry: industry||nonprofit_field, type, lat, lon, remote,
//  opportunity_preference} and user as {skills, interests,
//  opportunity_preference}; server.js /api/match/rank injects the user's
// stored latitude/longitude into the match user.

function buildMatchUser(fields) {
  return {
    skills: Array.isArray(fields.skills) ? fields.skills : [],
    interests: Array.isArray(fields.interests) ? fields.interests : [],
    opportunity_preference: fields.opportunity_preference || 'all',
    latitude: fields.latitude || null,
    longitude: fields.longitude || null
  };
}

function toRankInput(opp) {
  const f = opp.decrypted || {};
  return {
    id: opp.id,
    skills: Array.isArray(f.skills) ? f.skills : [],
    industry: f.industry || f.nonprofit_field || '',
    type: opp.type,
    latitude: f.latitude || null,
    longitude: f.longitude || null,
    remote: f.remote,
    opportunity_preference: f.opportunity_preference || 'unpaid'
  };
}

function pickTopOpportunities(matchUser, candidates, sinceMs, limit = 2) {
  const fresh = candidates.filter(o => toMs(o.created_at) > sinceMs);
  const pool = fresh.length ? fresh : candidates;
  if (!pool.length) return [];
  let scored = [];
  try {
    const ranked = matching.rank(matchUser, pool.map(toRankInput));
    const byId = new Map(pool.map(o => [o.id, o]));
    scored = (ranked || [])
      .map(item => ({ opp: byId.get(item && item.opportunity && item.opportunity.id), score: item ? item.score : 0 }))
      .filter(entry => entry.opp);
  } catch (e) {
    console.error('[notify] rank failed, falling back to recency:', e.message);
    scored = pool.map(opp => ({ opp, score: 0 }));
  }
  scored.sort((a, b) => b.score - a.score || (toMs(b.opp.created_at) - toMs(a.opp.created_at)));
  return scored.slice(0, limit);
}

// ── Email builders ─────────────────────────────────────────────

function oppUrl(oppId) {
  return SITE_URL + '/opportunity?id=' + encodeURIComponent(oppId);
}

function buildReengagementEmail({ name, picks }) {
  const subject = picks.length > 1
    ? `2 opportunities picked for you on LARPABLE`
    : `An opportunity picked for you on LARPABLE`;
  const blocks = picks.map(({ opp }) => {
    const f = opp.decrypted || {};
    const field = f.nonprofit_field || f.industry || '';
    return (
      '<div style="border:1px solid #e5e0da;border-radius:10px;padding:16px;margin:0 0 14px;">' +
      '<p style="font-size:16px;font-weight:bold;margin:0 0 4px;">' + escapeHtml(f.title || 'Untitled opportunity') + '</p>' +
      (field ? '<p style="font-size:13px;color:#777;margin:0 0 12px;">' + escapeHtml(field) + '</p>' : '') +
      oppButton(oppUrl(opp.id), 'Click here to view more') +
      '</div>'
    );
  }).join('');
  const html = emailShell(`Hi ${name}, we've found some new opportunities we think you might like`, blocks);
  const text = `Hi ${name}, we've found some new opportunities we think you might like:\n` +
    picks.map(({ opp }) => {
      const f = opp.decrypted || {};
      const field = f.nonprofit_field || f.industry || '';
      return `- ${f.title || 'Untitled opportunity'}${field ? ' (' + field + ')' : ''}: ${oppUrl(opp.id)}`;
    }).join('\n');
  return { subject, html, text };
}

function buildApplicationEmail({ oppTitle, totalCount, applierName, appliedUrl }) {
  const subject = `New application for ${oppTitle}`;
  const html = emailShell(subject,
    '<p style="font-size:14px;">Your post now has <strong>' + totalCount + '</strong> application' + (totalCount === 1 ? '' : 's') + '.</p>' +
    '<p style="font-size:14px;">Latest applicant:</p>' +
    '<p style="font-size:16px;font-weight:bold;margin:0 0 16px;">' + escapeHtml(applierName) + '</p>' +
    oppButton(appliedUrl, 'Click here to view more')
  );
  const text = `${subject}\nTotal applications: ${totalCount}\nLatest applicant: ${applierName}\nView: ${appliedUrl}`;
  return { subject, html, text };
}

// ── (a) Nightly run ────────────────────────────────────────────

async function runNightlyReengagement(nowMs = Date.now()) {
  const today = utcDateString(nowMs);
  const users = await store.read('users.json');
  const sessions = await store.read('sessions.json');
  const opportunities = await store.read('opportunities.json');
  const applications = await store.read('applications.json');
  const drafts = await store.read('drafts.json').catch(() => ({}));
  const feedback = await store.read('feedback.json').catch(() => ({}));
  const staffLogs = await store.read('staff.json').catch(() => ({}));

  const activity = collectActivity({ sessions, opportunities, applications, drafts, feedback, staffLogs });

  // Decrypt users once; resolve effective last login (stored, else derived
  // from any recorded activity, else now for users with no history).
  const summaries = [];
  for (const [userId, record] of Object.entries(users)) {
    if (!record || typeof record !== 'object' || record.type === 'admin') continue;
    let fields = {};
    try { fields = decryptObject(record.encrypted_fields || {}) || {}; } catch { continue; }
    const email = String(fields.email || '').trim();
    if (!email) continue; // back-compat accounts without an address can't be emailed
    let lastLogin = typeof record.last_login_at === 'string' ? record.last_login_at : '';
    let backfill = false;
    if (!lastLogin || !Number.isFinite(toMs(lastLogin))) {
      const derived = activity.get(userId);
      const created = toMs(record.created_at);
      const best = Math.max(
        Number.isFinite(derived) ? derived : NaN,
        Number.isFinite(created) ? created : NaN
      );
      lastLogin = Number.isFinite(best) ? new Date(best).toISOString() : new Date(nowMs).toISOString();
      backfill = true;
    }
    summaries.push({ userId, email, name: displayName(fields), fields, lastLogin, backfill, lastNotifEmailSent: record.last_notif_email_sent || '' });
  }

  // Decrypt opportunities once; reuse for ranking.
  const candidates = [];
  for (const [oppId, opp] of Object.entries(opportunities)) {
    if (!opp || typeof opp !== 'object' || opp.flagged) continue;
    let fields = {};
    try { fields = decryptObject(opp.encrypted_fields || {}) || {}; } catch { continue; }
    if (!fields.title) continue;
    candidates.push({ id: oppId, type: opp.type, created_by: opp.created_by || '', created_at: opp.created_at || '', decrypted: fields });
  }

  const pending = new Map(); // userId -> { last_login_at?, last_notif_email_sent? }
  let sent = 0, failed = 0, backfilled = 0;
  // Backfill first (all users, regardless of the send cap below).
  for (const user of summaries) {
    if (!user.backfill) continue;
    pending.set(user.userId, { ...(pending.get(user.userId) || {}), last_login_at: user.lastLogin });
    backfilled++;
  }
  // 1. Filter: not logged in for > 2 days AND not nudged in this idle stretch
  const eligible = summaries.filter(user => 
    isDueForReengagement(user.lastLogin, user.lastNotifEmailSent, nowMs)
  );

  // 2. Sort by lastNotifEmailSent, then firstName, then userId (stable tiebreak)
  eligible.sort((a, b) => {
    const timeA = toMs(a.lastNotifEmailSent) || 0;
    const timeB = toMs(b.lastNotifEmailSent) || 0;
    if (timeA !== timeB) return timeA - timeB;
    
    const nameA = String(a.fields.first_name || a.fields.firstName || '').toLowerCase();
    const nameB = String(b.fields.first_name || b.fields.firstName || '').toLowerCase();
    if (nameA !== nameB) return nameA.localeCompare(nameB);
    
    return a.userId.localeCompare(b.userId);
  });

  // 3. Select top 50
  const due = eligible.slice(0, MAX_NIGHTLY_SENDS);

  for (const user of due) {
    const matchUser = buildMatchUser(user.fields);
    const pool = candidates.filter(o => o.created_by !== user.userId);
    const picks = pickTopOpportunities(matchUser, pool, toMs(user.lastLogin), 2);
    if (!picks.length) continue;
    const { subject, html, text } = buildReengagementEmail({ name: user.name, picks });
    try {
      await sendEmail({ to: user.email, subject, html, text });
      sent++;
      pending.set(user.userId, { ...(pending.get(user.userId) || {}), last_notif_email_sent: new Date(nowMs).toISOString() });
    } catch (e) {
      failed++;
      console.error('[notify] re-engagement send failed for', user.userId + ':', e.message);
    }
    await sleep(SEND_GAP_MS);
  }

  // Single batched write: additive-only, skips users that vanished mid-run.
  if (pending.size) {
    await store.atomicUpdate('users.json', (data) => {
      for (const [userId, patch] of pending) {
        const record = data[userId];
        if (!record || typeof record !== 'object') continue;
        if (patch.last_login_at && !record.last_login_at) record.last_login_at = patch.last_login_at;
        if (patch.last_notif_email_sent) record.last_notif_email_sent = patch.last_notif_email_sent;
      }
      return data;
    });
  }
  await store.atomicUpdate(NOTIFY_FILE, (data) => {
    const out = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    out.last_reengagement_date = today;
    return out;
  });

  console.log(`[notify] nightly done checked=${summaries.length} due=${due.length} backfilled=${backfilled} sent=${sent} failed=${failed}`);
  return { checked: summaries.length, due: due.length, backfilled, sent, failed, date: today };
}

async function maybeRunNightlyReengagement(nowMs = Date.now()) {
  try {
    const today = utcDateString(nowMs);
    const state = await store.read(NOTIFY_FILE).catch(() => ({}));
    if (state && state.last_reengagement_date === today) return { skipped: true, date: today };
    return await runNightlyReengagement(nowMs);
  } catch (e) {
    console.error('[notify] nightly run failed:', e.message);
    return { error: e.message };
  }
}

// ── (b) New-application notification ───────────────────────────

async function notifyPosterOfApplication(oppId) {
  try {
    const opportunity = await store.getById('opportunities.json', oppId);
    if (!opportunity || opportunity.flagged || !opportunity.created_by) return { skipped: 'no-opportunity' };
    const oppFields = decryptObject(opportunity.encrypted_fields || {}) || {};
    const poster = await store.getById('users.json', opportunity.created_by);
    if (!poster) return { skipped: 'no-poster' };
    const posterFields = decryptObject(poster.encrypted_fields || {}) || {};
    const posterEmail = String(posterFields.email || '').trim();
    if (!posterEmail) return { skipped: 'no-poster-email' };

    const applications = await store.read('applications.json');
    const applicants = (applications && applications[oppId]) || {};
    const entries = Object.entries(applicants);
    if (!entries.length) return { skipped: 'no-applicants' };
    entries.sort((a, b) => toMs(b[1] && b[1].applied_at) - toMs(a[1] && a[1].applied_at));
    const [latestId] = entries[0];
    const users = await store.read('users.json');
    const latestUser = users[latestId];
    let applierName = 'A new applicant';
    if (latestUser) {
      try {
        applierName = displayName(decryptObject(latestUser.encrypted_fields || {}) || {});
      } catch { /* keep fallback */ }
    }
    const oppTitle = oppFields.title || 'your opportunity';
    const { subject, html, text } = buildApplicationEmail({
      oppTitle,
      totalCount: entries.length,
      applierName,
      appliedUrl: oppUrl(oppId) + '#applied'
    });
    await sendEmail({ to: posterEmail, subject, html, text });
    return { sent: true, to: posterEmail };
  } catch (e) {
    // Never fail the apply request because of a notification.
    console.error('[notify] application email failed for', oppId + ':', e.message);
    return { error: e.message };
  }
}

module.exports = {
  SITE_URL,
  NOTIFY_FILE,
  utcDateString,
  isDueForReengagement,
  buildMatchUser,
  toRankInput,
  pickTopOpportunities,
  buildReengagementEmail,
  buildApplicationEmail,
  collectActivity,
  runNightlyReengagement,
  maybeRunNightlyReengagement,
  notifyPosterOfApplication
};
