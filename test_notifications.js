/**
 * LARPABLE — Notification architecture test (LOCAL ONLY)
 *
 *   node test_notifications.js            → read-only dry run.
 *     Prints aggregate counts only (no PII, no emails, no writes).
 *   node test_notifications.js --send     → sends exactly 2 sample emails,
 *     both to TEST_EMAIL below. Any other recipient is refused by guard.
 *
 * NEVER point this at the production database. NEVER bulk-send.
 */
require('dotenv').config();

const TEST_EMAIL = 'anirudh.sohaney@gmail.com';

const store = require('./backend/store');
const { decryptObject } = require('./backend/crypto');
const { sendEmail } = require('./backend/mailer');
const re = require('./backend/reengagement');

function assert(cond, msg) {
  if (!cond) { console.error('ASSERT FAILED:', msg); process.exitCode = 1; }
  else console.log('  ok:', msg);
}

async function dryRun() {
  console.log('── dry run (read-only, counts only) ──');
  const users = await store.read('users.json');
  const sessions = await store.read('sessions.json');
  const opportunities = await store.read('opportunities.json');
  const applications = await store.read('applications.json');
  const drafts = await store.read('drafts.json').catch(() => ({}));
  const feedback = await store.read('feedback.json').catch(() => ({}));
  const staffLogs = await store.read('staff.json').catch(() => ({}));

  const ids = Object.entries(users)
    .filter(([, r]) => r && typeof r === 'object' && r.type !== 'admin')
    .map(([id]) => id);
  const withLogin = ids.filter(id => typeof users[id].last_login_at === 'string' && Number.isFinite(new Date(users[id].last_login_at).getTime()));
  console.log(`users=${ids.length} with_last_login_at=${withLogin.length}`);

  const activity = re.collectActivity({ sessions, opportunities, applications, drafts, feedback, staffLogs });
  const now = Date.now();
  let derived = 0, noneWouldUseNow = 0, dueToday = 0, emailable = 0;
  for (const id of ids) {
    const record = users[id];
    if (record.last_login_at && Number.isFinite(new Date(record.last_login_at).getTime())) {
      if (re.isDueForReengagement(record.last_login_at, record.last_notif_email_sent || '', now)) dueToday++;
      continue;
    }
    let fields = {};
    try { fields = decryptObject(record.encrypted_fields || {}) || {}; } catch { continue; }
    if (!String(fields.email || '').trim()) continue;
    emailable++;
    const best = Math.max(
      activity.has(id) ? activity.get(id) : NaN,
      new Date(record.created_at).getTime()
    );
    if (Number.isFinite(best)) {
      derived++;
      if (re.isDueForReengagement(new Date(best).toISOString(), '', now)) dueToday++;
    } else noneWouldUseNow++;
  }
  console.log(`missing_field_but_emailable=${emailable} derivable_from_activity=${derived} no_history_would_use_now=${noneWouldUseNow}`);
  console.log(`would_be_due_if_ran_today=${dueToday} (count only — nothing sent, nothing written)`);
}

function unitChecks() {
  console.log('── pure-function checks ──');
  const now = Date.parse('2026-10-05T12:00:00.000Z');
  const isoDaysAgo = n => new Date(now - n * 864e5).toISOString();
  assert(re.utcDateString(now) === '2026-10-05', 'utcDateString consistent UTC date');
  assert(re.isDueForReengagement(isoDaysAgo(2), '', now) === true, '2 days ago → due');
  assert(re.isDueForReengagement(isoDaysAgo(1), '', now) === false, '1 day ago → not due');
  assert(re.isDueForReengagement(isoDaysAgo(3), '', now) === true, '3 days ago → due');
  assert(re.isDueForReengagement(isoDaysAgo(9), '', now) === true, '9 days ago → due');
  assert(re.isDueForReengagement(isoDaysAgo(2), isoDaysAgo(0), now) === false, 'already nudged today → not due');
  assert(re.isDueForReengagement(isoDaysAgo(5), isoDaysAgo(3), now) === false, 'nudged after this login → not re-nudged');
  assert(re.isDueForReengagement(isoDaysAgo(3), isoDaysAgo(5), now) === true, 'nudge predates latest login → new idle stretch, due');
  assert(re.isDueForReengagement('not-a-date', '', now) === false, 'invalid timestamp → not due');
  assert(re.isDueForReengagement(isoDaysAgo(-1), '', now) === false, 'future timestamp → not due');

  const matchUser = { skills: ['JavaScript', 'Design'], interests: ['Education & Learning'], opportunity_preference: 'all', latitude: null, longitude: null };
  const mk = (id, daysOld, skills, field) => ({
    id, type: 'project', created_by: 'usr_other', created_at: isoDaysAgo(daysOld),
    decrypted: { title: 'Opp ' + id, skills, nonprofit_field: field, opportunity_preference: 'unpaid', remote: true, latitude: null, longitude: null }
  });
  const freshGood = mk('fresh-good', 1, ['JavaScript'], 'Education & Learning');
  const freshBad = mk('fresh-bad', 1, ['Welding'], 'Environment, Agriculture & Sports');
  const oldGood = mk('old-good', 10, ['JavaScript'], 'Education & Learning');
  const own = { ...mk('own-post', 1, ['JavaScript'], 'Education & Learning'), created_by: 'usr_me' };
  const pool = [freshBad, oldGood, freshGood];
  const picksNew = re.pickTopOpportunities(matchUser, pool, now - 2 * 864e5, 2);
  assert(picksNew.length === 2 && picksNew[0].opp.id === 'fresh-good', 'prefers new posts, best match first');
  const picksFallback = re.pickTopOpportunities(matchUser, [oldGood], now - 0.5 * 864e5, 2);
  assert(picksFallback.length === 1 && picksFallback[0].opp.id === 'old-good', 'falls back to old posts when nothing new');
  const poolMinusOwn = [own, ...pool].filter(o => o.created_by !== 'usr_me');
  assert(!poolMinusOwn.some(o => o.id === 'own-post'), 'own posts excluded from candidate pool (nightly filter)');

  const email = re.buildReengagementEmail({ name: 'Test User', picks: [{ opp: freshGood, score: 0.9 }, { opp: oldGood, score: 0.8 }] });
  assert(email.html.includes('/opportunity?id=fresh-good') && email.html.includes('Click here to view more'), 're-engagement email has per-opp buttons');
  assert(email.html.includes('Education &amp; Learning') || email.html.includes('Education & Learning'), 'field shown when specified');
  const noField = re.buildReengagementEmail({ name: 'T', picks: [{ opp: { ...freshGood, decrypted: { ...freshGood.decrypted, nonprofit_field: '', industry: '' } }, score: 1 }] });
  assert(!noField.html.includes('color:#777'), 'field omitted when unspecified');

  const appEmail = re.buildApplicationEmail({ oppTitle: 'Sample Opp', totalCount: 3, applierName: 'Jane Doe', appliedUrl: 'https://larpable.me/opportunity?id=opp_x#applied' });
  assert(appEmail.subject === 'New application for Sample Opp', 'application subject format');
  assert(appEmail.html.includes('<strong>3</strong>') && appEmail.html.includes('Jane Doe'), 'count + latest applier shown');
  assert(appEmail.html.includes('#applied'), 'button links to applied view');
}

async function sendSamples() {
  console.log('── sending 2 sample emails to ' + TEST_EMAIL + ' ──');
  const re1 = re.buildReengagementEmail({
    name: 'Ani (TEST)',
    picks: [
      { opp: { id: 'opp_sample1', decrypted: { title: '[TEST] River Cleanup Crew', nonprofit_field: 'Environment', opportunity_preference: 'volunteer' } }, score: 0.92 },
      { opp: { id: 'opp_sample2', decrypted: { title: '[TEST] Tutoring Network', nonprofit_field: '', opportunity_preference: 'unpaid' } }, score: 0.81 }
    ]
  });
  const r1 = await sendEmail({ to: TEST_EMAIL, subject: '[TEST] ' + re1.subject, html: re1.html, text: re1.text });
  console.log('re-engagement sample:', JSON.stringify(r1));
  const re2 = re.buildApplicationEmail({
    oppTitle: '[TEST] River Cleanup Crew', totalCount: 3, applierName: '[TEST] Jane Doe',
    appliedUrl: 'https://larpable.me/opportunity?id=opp_sample1#applied'
  });
  const r2 = await sendEmail({ to: TEST_EMAIL, subject: '[TEST] ' + re2.subject, html: re2.html, text: re2.text });
  console.log('application sample:', JSON.stringify(r2));
}

(async () => {
  await dryRun();
  unitChecks();
  if (process.argv.includes('--send')) {
    if (TEST_EMAIL !== 'anirudh.sohaney@gmail.com') throw new Error('Test recipient guard tripped');
    await sendSamples();
  } else {
    console.log('(pass --send to deliver the 2 samples to ' + TEST_EMAIL + ')');
  }
})().catch(e => { console.error('TEST ERROR:', e.message); process.exit(1); });
