const { sanitize } = require('./sanitize');
const { scanFields } = require('./profanity');

const TYPES = new Set(['project', 'internship', 'job']);
const MAX_EXPERIENCES = 5;

function fail(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

function wordCount(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length;
}

function validateExperiences(value) {
  if (!Array.isArray(value)) fail('Experiences must be a list.');
  if (value.length > MAX_EXPERIENCES) fail('You can save up to 5 experiences.');

  return value.map((entry, index) => {
    const label = `Experience ${index + 1}`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail(`${label} is invalid.`);
    if (!TYPES.has(entry.type)) fail(`${label} must be a project, internship, or job.`);
    for (const key of ['title', 'description', 'company_name']) {
      if (entry[key] !== undefined && typeof entry[key] !== 'string') fail(`${label} has an invalid ${key.replace('_', ' ')}.`);
    }
    const title = sanitize(entry.title || '');
    const description = sanitize(entry.description || '');
    const companyName = sanitize(entry.company_name || '');
    if (!title || title.length > 120) fail(`${label} needs a title of up to 120 characters.`);
    if (entry.type !== 'project' && (!companyName || companyName.length > 120)) {
      fail(`${label} needs a company name of up to 120 characters.`);
    }
    if (description.length > 12000 || wordCount(description) < 10 || wordCount(description) > 150) {
      fail(`${label} needs a description of 10 to 150 words.`);
    }
    if (!Array.isArray(entry.skills) || entry.skills.length < 1 || entry.skills.length > 3 ||
        entry.skills.some(skill => typeof skill !== 'string' || !sanitize(skill) || sanitize(skill).length > 120)) {
      fail(`${label} needs 1 to 3 relevant skills.`);
    }
    const skills = entry.skills.map(sanitize);
    if (new Set(skills.map(skill => skill.toLowerCase())).size !== skills.length) {
      fail(`${label} has duplicate skills.`);
    }
    // Scan the original values as well as the cleaned values, so markup cannot
    // be used to hide prohibited language before persistence.
    const originalScan = scanFields({
      title: entry.title,
      name: entry.company_name,
      description: entry.description,
      skills: entry.skills
    });
    const cleanedScan = scanFields({ title, name: companyName, description, skills });
    if (originalScan.flagged || cleanedScan.flagged) {
      fail(`${label} contains prohibited language. Remove it before saving.`);
    }
    return {
      type: entry.type,
      title,
      ...(entry.type !== 'project' ? { company_name: companyName } : {}),
      description,
      skills
    };
  });
}

module.exports = { validateExperiences, wordCount, MAX_EXPERIENCES };
