/**
 * LARPABLE — Profanity Filter
 *
 * Two layers:
 *   1. MIT-licensed `obscenity` algorithm — curated English/British wordlist
 *      with word-boundary matching, leet-speak resolution and reserved
 *      phonetic traps like "Scunthorpe" / "classic" / "assistance".
 *   2. A supplemental strict wordlist (EXTRA_RULES) for strong slurs and
 *      profanity the curated dataset omits (wetback, spic, gook, pedo, ...).
 *
 * Every new post is scanned at creation time; if any input field (title/name,
 * description, looking_for, details, location, skills) contains profanity the
 * post is stored `flagged: true` — it is held from the public feed until a
 * staff member with `flagged_control` approves it, appears immediately in the
 * staff Work tab's flagged-posts queue, and the author is told their post is
 * under review. Only an approved post reaches the public feed.
 */

const { RegExpMatcher, englishDataset, englishRecommendedTransformers } = require('obscenity');

// Recommended pipeline: case folding, leet-speak ("sh1t", "b1tch"), confusable
// letters (Cyrillic/Greek lookalikes) — matched per-word with intact word
// boundaries so "assistance", "class", "bass", "Scunthorpe" are never flagged.
const matcher = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });

// ── Supplemental strict wordlist ─────────────────────────────────────────
// Covers strong slurs / profanity missing from obscenity's curated set, with
// narrow derivational suffixes so benign lookalikes stay clean ("spicy" is
// never matched because 'spic' only ever matches "spic"/"spics").
const EXTRA_RULES = [
  ['wetback', 's'],
  ['spic', 's'],
  ['paki', 's'],
  ['gook', 's'],
  ['beaner', 's'],
  ['mick', 's'],
  ['homo', 's'],
  ['molest', 'ing|ed|er|s'],
  ['molestation', 's'],
  ['pedophile', 's'],
  ['pedo', 's'],
  ['smegma', 's'],
  ['hoe', 's|ing'],
  ['dumbass', 'es'],
  ['douchebag', 's'],
  ['schlong', 's']
].map(([term, suffixes]) => ({
  term,
  re: new RegExp(`(^|[^a-z])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(${suffixes})?(?=$|[^a-z])`, 'i')
}));

// Input fields scanned on every new post. Mirrors the writable fields in
// opportunity.routes.js / draft.routes.js.
const SCANNED_FIELDS = ['title', 'name', 'description', 'looking_for', 'details', 'location', 'skills'];

/**
 * Scan post input fields for profanity.
 * @param {Object} fields - plaintext post fields (e.g. the to-be-encrypted block)
 * @returns {{ flagged: boolean, terms: string[], fields: string[] }}
 */
function scanFields(fields) {
  const terms = [];
  const hitFields = [];

  const check = (field, value) => {
    if (typeof value !== 'string' || !value.trim()) return;
    const matches = matcher.getAllMatches(value);
    const found = [];
    for (const match of matches) {
      const word = englishDataset.getPayloadWithPhraseMetadata(match).phraseMetadata.originalWord;
      if (word && !found.includes(word)) found.push(word);
    }
    for (const rule of EXTRA_RULES) {
      if (rule.re.test(value) && !found.includes(rule.term)) found.push(rule.term);
    }
    if (!found.length) return;
    for (const word of found) {
      if (!terms.includes(word)) terms.push(word);
    }
    if (!hitFields.includes(field)) hitFields.push(field);
  };

  for (const field of SCANNED_FIELDS) {
    const value = fields?.[field];
    if (typeof value === 'string') {
      check(field, value);
    } else if (Array.isArray(value)) {
      // skills arrives as an array of words — scan each entry as its own field
      value.forEach(item => check(field, String(item || '')));
    }
  }

  return { flagged: hitFields.length > 0, terms, fields: hitFields };
}

/**
 * Attach flag metadata to an opportunity record. Idempotent — safe to call
 * on existing records (keeps prior approval fields for audit).
 * @param {Object} record - raw opp record
 * @param {{ terms: string[], fields: string[] }} scan
 * @param {string} [at] - ISO timestamp
 */
function applyFlag(record, scan, at) {
  if (!scan || !scan.flagged) return record;
  record.flagged = true;
  record.flagged_terms = scan.terms || [];
  record.flagged_fields = scan.fields || [];
  record.flagged_at = at || new Date().toISOString();
  return record;
}

/**
 * Approve a flagged post: clears the flag and records who/when approved.
 * @param {Object} record - raw opp record
 * @param {string} approvedBy - staff member userId
 * @param {string} [at] - ISO timestamp
 */
function applyApproval(record, approvedBy, at) {
  record.flagged = false;
  record.approved_at = at || new Date().toISOString();
  record.approved_by = approvedBy;
  return record;
}

/**
 * Author-facing notice explaining the post was flagged and is under review.
 * @param {string[]} terms - matched words (may be empty)
 */
function flagNotice(terms) {
  const listed = terms && terms.length ? ` (found: ${terms.slice(0, 5).join(', ')})` : '';
  return `Your post was flagged and is under review${listed}. It contains language that breaks our community guidelines, so it will not appear on the public feed until a moderator approves it.`;
}

module.exports = { scanFields, applyFlag, applyApproval, flagNotice };