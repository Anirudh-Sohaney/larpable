/**
 * LARPABLE — Taxonomy Swap Coverage Audit
 *
 * Extracts every distinct skill, interest, and field stored across
 * users.json + opportunities.json in a given data directory, then checks
 * whether the old→new taxonomy swap in /app/ accounts for each one.
 *
 * The swap has three layers, all imported so the audit tests exactly what
 * the running app does:
 *   1. similarity.js canonicalSkill / canonicalInterest / canonicalField
 *      (backend matching: taxonomy.json skill_aliases/interest_aliases +
 *      hardcoded field alias map)
 *   2. web_app/synonyms.js normalizeSynonym (frontend search/display:
 *      SYYNONYM_TO_CANONICAL + COMPATIBILITY_CANONICAL)
 *
 * Coverage rule (information-retention, NOT count-retention):
 *   A term is COVERED if the swap maps it to a canonical value that exists
 *   in taxonomy.json (skills/interests/fields). Many legacy terms may fold
 *   onto one canonical value — that is the intended behavior ("python" +
 *   "java" → "Programming" keeps the information, drops the detail).
 *   A term is UNCOVERED if it survives the swap unchanged AND is not itself
 *   a canonical value — matching has no vector/label for it, so that piece
 *   of information would be lost.
 *
 * Usage:
 *   node audit_taxonomy.js                     # uses resolved DATA_DIR
 *   node audit_taxonomy.js <data-dir>          # explicit data dir
 *   DATA_DIR=... node audit_taxonomy.js
 *   ENCRYPTION_KEY=... node audit_taxonomy.js  # already in app/.env
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const fs = require('fs');
const path = require('path');
const { decryptObject } = require('../crypto');
const { canonicalSkill, canonicalInterest, canonicalField } = require('./similarity');
const { normalizeSynonym } = require('../../web_app/synonyms');
const TAXONOMY = JSON.parse(fs.readFileSync(path.join(__dirname, 'taxonomy.json'), 'utf8'));

// ── Resolve data dir (mirrors store.js resolveDataDir) ──────────
function resolveDataDir(arg) {
  if (arg) return arg;
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  const parent = path.join(__dirname, '..', '..', '..');
  for (const d of ['data', 'larpable_data']) {
    const p = path.join(parent, d);
    if (fs.existsSync(p)) return p;
  }
  return path.join(parent, 'data');
}
const DATA_DIR = resolveDataDir(process.argv[2]);

// ── Collect every term from users + opportunities ───────────────
function collect(file) {
  const found = { skills: new Set(), interests: new Set(), fields: new Set() };
  const records = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
  const decryptedCount = { fail: 0 };
  for (const record of Object.values(records)) {
    let decoded;
    try { decoded = decryptObject(record); } catch { decryptedCount.fail++; continue; }
    const values = decoded.encrypted_fields || {};
    (values.skills || []).forEach(x => typeof x === 'string' && found.skills.add(x));
    (values.interests || []).forEach(x => typeof x === 'string' && found.interests.add(x));
    [values.field, values.industry, values.nonprofit_field].filter(x => typeof x === 'string' && x).forEach(x => found.fields.add(x));
  }
  return { found, decryptedCount };
}

const users = collect('users.json');
const opps = collect('opportunities.json');
const skills = new Set([...users.found.skills, ...opps.found.skills]);
const interests = new Set([...users.found.interests, ...opps.found.interests]);
const fields = new Set([...users.found.fields, ...opps.found.fields]);

// ── Canonical reference sets (case-insensitive) ────────────────
const canon = (set) => new Set(set.map(x => String(x).toLowerCase()));
const canonSkills = canon(TAXONOMY.skills);
const canonInterests = canon(TAXONOMY.interests);
const canonFields = canon(TAXONOMY.fields);

// ── Audit one kind ─────────────────────────────────────────────
function audit(kind, values, canonicalFn, canonSet, lines) {
  const covered = [], uncovered = [];
  for (const value of values) {
    const backend = canonicalFn(value);
    const frontend = normalizeSynonym(value);
    const backendOk = backend && canonSet.has(String(backend).toLowerCase());
    const frontendOk = frontend && canonSet.has(String(frontend).toLowerCase());
    const via = backendOk ? (String(backend) !== String(value) ? `→ ${backend}` : 'already canonical')
      : frontendOk ? `→ ${frontend} (synonyms)` : 'NO MAPPING';
    const entry = { value, via, backend: String(backend), frontend: String(frontend), status: backendOk || frontendOk ? 'covered' : 'UNCOVERED' };
    (entry.status === 'covered' ? covered : uncovered).push(entry);
  }
  const byLine = (e) => `  [${e.status === 'covered' ? 'OK ' : 'GAP' }] ${e.value}  ${e.via}`;
  covered.sort((a, b) => a.value.localeCompare(b.value)).forEach(e => lines.push(byLine(e)));
  uncovered.sort((a, b) => a.value.localeCompare(b.value)).forEach(e => lines.push(byLine(e)));
  return { covered, uncovered };
}

const lines = [];
lines.push(`DATA_DIR: ${DATA_DIR}`);
lines.push(`users.json decryption failures: ${users.decryptedCount.fail}`);
lines.push(`opportunities.json decryption failures: ${opps.decryptedCount.fail}`);
lines.push('');
lines.push(`=== SKILLS (${skills.size} unique) ===`);
const sk = audit('skill', skills, canonicalSkill, canonSkills, lines);
lines.push('');
lines.push(`=== INTERESTS (${interests.size} unique) ===`);
const it = audit('interest', interests, canonicalInterest, canonInterests, lines);
lines.push('');
lines.push(`=== FIELDS (${fields.size} unique) ===`);
const fl = audit('field', fields, canonicalField, canonFields, lines);

lines.push('');
lines.push('=== SUMMARY ===');
const report = {};
for (const [name, r] of [['skills', sk], ['interests', it], ['fields', fl], ['ALL', { covered: [...sk.covered, ...it.covered, ...fl.covered], uncovered: [...sk.uncovered, ...it.uncovered, ...fl.uncovered] }]]) {
  const total = r.covered.length + r.uncovered.length;
  const pct = total ? Math.round(r.covered.length / total * 100) : 100;
  report[name] = { total, covered: r.covered.length, uncovered: r.uncovered.length, pct };
  lines.push(`${name.padEnd(10)} total ${total.toString().padStart(3)}  covered ${r.covered.length.toString().padStart(3)} (${pct}%)  uncovered ${r.uncovered.length}`);
}
for (const name of ['skills', 'interests', 'fields']) {
  if (report[name].uncovered) {
    lines.push('');
    lines.push(`UNCOVERED ${name.toUpperCase()} — add alias entries for these:`);
    (name === 'skills' ? sk : name === 'interests' ? it : fl).uncovered.forEach(e => lines.push(`  ${e.value}`));
  }
}
console.log(lines.join('\n'));
if (report.ALL.uncovered > 0) process.exitCode = 1;