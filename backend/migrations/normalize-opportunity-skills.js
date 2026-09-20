/**
 * Migrate legacy opportunity skill labels to the canonical signup taxonomy.
 * Existing records are updated through the application store only; no record
 * is deleted and all unrelated encrypted fields remain untouched.
 */
const store = require('../store');
const { decryptObject, encryptObject } = require('../crypto');
const { normalizeOpportunitySkills } = require('../skill-normalization');

async function normalizeOpportunityPostSkills() {
  let updated = 0;
  await store.atomicUpdate('opportunities.json', opportunities => {
    for (const opportunity of Object.values(opportunities)) {
      const fields = decryptObject(opportunity.encrypted_fields || {});
      if (!Array.isArray(fields.skills)) continue;

      const skills = normalizeOpportunitySkills(fields.skills);
      if (JSON.stringify(skills) === JSON.stringify(fields.skills)) continue;

      fields.skills = skills;
      opportunity.encrypted_fields = encryptObject(fields);
      updated++;
    }
    return opportunities;
  });
  return updated;
}

module.exports = { normalizeOpportunityPostSkills };
