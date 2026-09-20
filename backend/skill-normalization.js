/**
 * Normalize legacy opportunity skills into the current signup taxonomy.
 *
 * This module never removes an unrecognized value. Known legacy values are
 * consolidated into the closest current canonical skill, and duplicates are
 * removed after consolidation (for example C and C++ both become Programming).
 */
const taxonomy = require('./matching/taxonomy.json');
const synonymData = require('./matching/skill_synonyms.json');

const canonicalSkills = new Set(taxonomy.skills || []);
const aliases = new Map();

function key(value) {
  return String(value || '').trim().toLowerCase();
}

for (const skill of canonicalSkills) aliases.set(key(skill), skill);
for (const [canonical, synonyms] of Object.entries(synonymData.synonyms || {})) {
  if (!canonicalSkills.has(canonical)) continue;
  for (const synonym of synonyms) aliases.set(key(synonym), canonical);
}

// The old opportunity form exposed these labels. They are intentionally
// explicit so this migration remains stable if either UI changes later.
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
  if (canonicalSkills.has(canonical)) aliases.set(key(legacy), canonical);
}

function normalizeSkill(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return aliases.get(key(trimmed)) || trimmed;
}

function normalizeOpportunitySkills(skills) {
  if (!Array.isArray(skills)) return skills;
  const seen = new Set();
  return skills.map(normalizeSkill).filter(skill => {
    const identity = typeof skill === 'string' ? key(skill) : JSON.stringify(skill);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

module.exports = { normalizeSkill, normalizeOpportunitySkills, LEGACY_SKILL_ALIASES };
