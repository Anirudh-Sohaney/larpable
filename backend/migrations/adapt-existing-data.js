/**
 * Temporary one-time adapter for the already deployed legacy records.
 * All writes go through the application's atomic encrypted JSON store.
 * Remove this adapter once the production data has been verified.
 */
const store = require('../store');
const { decryptObject, encryptObject } = require('../crypto');
const { normalizeOpportunitySkills } = require('../skill-normalization');

const TARGET_PAID_PROJECT_ID = 'opp_fac5a217c76a';
const TARGET_PAID_PROJECT_TITLE = 'verge challenge';
const USER_PREFERENCES = new Set(['paid', 'unpaid', 'volunteer', 'all']);

async function adaptExistingData() {
  const target = await store.getById('opportunities.json', TARGET_PAID_PROJECT_ID);
  if (!target) throw new Error(`Required paid project ${TARGET_PAID_PROJECT_ID} was not found`);
  const targetFields = decryptObject(target.encrypted_fields || {});
  if (String(targetFields.title || '').trim().toLowerCase() !== TARGET_PAID_PROJECT_TITLE || target.type !== 'project') {
    throw new Error(`Required paid project ${TARGET_PAID_PROJECT_ID} did not match its expected title and type`);
  }

  const counts = { users: 0, opportunities: 0, skillArrays: 0, skillValues: 0, deduplicatedSkills: 0 };

  await store.atomicUpdate('users.json', users => {
    for (const user of Object.values(users)) {
      const fields = decryptObject(user.encrypted_fields || {});
      if (USER_PREFERENCES.has(fields.opportunity_preference)) continue;
      fields.opportunity_preference = 'all';
      user.encrypted_fields = encryptObject(fields);
      counts.users++;
    }
    return users;
  });

  await store.atomicUpdate('opportunities.json', opportunities => {
    for (const [id, opportunity] of Object.entries(opportunities)) {
      const fields = decryptObject(opportunity.encrypted_fields || {});
      const preference = id === TARGET_PAID_PROJECT_ID
        ? 'paid'
        : opportunity.type === 'nonprofit' ? 'volunteering' : 'unpaid';
      let changed = fields.opportunity_preference !== preference;

      if (Array.isArray(fields.skills)) {
        const normalizedSkills = normalizeOpportunitySkills(fields.skills);
        if (JSON.stringify(normalizedSkills) !== JSON.stringify(fields.skills)) {
          counts.skillArrays++;
          counts.skillValues += fields.skills.length;
          counts.deduplicatedSkills += fields.skills.length - normalizedSkills.length;
          fields.skills = normalizedSkills;
          changed = true;
        }
      }

      if (!changed) continue;
      fields.opportunity_preference = preference;
      opportunity.encrypted_fields = encryptObject(fields);
      counts.opportunities++;
    }
    return opportunities;
  });

  return counts;
}

module.exports = { adaptExistingData, TARGET_PAID_PROJECT_ID };
