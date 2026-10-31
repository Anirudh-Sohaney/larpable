const { normalizeSkills } = require('./canonical');

const MIN_SKILLS = 3;
const MAX_DESCRIPTION_WORDS = 15;

function validatePostContent({ skills, description, requireSkills }) {
  if (requireSkills && normalizeSkills(skills).length < MIN_SKILLS) {
    return `Select at least ${MIN_SKILLS} skills`;
  }
  if (description !== undefined && String(description || '').trim().split(/\s+/).filter(Boolean).length > MAX_DESCRIPTION_WORDS) {
    return `Description must be ${MAX_DESCRIPTION_WORDS} words or fewer`;
  }
  return null;
}

module.exports = { validatePostContent };
