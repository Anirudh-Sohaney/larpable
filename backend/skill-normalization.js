/** Map the retired opportunity-form vocabulary into signup taxonomy skills. */
const taxonomy = require('./matching/taxonomy.json');
const canonicalSkills = new Set(taxonomy.skills || []);
const key = value => String(value || '').trim().toLowerCase();

const LEGACY_SKILL_GROUPS = {
  Programming: ['Python','JavaScript','TypeScript','Java','C / C++','C','C++','C#','Go','Rust','Swift','Kotlin','Ruby','PHP','Scala','R','MATLAB','Lua','Perl','Dart','Assembly','Haskell','Clojure','Elixir'],
  'Web Development': ['HTML / CSS','React','Vue.js','Angular','Svelte','Next.js','Tailwind CSS','Bootstrap','jQuery','WebGL','Three.js','SASS / SCSS','Node.js','Express.js','Django','Flask','Spring Boot','Ruby on Rails','ASP.NET','FastAPI','Nginx','Apache'],
  APIs: ['GraphQL','REST APIs','gRPC'],
  'Cloud Computing': ['AWS','Google Cloud','Azure','Docker','Kubernetes','CI/CD','Terraform','Linux Admin','Shell / Bash','Ansible','Jenkins','GitHub Actions'],
  Databases: ['SQL','MongoDB','PostgreSQL','Redis','Elasticsearch'],
  'Data Analysis': ['Data Science','Machine Learning','Deep Learning','NLP','Computer Vision','TensorFlow','PyTorch','Pandas','NumPy'],
  'Data Visualization': ['Tableau','Power BI'],
  'Mobile Development': ['React Native','Flutter','SwiftUI','Jetpack Compose','iOS Dev','Android Dev','Xamarin'],
  'Graphic Design': ['UI/UX Design','Figma','Adobe Photoshop','Adobe Illustrator','Sketch','InVision'],
  Animation: ['Motion Graphics'],
  '3D Modeling': ['3D Modeling','Blender'],
  CAD: ['AutoCAD','CAD / SolidWorks'],
  Documentation: ['Technical Writing','Grant Writing','Documentation'],
  Copywriting: ['Copywriting'],
  Strategy: ['Content Strategy','Social Media','Marketing Strategy','Team Leadership','Strategic Planning'],
  SEO: ['SEO'],
  'Public Speaking': ['Public Speaking'],
  'Project Planning': ['Project Management','Agile / Scrum'],
  'Product Planning': ['Product Management'],
  'Financial Modeling': ['Financial Modeling'],
  'Pitch Decks': ['Pitch Deck'],
  Sales: ['Sales'],
  Mediation: ['Negotiation'],
  Physics: ['Physics'], Chemistry: ['Chemistry'], Ecology: ['Biology'], Statistics: ['Statistics'], Calculus: ['Calculus'],
  'Linear Algebra': ['Linear Algebra'], Research: ['Research Methods'], 'Lab Methods': ['Lab Techniques'],
  Cooking: ['Cooking'], Baking: ['Baking'], Nutrition: ['Food Safety','Meal Prep','Nutrition Knowledge'],
  'Food Systems': ['Menu Planning'], Catering: ['Catering'], Photography: ['Food Photography'],
  '3D Printing': ['3D Printing'], Mechanics: ['Welding','Electrical Wiring','Plumbing','CNC Machining','Aircraft Maintenance'],
  Woodworking: ['Woodworking'], Robotics: ['Robotics'], 'Flight Simulation': ['Pilot Knowledge','Drone Operation','Aviation Safety'],
  'Field Research': ['Marine Navigation','Sailing'], Spanish: ['Spanish'], Mandarin: ['Mandarin'], French: ['French'],
  Linguistics: ['German','Arabic','Portuguese','ASL'], Translation: ['Translation'], 'Cultural Analysis': ['Cultural Competency'],
  'Fitness Training': ['Personal Training','Yoga'], 'First Aid': ['First Aid / CPR'], 'Wilderness Skills': ['Wilderness Survival'],
  'Sports Coaching': ['Rock Climbing','Swimming','Coaching']
};

const LEGACY_TO_CANONICAL = new Map();
for (const skill of canonicalSkills) LEGACY_TO_CANONICAL.set(key(skill), skill);
for (const [canonical, legacySkills] of Object.entries(LEGACY_SKILL_GROUPS)) {
  if (!canonicalSkills.has(canonical)) continue;
  for (const legacy of legacySkills) LEGACY_TO_CANONICAL.set(key(legacy), canonical);
}

function normalizeOpportunitySkills(skills) {
  if (!Array.isArray(skills)) return skills;
  const seen = new Set();
  return skills.map(skill => {
    if (typeof skill !== 'string') return skill;
    return LEGACY_TO_CANONICAL.get(key(skill)) || skill;
  }).filter(skill => {
    const id = typeof skill === 'string' ? key(skill) : JSON.stringify(skill);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

module.exports = { normalizeOpportunitySkills, LEGACY_SKILL_GROUPS };
