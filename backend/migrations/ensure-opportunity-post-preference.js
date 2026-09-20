/**
 * Backfill opportunity preference for posts that predate the field.
 * Existing values are preserved; this runs safely on every startup.
 */

const store = require('../store');
const { decryptObject, encryptObject } = require('../crypto');

const VALID_PREFERENCES = new Set(['volunteering', 'paid', 'unpaid']);

function defaultForType(type) {
  return type === 'nonprofit' ? 'volunteering' : 'unpaid';
}

async function ensureOpportunityPostPreference() {
  let updated = 0;
  await store.atomicUpdate('opportunities.json', (opportunities) => {
    for (const opportunity of Object.values(opportunities)) {
      const fields = decryptObject(opportunity.encrypted_fields || {});
      if (VALID_PREFERENCES.has(fields.opportunity_preference)) continue;
      fields.opportunity_preference = defaultForType(opportunity.type);
      opportunity.encrypted_fields = encryptObject(fields);
      updated++;
    }
    return opportunities;
  });
  return updated;
}

module.exports = { ensureOpportunityPostPreference, defaultForType };
