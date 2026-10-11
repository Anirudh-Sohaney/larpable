/**
 * LARPABLE — Startup value migration
 *
 * Rewrites legacy skill / field / industry values stored before the taxonomy
 * rename onto the canonical labels used today, so old opportunity, user and
 * draft records match what the create form and filters now offer.
 *
 * Runs once at server start. It is idempotent and only writes a file when a
 * record actually changes, so it is safe to run on every boot (production and
 * local alike). Unknown values are preserved untouched — no information is
 * ever dropped.
 */

const store = require('../store');
const { encryptObject, decryptObject } = require('../crypto');
const { normalizeSkills, normalizeField } = require('../canonical');

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function normalizeFields(fields) {
  const next = { ...fields };
  next.skills = normalizeSkills(fields.skills);
  if (typeof fields.nonprofit_field === 'string') next.nonprofit_field = normalizeField(fields.nonprofit_field);
  if (typeof fields.industry === 'string') next.industry = normalizeField(fields.industry);
  return next;
}

function fieldsChanged(a, b) {
  return !sameJson(a.skills, b.skills)
    || a.nonprofit_field !== b.nonprofit_field
    || a.industry !== b.industry;
}

async function migrateOpportunities(report) {
  const data = await store.read('opportunities.json');
  let changed = 0;
  let touched = false;
  for (const opp of Object.values(data)) {
    if (!opp || !opp.encrypted_fields) continue;
    const before = decryptObject(opp.encrypted_fields);
    const after = normalizeFields(before);
    if (!fieldsChanged(after, before)) continue;
    opp.encrypted_fields = encryptObject(after);
    changed++;
    touched = true;
  }
  if (touched) await store.write('opportunities.json', data);
  report.opportunities = changed;
}

async function migrateUsers(report) {
  const data = await store.read('users.json');
  let changed = 0;
  let touched = false;
  for (const user of Object.values(data)) {
    if (!user || !user.encrypted_fields) continue;
    const before = decryptObject(user.encrypted_fields);
    const after = { ...before };
    after.skills = normalizeSkills(before.skills);
    if (Array.isArray(before.experiences)) {
      after.experiences = before.experiences.map(experience => {
        if (!experience || typeof experience !== 'object') return experience;
        return { ...experience, skills: normalizeSkills(experience.skills) };
      });
    }
    let recordChanged = !sameJson(after.skills, before.skills);
    if (after.experiences) recordChanged = recordChanged || !sameJson(after.experiences, before.experiences);
    if (!recordChanged) continue;
    user.encrypted_fields = encryptObject(after);
    changed++;
    touched = true;
  }
  if (touched) await store.write('users.json', data);
  report.users = changed;
}

async function migrateDrafts(report) {
  const data = await store.read('drafts.json');
  let changed = 0;
  let touched = false;
  for (const draft of Object.values(data)) {
    if (!draft || !draft.fields) continue;
    const before = draft.fields;
    const after = normalizeFields(before);
    if (!fieldsChanged(after, before)) continue;
    draft.fields = after;
    changed++;
    touched = true;
  }
  if (touched) await store.write('drafts.json', data);
  report.drafts = changed;
}

async function run() {
  const report = { opportunities: 0, users: 0, drafts: 0 };
  await migrateOpportunities(report);
  await migrateUsers(report);
  await migrateDrafts(report);
  const total = report.opportunities + report.users + report.drafts;
  if (total > 0) {
    console.log(`[migration] canonicalized values — opportunities: ${report.opportunities}, users: ${report.users}, drafts: ${report.drafts}`);
  }
  return report;
}

module.exports = { run };
