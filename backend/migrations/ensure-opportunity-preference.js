/**
 * Ensure every existing user has an opportunity preference.
 *
 * This is intentionally idempotent: it only writes users whose encrypted
 * profile does not already contain opportunity_preference.
 */

const store = require('../store');
const { decryptObject, encryptObject } = require('../crypto');

const DEFAULT_PREFERENCE = 'all';
const VALID_PREFERENCES = new Set(['paid', 'unpaid', 'volunteer', 'all']);

async function ensureOpportunityPreference() {
  let updated = 0;

  await store.atomicUpdate('users.json', (users) => {
    for (const user of Object.values(users)) {
      const fields = decryptObject(user.encrypted_fields || {});
      if (VALID_PREFERENCES.has(fields.opportunity_preference)) continue;

      fields.opportunity_preference = DEFAULT_PREFERENCE;
      user.encrypted_fields = encryptObject(fields);
      updated++;
    }
    return users;
  });

  return updated;
}

module.exports = { ensureOpportunityPreference, DEFAULT_PREFERENCE };
