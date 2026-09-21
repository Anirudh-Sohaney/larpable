/**
 * Apply explicit, reviewed corrections to existing opportunity preferences.
 * This is idempotent and updates records only through the application store.
 */
const store = require('../store');
const { decryptObject, encryptObject } = require('../crypto');

const OPPORTUNITY_PREFERENCE_OVERRIDES = {
  opp_fac5a217c76a: {
    title: 'Verge challenge',
    preference: 'paid'
  }
};

async function applyOpportunityPreferenceOverrides() {
  let updated = 0;
  await store.atomicUpdate('opportunities.json', opportunities => {
    for (const [id, override] of Object.entries(OPPORTUNITY_PREFERENCE_OVERRIDES)) {
      const opportunity = opportunities[id];
      if (!opportunity) continue;

      const fields = decryptObject(opportunity.encrypted_fields || {});
      if (String(fields.title || '').trim().toLowerCase() !== override.title.toLowerCase()) continue;
      if (fields.opportunity_preference === override.preference) continue;

      fields.opportunity_preference = override.preference;
      opportunity.encrypted_fields = encryptObject(fields);
      updated++;
    }
    return opportunities;
  });
  return updated;
}

module.exports = { applyOpportunityPreferenceOverrides, OPPORTUNITY_PREFERENCE_OVERRIDES };
