/**
 * LARPABLE — Canonical value normalizer
 *
 * Single source of truth for mapping legacy skill / field / industry labels
 * onto the canonical taxonomy used everywhere in the app (create form, filters,
 * matching). Used by the startup data migration so pre-rename records are
 * rewritten in place, and by the create/edit routes so new values are stored
 * canonical from the start.
 *
 * Rules:
 *   - Canonical names always map to themselves.
 *   - Values with no known mapping are returned unchanged (never dropped).
 *   - Skill lists are deduped after normalization (order preserved).
 */

const taxonomy = require('./matching/taxonomy.json');
const skillSynonyms = require('./matching/skill_synonyms.json');

const CANONICAL_SKILLS = new Set(taxonomy.skills || []);
const CANONICAL_FIELDS = new Set(taxonomy.fields || []);

function key(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

// ── Skill aliases ────────────────────────────────────────────
const SKILL_ALIASES = new Map();

// 1. Canonical names map to themselves.
for (const skill of CANONICAL_SKILLS) SKILL_ALIASES.set(key(skill), skill);

// 2. Authoritative alias table shipped with the taxonomy (old label → canonical).
for (const [alias, canonical] of Object.entries(taxonomy.skill_aliases || {})) {
  if (CANONICAL_SKILLS.has(canonical)) SKILL_ALIASES.set(key(alias), canonical);
}

// 3. Explicit labels exposed by older opportunity forms (kept stable even if
//    either UI changes). Only fills gaps left by the taxonomy alias table.
const LEGACY_SKILL_ALIASES = {
  'Gardening / Horticulture': 'Horticulture', Gardening: 'Horticulture', 'Agriculture / Agritech': 'Agriculture',
  'Sustainable Food Systems': 'Food Systems', 'Robotics Programming': 'Robotics', 'SQL / Databases': 'Databases',
  Python: 'Programming', JavaScript: 'Programming', TypeScript: 'Programming', Java: 'Programming',
  'C / C++': 'Programming', C: 'Programming', 'C++': 'Programming', 'C#': 'Programming',
  Go: 'Programming', Rust: 'Programming', Swift: 'Programming', Kotlin: 'Programming', Ruby: 'Programming',
  PHP: 'Programming', Scala: 'Programming', R: 'Programming', MATLAB: 'Programming', Lua: 'Programming',
  Perl: 'Programming', Dart: 'Programming', Assembly: 'Programming', Haskell: 'Programming',
  Clojure: 'Programming', Elixir: 'Programming',
  'HTML / CSS': 'Web Development', React: 'Web Development', 'Vue.js': 'Web Development', Angular: 'Web Development',
  Svelte: 'Web Development', 'Next.js': 'Web Development', 'Tailwind CSS': 'Web Development', Bootstrap: 'Web Development',
  jQuery: 'Web Development', WebGL: 'Web Development', 'Three.js': 'Web Development', 'SASS / SCSS': 'Web Development',
  'Node.js': 'Web Development', 'Express.js': 'Web Development', Django: 'Web Development', Flask: 'Web Development',
  'Spring Boot': 'Web Development', 'Ruby on Rails': 'Web Development', 'ASP.NET': 'Web Development',
  FastAPI: 'Web Development', Nginx: 'Web Development', Apache: 'Web Development',
  GraphQL: 'APIs', 'REST APIs': 'APIs', gRPC: 'APIs',
  AWS: 'Cloud Computing', 'Google Cloud': 'Cloud Computing', Azure: 'Cloud Computing', Docker: 'Cloud Computing',
  Kubernetes: 'Cloud Computing', 'CI/CD': 'Cloud Computing', Terraform: 'Cloud Computing', 'Linux Admin': 'Cloud Computing',
  'Shell / Bash': 'Cloud Computing', Ansible: 'Cloud Computing', Jenkins: 'Cloud Computing', 'GitHub Actions': 'Cloud Computing',
  SQL: 'Databases', MongoDB: 'Databases', PostgreSQL: 'Databases', Redis: 'Databases', Elasticsearch: 'Databases',
  'Data Science': 'Data Analysis', 'Machine Learning': 'Data Analysis', 'Deep Learning': 'Data Analysis', NLP: 'Data Analysis',
  'Computer Vision': 'Data Analysis', TensorFlow: 'Data Analysis', PyTorch: 'Data Analysis', Pandas: 'Data Analysis', NumPy: 'Data Analysis',
  Tableau: 'Data Visualization', 'Power BI': 'Data Visualization',
  'React Native': 'Mobile Development', Flutter: 'Mobile Development', SwiftUI: 'Mobile Development',
  'Jetpack Compose': 'Mobile Development', 'iOS Dev': 'Mobile Development', 'Android Dev': 'Mobile Development', Xamarin: 'Mobile Development',
  'UI/UX Design': 'Graphic Design', Figma: 'Graphic Design', 'Adobe Photoshop': 'Graphic Design',
  'Adobe Illustrator': 'Graphic Design', Sketch: 'Graphic Design', InVision: 'Graphic Design', 'Motion Graphics': 'Animation',
  '3D Modeling': '3D Modeling', Blender: '3D Modeling', AutoCAD: 'CAD',
  'Technical Writing': 'Documentation', Copywriting: 'Copywriting', 'Content Strategy': 'Strategy', SEO: 'SEO',
  'Social Media': 'Strategy', 'Public Speaking': 'Public Speaking', 'Grant Writing': 'Documentation', Documentation: 'Documentation',
  'Project Management': 'Project Planning', 'Agile / Scrum': 'Project Planning', 'Product Management': 'Product Planning',
  'Marketing Strategy': 'Strategy', 'Financial Modeling': 'Financial Modeling', 'Pitch Deck': 'Pitch Decks', Sales: 'Sales',
  Negotiation: 'Mediation', 'Team Leadership': 'Strategy', 'Strategic Planning': 'Strategy',
  Physics: 'Physics', Chemistry: 'Chemistry', Biology: 'Ecology', Statistics: 'Statistics', Calculus: 'Calculus',
  'Linear Algebra': 'Linear Algebra', 'Research Methods': 'Research', 'Lab Techniques': 'Lab Methods',
  Cooking: 'Cooking', Baking: 'Baking', 'Food Safety': 'Nutrition', 'Menu Planning': 'Food Systems', 'Meal Prep': 'Nutrition',
  Catering: 'Catering', 'Nutrition Knowledge': 'Nutrition', 'Food Photography': 'Photography',
  'CAD / SolidWorks': 'CAD', '3D Printing': '3D Printing', Welding: 'Mechanics', Woodworking: 'Woodworking',
  'Electrical Wiring': 'Mechanics', Plumbing: 'Mechanics', 'CNC Machining': 'Mechanics', Robotics: 'Robotics',
  'Pilot Knowledge': 'Flight Simulation', 'Drone Operation': 'Flight Simulation', 'Aviation Safety': 'Flight Simulation',
  'Marine Navigation': 'Field Research', Sailing: 'Field Research', 'Aircraft Maintenance': 'Mechanics',
  Spanish: 'Spanish', Mandarin: 'Mandarin', French: 'French', German: 'Linguistics', Japanese: 'Japanese',
  Arabic: 'Linguistics', Portuguese: 'Linguistics', ASL: 'Linguistics', Translation: 'Translation', 'Cultural Competency': 'Cultural Analysis',
  'Personal Training': 'Fitness Training', Yoga: 'Fitness Training', 'First Aid / CPR': 'First Aid',
  'Wilderness Survival': 'Wilderness Skills', 'Rock Climbing': 'Sports Coaching', Swimming: 'Sports Coaching', Coaching: 'Sports Coaching'
};
for (const [legacy, canonical] of Object.entries(LEGACY_SKILL_ALIASES)) {
  if (CANONICAL_SKILLS.has(canonical) && !SKILL_ALIASES.has(key(legacy))) SKILL_ALIASES.set(key(legacy), canonical);
}

// 4. Broader synonym table (canonical → synonyms) as a final fallback.
for (const [canonical, synonyms] of Object.entries(skillSynonyms.synonyms || {})) {
  if (!CANONICAL_SKILLS.has(canonical)) continue;
  for (const synonym of synonyms) {
    if (!SKILL_ALIASES.has(key(synonym))) SKILL_ALIASES.set(key(synonym), canonical);
  }
}

// ── Field / industry aliases ─────────────────────────────────
// Old nonprofit "field" and company "industry" options → canonical fields.
const FIELD_ALIASES = {
  // Nonprofit form (old)
  'Education': 'Education & Learning',
  'STEM Education': 'Education & Learning',
  'Youth Development': 'Education & Learning',
  'Health / Medical': 'Medicine & Public Health',
  'Mental Health': 'Medicine & Public Health',
  'Environment / Climate': 'Environment, Agriculture & Sports',
  'Animal Welfare': 'Environment, Agriculture & Sports',
  'Disaster Relief': 'Environment, Agriculture & Sports',
  'Hunger / Food Security': 'Environment, Agriculture & Sports',
  'Technology Access': 'Technology & Software',
  'Arts / Culture': 'Arts, Design & Media',
  'Human Rights': 'Law & Public Policy',
  'Immigration / Refugees': 'Law & Public Policy',
  'Legal Aid': 'Law & Public Policy',
  'Community Development': 'Business & Entrepreneurship',
  'Poverty / Economic Development': 'Finance & Economics',
  'Housing / Homelessness': 'Finance & Economics',
  // Company form (old)
  'Technology / SaaS': 'Technology & Software',
  'Education / EdTech': 'Education & Learning',
  'Healthcare / Biotech': 'Medicine & Public Health',
  'Finance / Fintech': 'Finance & Economics',
  'Real Estate': 'Finance & Economics',
  'Media / Entertainment': 'Arts, Design & Media',
  'Manufacturing': 'Engineering & Manufacturing',
  'Transportation / Logistics': 'Engineering & Manufacturing',
  'Energy / CleanTech': 'Environment, Agriculture & Sports',
  'Legal / Compliance': 'Law & Public Policy',
  'Consulting': 'Business & Entrepreneurship',
  'E-commerce / Retail': 'Business & Entrepreneurship',
  'Marketing / Advertising': 'Business & Entrepreneurship',
  'Non-profit / Social Enterprise': 'Business & Entrepreneurship',
  'Food & Beverage': 'Business & Entrepreneurship'
};
const FIELD_LOOKUP = new Map();
// Canonical fields map to themselves...
for (const field of CANONICAL_FIELDS) FIELD_LOOKUP.set(key(field), field);
// ...then legacy labels map onto the canonical field.
for (const [label, canonical] of Object.entries(FIELD_ALIASES)) {
  if (CANONICAL_FIELDS.has(canonical)) FIELD_LOOKUP.set(key(label), canonical);
}

function normalizeSkill(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return '';
  return SKILL_ALIASES.get(key(trimmed)) || trimmed;
}

function normalizeSkills(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const normalized = normalizeSkill(value);
    if (typeof normalized !== 'string' || !normalized) continue;
    const identity = key(normalized);
    if (seen.has(identity)) continue;
    seen.add(identity);
    out.push(normalized);
  }
  return out;
}

function normalizeField(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return '';
  return FIELD_LOOKUP.get(key(trimmed)) || trimmed;
}

module.exports = {
  normalizeSkill,
  normalizeSkills,
  normalizeField,
  SKILL_ALIASES,
  FIELD_ALIASES,
  CANONICAL_SKILLS,
  CANONICAL_FIELDS
};
