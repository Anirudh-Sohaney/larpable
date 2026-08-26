/**
 * LARPABLE — Skill / Interest / Industry Taxonomy
 * 
 * A manually curated knowledge graph defining:
 *   1. Entity categories (skill → category, interest → category, industry)
 *   2. Pairwise similarity scores between entities (0–1)
 *   3. Cross-domain mappings (skill↔interest, skill↔industry)
 *   4. Industry-to-required-skills mappings
 * 
 * SIMILARITY TIERS:
 *   1.00  — Exact match
 *   0.95  — Nearly identical (Python ↔ Java, React ↔ Vue.js)
 *   0.90  — Very closely related (Python ↔ C#, JavaScript ↔ TypeScript)
 *   0.85  — Closely related (Python ↔ TypeScript, JavaScript ↔ HTML/CSS)
 *   0.80  — Related (Python ↔ Data Science, React ↔ Next.js)
 *   0.70  — Moderately related (Python ↔ SQL, React ↔ UI/UX Design)
 *   0.60  — Somewhat related (Python ↔ Finance, Cooking ↔ Nutrition)
 *   0.50  — Distantly related
 *   0.40  — Loosely related
 *   0.30  — Very loosely related
 *   0.20  — Barely related
 *   0.10  — Almost unrelated
 *   0.00  — Completely unrelated
 */

// ═══════════════════════════════════════════════════════════════
// 1. ENTITY → CATEGORY MAPPING
// ═══════════════════════════════════════════════════════════════

const SKILL_CATEGORIES = {
  'Programming Languages': [
    'Python', 'JavaScript', 'TypeScript', 'Java', 'C / C++', 'C#', 'Go', 'Rust',
    'Swift', 'Kotlin', 'Ruby', 'PHP', 'Scala', 'R', 'MATLAB', 'Lua', 'Perl',
    'Dart', 'Assembly', 'Haskell', 'Clojure', 'Elixir'
  ],
  'Web & Frontend': [
    'HTML / CSS', 'React', 'Vue.js', 'Angular', 'Svelte', 'Next.js',
    'Tailwind CSS', 'Bootstrap', 'jQuery', 'WebGL', 'Three.js', 'SASS / SCSS'
  ],
  'Backend & Infrastructure': [
    'Node.js', 'Express.js', 'Django', 'Flask', 'Spring Boot', 'Ruby on Rails',
    'ASP.NET', 'FastAPI', 'GraphQL', 'REST APIs', 'gRPC', 'Nginx', 'Apache'
  ],
  'DevOps & Cloud': [
    'AWS', 'Google Cloud', 'Azure', 'Docker', 'Kubernetes', 'CI/CD',
    'Terraform', 'Linux Admin', 'Shell / Bash', 'Ansible', 'Jenkins', 'GitHub Actions'
  ],
  'Data & AI': [
    'SQL', 'MongoDB', 'PostgreSQL', 'Redis', 'Elasticsearch', 'Data Science',
    'Machine Learning', 'Deep Learning', 'NLP', 'Computer Vision', 'TensorFlow',
    'PyTorch', 'Pandas', 'NumPy', 'Tableau', 'Power BI'
  ],
  'Mobile Development': [
    'React Native', 'Flutter', 'SwiftUI', 'Jetpack Compose', 'iOS Dev',
    'Android Dev', 'Xamarin'
  ],
  'Design & Creative': [
    'UI/UX Design', 'Figma', 'Adobe Photoshop', 'Adobe Illustrator', 'Sketch',
    'InVision', 'Motion Graphics', '3D Modeling', 'Blender', 'AutoCAD'
  ],
  'Writing & Communication': [
    'Technical Writing', 'Copywriting', 'Content Strategy', 'SEO',
    'Social Media', 'Public Speaking', 'Grant Writing', 'Documentation'
  ],
  'Business & Leadership': [
    'Project Management', 'Agile / Scrum', 'Product Management',
    'Marketing Strategy', 'Financial Modeling', 'Pitch Deck', 'Sales',
    'Negotiation', 'Team Leadership', 'Strategic Planning'
  ],
  'Science & Math': [
    'Physics', 'Chemistry', 'Biology', 'Statistics', 'Calculus',
    'Linear Algebra', 'Research Methods', 'Lab Techniques'
  ],
  'Culinary & Food': [
    'Cooking', 'Baking', 'Food Safety', 'Menu Planning', 'Meal Prep',
    'Catering', 'Nutrition Knowledge', 'Food Photography'
  ],
  'Mechanical & Trades': [
    'CAD / SolidWorks', '3D Printing', 'Welding', 'Woodworking',
    'Electrical Wiring', 'Plumbing', 'CNC Machining', 'Robotics'
  ],
  'Aviation & Marine': [
    'Pilot Knowledge', 'Drone Operation', 'Aviation Safety',
    'Marine Navigation', 'Sailing', 'Aircraft Maintenance'
  ],
  'Languages & Culture': [
    'Spanish', 'Mandarin', 'French', 'German', 'Japanese', 'Arabic',
    'Portuguese', 'ASL', 'Translation', 'Cultural Competency'
  ],
  'Fitness & Outdoors': [
    'Personal Training', 'Yoga', 'First Aid / CPR', 'Wilderness Survival',
    'Rock Climbing', 'Swimming', 'Coaching'
  ]
};

const INTEREST_CATEGORIES = {
  'Computer Science & Tech': [
    'Artificial Intelligence', 'Web Development', 'Mobile Apps', 'Cybersecurity',
    'Blockchain', 'Cloud Computing', 'Internet of Things', 'Game Development',
    'Computer Vision', 'Quantum Computing', 'Operating Systems', 'Distributed Systems'
  ],
  'Engineering & Design': [
    'Mechanical Engineering', 'Electrical Engineering', 'Civil Engineering',
    'Aerospace Engineering', 'Biomedical Engineering', 'Industrial Design',
    'Product Design', 'Sustainable Design'
  ],
  'Science & Research': [
    'Physics Research', 'Chemistry Research', 'Biology Research',
    'Environmental Science', 'Neuroscience', 'Genetics', 'Astrophysics',
    'Materials Science'
  ],
  'Business & Entrepreneurship': [
    'Startups', 'Venture Capital', 'Marketing', 'Finance',
    'Sales', 'Business Strategy', 'E-Commerce', 'Nonprofit Management'
  ],
  'Health & Medicine': [
    'Health Tech', 'Public Health', 'Biotech', 'Pharmacology',
    'Mental Health', 'Medical Devices', 'Nursing', 'Healthcare Policy'
  ],
  'Creative & Arts': [
    'Creative Writing', 'Graphic Design', 'Music Production',
    'Photography', 'Film / Video', 'Animation', 'Digital Art', 'Theater'
  ],
  'Culinary & Hospitality': [
    'Culinary Arts', 'Food Science', 'Restaurant Management',
    'Pastry & Baking', 'Wine & Spirits', 'Hotel Management', 'Event Planning'
  ],
  'Aviation & Transportation': [
    'Aviation / Piloting', 'Drone Technology', 'Autonomous Vehicles',
    'Marine Engineering', 'Space Exploration', 'Rail Systems'
  ],
  'Environment & Sustainability': [
    'Climate / Sustainability', 'Renewable Energy', 'Conservation Biology',
    'Environmental Policy', 'Sustainable Agriculture', 'Ocean Conservation'
  ],
  'Social Sciences & Humanities': [
    'Psychology', 'Sociology', 'Political Science', 'Anthropology',
    'Philosophy', 'Economics', 'International Relations', 'Linguistics'
  ],
  'Trades & Hands-On': [
    'Woodworking', 'Metalworking', 'Automotive', 'Electronics',
    'Robotics', '3D Printing / Fab', 'Home Improvement', 'Gardening'
  ]
};

// Build reverse lookup: entity → category
const entityCategory = {};
for (const [cat, items] of Object.entries(SKILL_CATEGORIES)) {
  for (const item of items) entityCategory[item] = { type: 'skill', category: cat };
}
for (const [cat, items] of Object.entries(INTEREST_CATEGORIES)) {
  for (const item of items) entityCategory[item] = { type: 'interest', category: cat };
}

// Industry list (matches create page dropdowns)
const INDUSTRIES = [
  'Technology / SaaS', 'Finance / Fintech', 'Healthcare / Biotech',
  'E-commerce / Retail', 'Education / EdTech', 'Media / Entertainment',
  'Manufacturing', 'Real Estate', 'Energy / CleanTech',
  'Transportation / Logistics', 'Food & Beverage', 'Legal / Compliance',
  'Marketing / Advertising', 'Consulting', 'Non-profit / Social Enterprise'
];

const NONPROFIT_FIELDS = [
  'Education', 'Health / Medical', 'Environment / Climate', 'Human Rights',
  'Poverty / Economic Development', 'Disaster Relief', 'Animal Welfare',
  'Arts / Culture', 'Community Development', 'Mental Health',
  'Hunger / Food Security', 'Housing / Homelessness', 'Technology Access',
  'Youth Development', 'Immigration / Refugees', 'Legal Aid',
  'STEM Education', 'Other'
];

for (const ind of INDUSTRIES) entityCategory[ind] = { type: 'industry', category: ind };
for (const f of NONPROFIT_FIELDS) entityCategory[f] = { type: 'industry', category: f };


// ═══════════════════════════════════════════════════════════════
// 2. EXPLICIT PAIRWISE SIMILARITY SCORES
// ═══════════════════════════════════════════════════════════════
// Format: [entityA, entityB, score]
// Only non-trivial pairs listed. Missing pairs fall back to category-based scoring.

const PAIRWISE_SIMILARITIES = [
  // ── PROGRAMMING LANGUAGES (intra-category) ──
  ['Python', 'Java', 0.90],
  ['Python', 'C / C++', 0.85],
  ['Python', 'C#', 0.85],
  ['Python', 'Go', 0.80],
  ['Python', 'Rust', 0.80],
  ['Python', 'Ruby', 0.85],
  ['Python', 'PHP', 0.75],
  ['Python', 'Scala', 0.85],
  ['Python', 'R', 0.90],
  ['Python', 'MATLAB', 0.80],
  ['Python', 'Julia', 0.85],
  ['Python', 'Lua', 0.65],
  ['Python', 'Perl', 0.70],
  ['Python', 'Dart', 0.70],
  ['Python', 'Haskell', 0.60],
  ['Python', 'Clojure', 0.60],
  ['Python', 'Elixir', 0.60],
  ['Python', 'Swift', 0.70],
  ['Python', 'Kotlin', 0.75],
  ['Python', 'JavaScript', 0.75],
  ['Python', 'React', 0.50],
  ['Python', 'TypeScript', 0.75],
  ['Python', 'Assembly', 0.40],

  ['Java', 'C / C++', 0.85],
  ['Java', 'C#', 0.90],
  ['Java', 'Kotlin', 0.90],
  ['Java', 'Scala', 0.85],
  ['Java', 'Go', 0.75],
  ['Java', 'JavaScript', 0.70],
  ['Java', 'TypeScript', 0.75],
  ['Java', 'Swift', 0.75],
  ['Java', 'Ruby', 0.70],
  ['Java', 'PHP', 0.70],

  ['JavaScript', 'TypeScript', 0.95],
  ['JavaScript', 'Dart', 0.70],
  ['JavaScript', 'PHP', 0.65],
  ['JavaScript', 'Ruby', 0.65],

  ['C / C++', 'C#', 0.85],
  ['C / C++', 'Rust', 0.80],
  ['C / C++', 'Go', 0.75],
  ['C / C++', 'Assembly', 0.60],

  ['Go', 'Rust', 0.85],
  ['Go', 'Kotlin', 0.70],

  ['Swift', 'Kotlin', 0.85],
  ['Swift', 'Dart', 0.70],
  ['Swift', 'Objective-C', 0.95],

  ['Ruby', 'PHP', 0.70],
  ['Scala', 'Clojure', 0.75],
  ['Haskell', 'Clojure', 0.75],
  ['Haskell', 'Elixir', 0.70],
  ['Clojure', 'Elixir', 0.70],
  ['R', 'MATLAB', 0.85],
  ['R', 'Scala', 0.70],

  // ── WEB & FRONTEND (intra-category) ──
  ['React', 'Vue.js', 0.90],
  ['React', 'Angular', 0.85],
  ['React', 'Svelte', 0.85],
  ['React', 'Next.js', 0.95],
  ['React', 'React Native', 0.90],
  ['Vue.js', 'Angular', 0.85],
  ['Vue.js', 'Svelte', 0.80],
  ['Angular', 'Svelte', 0.75],
  ['HTML / CSS', 'SASS / SCSS', 0.95],
  ['HTML / CSS', 'Tailwind CSS', 0.90],
  ['HTML / CSS', 'Bootstrap', 0.90],
  ['HTML / CSS', 'jQuery', 0.75],
  ['Tailwind CSS', 'Bootstrap', 0.85],
  ['WebGL', 'Three.js', 0.90],
  ['WebGL', 'React', 0.60],

  // ── MISSING FRAMEWORK ↔ LANGUAGE PAIRS ──
  ['Vue.js', 'JavaScript', 0.90],
  ['Angular', 'JavaScript', 0.85],
  ['Svelte', 'JavaScript', 0.85],
  ['Next.js', 'JavaScript', 0.85],
  ['Next.js', 'TypeScript', 0.85],
  ['Spring Boot', 'Java', 0.90],
  ['ASP.NET', 'C#', 0.90],
  ['Ruby on Rails', 'Ruby', 0.90],
  ['Express.js', 'JavaScript', 0.90],
  ['Django', 'Python', 0.90],
  ['Flask', 'Python', 0.90],
  ['FastAPI', 'Python', 0.90],

  // ── BACKEND ↔ FRONTEND (web dev ecosystem) ──
  ['Node.js', 'React', 0.70],
  ['Node.js', 'Vue.js', 0.70],
  ['Node.js', 'Angular', 0.65],
  ['Node.js', 'HTML / CSS', 0.65],
  ['Django', 'React', 0.60],
  ['Django', 'HTML / CSS', 0.60],
  ['Flask', 'React', 0.60],
  ['Flask', 'HTML / CSS', 0.60],
  ['Express.js', 'React', 0.65],
  ['Express.js', 'HTML / CSS', 0.60],
  ['FastAPI', 'React', 0.55],
  ['FastAPI', 'HTML / CSS', 0.55],
  ['Spring Boot', 'React', 0.55],
  ['Spring Boot', 'HTML / CSS', 0.55],
  ['ASP.NET', 'React', 0.55],
  ['ASP.NET', 'HTML / CSS', 0.55],
  ['Ruby on Rails', 'React', 0.55],
  ['Ruby on Rails', 'HTML / CSS', 0.60],

  // ── BACKEND & INFRASTRUCTURE (intra-category) ──
  ['Node.js', 'Express.js', 0.95],
  ['Node.js', 'Django', 0.75],
  ['Node.js', 'Flask', 0.75],
  ['Node.js', 'FastAPI', 0.75],
  ['Node.js', 'Ruby on Rails', 0.75],
  ['Django', 'Flask', 0.90],
  ['Django', 'FastAPI', 0.85],
  ['Django', 'Spring Boot', 0.75],
  ['Flask', 'FastAPI', 0.90],
  ['Spring Boot', 'ASP.NET', 0.80],
  ['Ruby on Rails', 'Django', 0.75],
  ['GraphQL', 'REST APIs', 0.80],
  ['GraphQL', 'gRPC', 0.70],
  ['REST APIs', 'gRPC', 0.70],
  ['Nginx', 'Apache', 0.90],

  // ── DEVOPS & CLOUD (intra-category) ──
  ['AWS', 'Google Cloud', 0.90],
  ['AWS', 'Azure', 0.90],
  ['Google Cloud', 'Azure', 0.90],
  ['Docker', 'Kubernetes', 0.85],
  ['Docker', 'CI/CD', 0.70],
  ['Kubernetes', 'Terraform', 0.65],
  ['CI/CD', 'GitHub Actions', 0.90],
  ['CI/CD', 'Jenkins', 0.90],
  ['GitHub Actions', 'Jenkins', 0.85],
  ['Terraform', 'Ansible', 0.75],
  ['Linux Admin', 'Shell / Bash', 0.90],
  ['Shell / Bash', 'Ansible', 0.65],

  // ── DATA & AI (intra-category) ──
  ['SQL', 'PostgreSQL', 0.95],
  ['SQL', 'MongoDB', 0.70],
  ['SQL', 'Redis', 0.60],
  ['SQL', 'Elasticsearch', 0.60],
  ['MongoDB', 'Redis', 0.65],
  ['MongoDB', 'PostgreSQL', 0.65],
  ['Data Science', 'Machine Learning', 0.90],
  ['Data Science', 'Pandas', 0.85],
  ['Data Science', 'NumPy', 0.80],
  ['Data Science', 'Tableau', 0.70],
  ['Data Science', 'Power BI', 0.70],
  ['Machine Learning', 'Deep Learning', 0.90],
  ['Machine Learning', 'NLP', 0.80],
  ['Machine Learning', 'Computer Vision', 0.80],
  ['Machine Learning', 'TensorFlow', 0.85],
  ['Machine Learning', 'PyTorch', 0.85],
  ['Deep Learning', 'NLP', 0.80],
  ['Deep Learning', 'Computer Vision', 0.85],
  ['Deep Learning', 'TensorFlow', 0.90],
  ['Deep Learning', 'PyTorch', 0.90],
  ['TensorFlow', 'PyTorch', 0.90],
  ['Pandas', 'NumPy', 0.90],
  ['Tableau', 'Power BI', 0.90],
  ['NLP', 'Computer Vision', 0.70],

  // ── MOBILE DEVELOPMENT (intra-category) ──
  ['React Native', 'Flutter', 0.85],
  ['React Native', 'Xamarin', 0.75],
  ['Flutter', 'Dart', 0.95],
  ['SwiftUI', 'iOS Dev', 0.95],
  ['Jetpack Compose', 'Android Dev', 0.95],
  ['SwiftUI', 'Jetpack Compose', 0.75],
  ['iOS Dev', 'Android Dev', 0.70],
  ['Xamarin', 'React Native', 0.75],

  // ── DESIGN & CREATIVE (intra-category) ──
  ['Figma', 'Sketch', 0.90],
  ['Figma', 'InVision', 0.85],
  ['Figma', 'Adobe XD', 0.90],
  ['Sketch', 'InVision', 0.80],
  ['Adobe Photoshop', 'Adobe Illustrator', 0.85],
  ['Adobe Photoshop', 'Figma', 0.65],
  ['3D Modeling', 'Blender', 0.95],
  ['3D Modeling', 'AutoCAD', 0.80],
  ['Blender', 'AutoCAD', 0.70],
  ['UI/UX Design', 'Figma', 0.85],
  ['UI/UX Design', 'Sketch', 0.80],
  ['UI/UX Design', 'Adobe Photoshop', 0.60],
  ['Motion Graphics', 'Adobe After Effects', 0.95],

  // ── PROGRAMMING ↔ UI/UX (frontend dev connection) ──
  ['JavaScript', 'UI/UX Design', 0.55],
  ['TypeScript', 'UI/UX Design', 0.50],
  ['React', 'UI/UX Design', 0.55],
  ['Vue.js', 'UI/UX Design', 0.50],
  ['Angular', 'UI/UX Design', 0.50],
  ['Svelte', 'UI/UX Design', 0.50],
  ['Next.js', 'UI/UX Design', 0.50],
  ['Node.js', 'UI/UX Design', 0.40],
  ['Python', 'UI/UX Design', 0.30],

  // ── WRITING & COMMUNICATION (intra-category) ──
  ['Technical Writing', 'Documentation', 0.95],
  ['Copywriting', 'Content Strategy', 0.80],
  ['Copywriting', 'SEO', 0.75],
  ['Content Strategy', 'SEO', 0.80],
  ['Content Strategy', 'Social Media', 0.75],
  ['SEO', 'Social Media', 0.65],
  ['Public Speaking', 'Grant Writing', 0.50],
  ['Grant Writing', 'Technical Writing', 0.60],

  // ── BUSINESS & LEADERSHIP (intra-category) ──
  ['Project Management', 'Agile / Scrum', 0.90],
  ['Project Management', 'Product Management', 0.80],
  ['Product Management', 'Strategic Planning', 0.75],
  ['Marketing Strategy', 'Sales', 0.75],
  ['Marketing Strategy', 'Pitch Deck', 0.70],
  ['Financial Modeling', 'Pitch Deck', 0.70],
  ['Team Leadership', 'Project Management', 0.75],
  ['Team Leadership', 'Negotiation', 0.65],
  ['Sales', 'Negotiation', 0.80],

  // ── SCIENCE & MATH (intra-category) ──
  ['Physics', 'Chemistry', 0.75],
  ['Physics', 'Calculus', 0.70],
  ['Physics', 'Linear Algebra', 0.65],
  ['Chemistry', 'Biology', 0.75],
  ['Biology', 'Lab Techniques', 0.85],
  ['Statistics', 'Calculus', 0.75],
  ['Statistics', 'Linear Algebra', 0.70],
  ['Statistics', 'Data Science', 0.85],
  ['Calculus', 'Linear Algebra', 0.80],
  ['Research Methods', 'Lab Techniques', 0.75],

  // ── CULINARY & FOOD (intra-category) ──
  ['Cooking', 'Baking', 0.85],
  ['Cooking', 'Meal Prep', 0.80],
  ['Cooking', 'Catering', 0.80],
  ['Cooking', 'Menu Planning', 0.80],
  ['Baking', 'Pastry & Baking', 0.95],
  ['Food Safety', 'Nutrition Knowledge', 0.70],
  ['Menu Planning', 'Catering', 0.80],
  ['Meal Prep', 'Nutrition Knowledge', 0.75],
  ['Cooking', 'Food Photography', 0.50],

  // ── MECHANICAL & TRADES (intra-category) ──
  ['CAD / SolidWorks', 'AutoCAD', 0.90],
  ['CAD / SolidWorks', '3D Printing', 0.80],
  ['3D Printing', 'CNC Machining', 0.75],
  ['Welding', 'Woodworking', 0.60],
  ['Electrical Wiring', 'Plumbing', 0.55],
  ['Robotics', 'Arduino', 0.85],
  ['Robotics', 'CNC Machining', 0.65],

  // ── AVIATION & MARINE (intra-category) ──
  ['Pilot Knowledge', 'Aviation Safety', 0.90],
  ['Drone Operation', 'Drone Technology', 0.95],
  ['Drone Operation', 'Pilot Knowledge', 0.70],
  ['Marine Navigation', 'Sailing', 0.85],
  ['Aircraft Maintenance', 'Aviation Safety', 0.75],

  // ── LANGUAGES & CULTURE (intra-category) ──
  ['Translation', 'Cultural Competency', 0.75],
  ['ASL', 'Translation', 0.60],
  ['Spanish', 'Portuguese', 0.80],
  ['Spanish', 'French', 0.70],
  ['French', 'German', 0.60],
  ['Mandarin', 'Japanese', 0.50],
  ['Mandarin', 'Cultural Competency', 0.60],

  // ── FITNESS & OUTDOORS (intra-category) ──
  ['Personal Training', 'Coaching', 0.80],
  ['Personal Training', 'Yoga', 0.65],
  ['Yoga', 'Swimming', 0.55],
  ['First Aid / CPR', 'Wilderness Survival', 0.75],
  ['Rock Climbing', 'Wilderness Survival', 0.70],
  ['Coaching', 'Yoga', 0.55],

  // ═══════════════════════════════════════════════════════════════
  // CROSS-CATEGORY: SKILL ↔ SKILL (different categories)
  // ═══════════════════════════════════════════════════════════════

  // Programming ↔ Web/Frontend
  ['JavaScript', 'React', 0.85],
  ['JavaScript', 'Node.js', 0.90],
  ['JavaScript', 'Express.js', 0.85],
  ['TypeScript', 'React', 0.85],
  ['TypeScript', 'Angular', 0.85],
  ['TypeScript', 'Next.js', 0.85],
  ['Dart', 'Flutter', 0.95],
  ['Dart', 'React Native', 0.65],
  ['Swift', 'SwiftUI', 0.95],
  ['Swift', 'iOS Dev', 0.90],
  ['Kotlin', 'Android Dev', 0.90],
  ['Kotlin', 'Jetpack Compose', 0.85],
  ['Ruby', 'Ruby on Rails', 0.90],
  ['Python', 'Django', 0.85],
  ['Python', 'Flask', 0.85],
  ['Python', 'FastAPI', 0.85],
  ['Python', 'Data Science', 0.80],
  ['Python', 'Machine Learning', 0.85],
  ['Python', 'Pandas', 0.85],
  ['Python', 'NumPy', 0.80],
  ['Python', 'TensorFlow', 0.75],
  ['Python', 'PyTorch', 0.75],
  ['R', 'Data Science', 0.80],
  ['R', 'Statistics', 0.80],
  ['R', 'Tableau', 0.60],

  // Programming ↔ DevOps
  ['Shell / Bash', 'Linux Admin', 0.85],
  ['Shell / Bash', 'Docker', 0.60],
  ['Go', 'Docker', 0.70],
  ['Go', 'Kubernetes', 0.70],

  // Programming ↔ Data & AI
  ['Python', 'NLP', 0.75],
  ['Python', 'Computer Vision', 0.75],
  ['Python', 'Deep Learning', 0.75],
  ['Java', 'Machine Learning', 0.55],
  ['Scala', 'Machine Learning', 0.65],
  ['SQL', 'Data Science', 0.75],

  // Web/Frontend ↔ Design
  ['React', 'UI/UX Design', 0.60],
  ['HTML / CSS', 'UI/UX Design', 0.65],
  ['Figma', 'HTML / CSS', 0.55],
  ['UI/UX Design', 'Tailwind CSS', 0.65],
  ['UI/UX Design', 'React', 0.55],

  // Backend ↔ DevOps
  ['Node.js', 'Docker', 0.60],
  ['Django', 'AWS', 0.55],
  ['AWS', 'Docker', 0.70],
  ['AWS', 'Kubernetes', 0.70],
  ['Google Cloud', 'Docker', 0.65],
  ['Azure', 'Docker', 0.65],

  // Data ↔ Backend
  ['SQL', 'PostgreSQL', 0.90],
  ['SQL', 'Django', 0.65],
  ['SQL', 'Flask', 0.65],
  ['MongoDB', 'Node.js', 0.70],
  ['Redis', 'Node.js', 0.60],
  ['Elasticsearch', 'Node.js', 0.55],

  // Design ↔ Mobile
  ['Figma', 'React Native', 0.55],
  ['UI/UX Design', 'Flutter', 0.55],
  ['UI/UX Design', 'SwiftUI', 0.55],

  // Writing ↔ Business
  ['Technical Writing', 'Documentation', 0.95],
  ['Content Strategy', 'Marketing Strategy', 0.70],
  ['SEO', 'Marketing Strategy', 0.75],
  ['Copywriting', 'Marketing Strategy', 0.70],

  // Science ↔ Programming
  ['Statistics', 'Machine Learning', 0.80],
  ['Statistics', 'Data Science', 0.85],
  ['Physics', 'Python', 0.55],
  ['Physics', 'MATLAB', 0.65],
  ['Chemistry', 'Lab Techniques', 0.85],
  ['Biology', 'Lab Techniques', 0.85],
  ['Linear Algebra', 'Machine Learning', 0.70],
  ['Calculus', 'Machine Learning', 0.65],

  // Science ↔ Data
  ['Physics', 'Data Science', 0.55],
  ['Biology', 'Data Science', 0.50],
  ['Chemistry', 'Data Science', 0.45],

  // Mechanical ↔ Design
  ['CAD / SolidWorks', '3D Modeling', 0.80],
  ['CAD / SolidWorks', 'Blender', 0.65],
  ['AutoCAD', '3D Modeling', 0.75],
  ['AutoCAD', 'Blender', 0.60],
  ['3D Printing', '3D Modeling', 0.75],
  ['3D Printing', 'Blender', 0.65],
  ['Robotics', 'Arduino', 0.85],

  // Trades ↔ Engineering
  ['Electrical Wiring', 'Electrical Engineering', 0.65],
  ['CAD / SolidWorks', 'Mechanical Engineering', 0.75],
  ['Welding', 'Mechanical Engineering', 0.55],

  // Aviation ↔ Engineering
  ['Pilot Knowledge', 'Aerospace Engineering', 0.70],
  ['Aircraft Maintenance', 'Aerospace Engineering', 0.65],
  ['Drone Operation', 'Drone Technology', 0.90],

  // Languages ↔ Culture
  ['Translation', 'Spanish', 0.55],
  ['Translation', 'Mandarin', 0.55],
  ['Translation', 'French', 0.55],
  ['Cultural Competency', 'Spanish', 0.50],

  // Fitness ↔ Science
  ['Personal Training', 'Biology', 0.45],
  ['Nutrition Knowledge', 'Biology', 0.55],
  ['Nutrition Knowledge', 'Chemistry', 0.50],

  // Writing ↔ Tech
  ['Technical Writing', 'Documentation', 0.95],
  ['Documentation', 'React', 0.40],

  // Business ↔ Tech
  ['Project Management', 'Agile / Scrum', 0.85],
  ['Product Management', 'UI/UX Design', 0.65],
  ['Financial Modeling', 'Python', 0.50],
  ['Marketing Strategy', 'SEO', 0.75],
  ['Sales', 'Social Media', 0.55],

  // Culinary ↔ Science
  ['Food Science', 'Cooking', 0.75],
  ['Food Science', 'Baking', 0.70],
  ['Nutrition Knowledge', 'Food Safety', 0.70],

  // Environment ↔ Science
  ['Environmental Science', 'Biology', 0.65],
  ['Environmental Science', 'Chemistry', 0.60],
  ['Renewable Energy', 'Physics', 0.55],

  // Health ↔ Science
  ['Biotech', 'Biology', 0.80],
  ['Biotech', 'Chemistry', 0.75],
  ['Pharmacology', 'Chemistry', 0.70],
  ['Pharmacology', 'Biology', 0.70],
  ['Medical Devices', 'Biomedical Engineering', 0.75],
  ['Health Tech', 'Biomedical Engineering', 0.70],

  // Finance ↔ Programming
  ['Financial Modeling', 'Python', 0.55],
  ['Financial Modeling', 'Excel', 0.75],
  ['Venture Capital', 'Financial Modeling', 0.70],
  ['Venture Capital', 'Pitch Deck', 0.75],
  ['Startups', 'Pitch Deck', 0.80],
  ['Startups', 'Business Strategy', 0.85],
  ['Startups', 'Marketing', 0.65],

  // Blockchain ↔ Programming
  ['Blockchain', 'Python', 0.55],
  ['Blockchain', 'JavaScript', 0.60],
  ['Blockchain', 'C / C++', 0.55],
  ['Blockchain', 'Go', 0.55],
  ['Blockchain', 'Cryptography', 0.70],

  // Game Dev ↔ Programming & Design
  ['Game Development', 'Unity', 0.90],
  ['Game Development', 'Unreal Engine', 0.90],
  ['Game Development', 'C#', 0.70],
  ['Game Development', 'C / C++', 0.75],
  ['Game Development', '3D Modeling', 0.70],
  ['Game Development', 'Blender', 0.65],
  ['Game Development', 'JavaScript', 0.50],

  // IoT ↔ Engineering
  ['Internet of Things', 'Arduino', 0.80],
  ['Internet of Things', 'Electronics', 0.70],
  ['Internet of Things', 'Raspberry Pi', 0.85],

  // Cybersecurity ↔ DevOps
  ['Cybersecurity', 'Linux Admin', 0.65],
  ['Cybersecurity', 'AWS', 0.55],
  ['Cybersecurity', 'Networking', 0.80],

  // Aerospace ↔ Aviation
  ['Aerospace Engineering', 'Aviation / Piloting', 0.65],
  ['Aerospace Engineering', 'Aircraft Maintenance', 0.70],
  ['Space Exploration', 'Aerospace Engineering', 0.80],
  ['Space Exploration', 'Physics', 0.60],

  // Creative ↔ Design
  ['Graphic Design', 'UI/UX Design', 0.75],
  ['Graphic Design', 'Adobe Photoshop', 0.85],
  ['Graphic Design', 'Adobe Illustrator', 0.85],
  ['Photography', 'Adobe Photoshop', 0.65],
  ['Photography', 'Food Photography', 0.75],
  ['Film / Video', 'Motion Graphics', 0.70],
  ['Animation', '3D Modeling', 0.70],
  ['Animation', 'Blender', 0.75],
  ['Music Production', 'Audio Engineering', 0.85],
  ['Digital Art', 'Adobe Photoshop', 0.75],
  ['Digital Art', 'Adobe Illustrator', 0.70],
  ['Creative Writing', 'Copywriting', 0.65],
  ['Creative Writing', 'Technical Writing', 0.50],
  ['Theater', 'Public Speaking', 0.65],

  // Social Sciences ↔ Business
  ['Psychology', 'Mental Health', 0.75],
  ['Psychology', 'User Research', 0.65],
  ['Economics', 'Financial Modeling', 0.70],
  ['Economics', 'Finance', 0.75],
  ['International Relations', 'Cultural Competency', 0.60],
  ['Political Science', 'Economics', 0.55],
  ['Linguistics', 'Translation', 0.75],
  ['Linguistics', 'NLP', 0.65],
  ['Anthropology', 'Cultural Competency', 0.70],
  ['Sociology', 'Community Development', 0.65],

  // Trades ↔ IoT / Electronics
  ['Electronics', 'Arduino', 0.75],
  ['Electronics', 'Raspberry Pi', 0.70],
  ['Electronics', 'Robotics', 0.75],
  ['Electronics', 'Electrical Wiring', 0.70],
  ['Home Improvement', 'Woodworking', 0.70],
  ['Home Improvement', 'Electrical Wiring', 0.65],
  ['Home Improvement', 'Plumbing', 0.65],
  ['Gardening', 'Sustainable Agriculture', 0.65],
  ['Gardening', 'Conservation Biology', 0.50],
  ['Automotive', 'Mechanical Engineering', 0.60],
  ['Automotive', 'Electrical Wiring', 0.55],

  // Music / Film
  ['Music Production', 'Audio Engineering', 0.85],

  // Agriculture / Environment
  ['Sustainable Agriculture', 'Environmental Science', 0.70],
  ['Sustainable Agriculture', 'Food Science', 0.60],
  ['Conservation Biology', 'Environmental Science', 0.85],
  ['Ocean Conservation', 'Marine Engineering', 0.60],
  ['Ocean Conservation', 'Biology', 0.55],
  ['Climate / Sustainability', 'Renewable Energy', 0.75],
  ['Climate / Sustainability', 'Environmental Policy', 0.80],
  ['Environmental Policy', 'Environmental Science', 0.80],

  // Hotel / Event
  ['Hotel Management', 'Restaurant Management', 0.75],
  ['Event Planning', 'Catering', 0.70],
  ['Event Planning', 'Menu Planning', 0.55],

  // Wine
  ['Wine & Spirits', 'Culinary Arts', 0.60],
  ['Wine & Spirits', 'Restaurant Management', 0.55],

  // Pastry
  ['Pastry & Baking', 'Baking', 0.95],
  ['Pastry & Baking', 'Cooking', 0.75],
  ['Pastry & Baking', 'Food Science', 0.60],

  // Medical
  ['Nursing', 'Healthcare Policy', 0.55],
  ['Nursing', 'Public Health', 0.65],
  ['Healthcare Policy', 'Public Health', 0.80],
  ['Biotech', 'Genetics', 0.80],
  ['Genetics', 'Biology', 0.85],
  ['Neuroscience', 'Psychology', 0.70],
  ['Neuroscience', 'Biology', 0.65],

  // Finance / Business (interest ↔ skill)
  ['Finance', 'Financial Modeling', 0.85],
  ['Venture Capital', 'Financial Modeling', 0.70],
  ['Venture Capital', 'Pitch Deck', 0.75],
  ['E-Commerce', 'Marketing', 0.65],
  ['E-Commerce', 'Web Development', 0.60],
  ['Nonprofit Management', 'Grant Writing', 0.70],
  ['Nonprofit Management', 'Team Leadership', 0.60],
  ['Business Strategy', 'Strategic Planning', 0.90],
  ['Sales', 'Sales', 1.00],
  ['Marketing', 'Marketing Strategy', 0.90],
  ['Startups', 'Business Strategy', 0.85],
  ['Startups', 'Pitch Deck', 0.80],

  // CS & Tech (interest ↔ skill)
  ['Artificial Intelligence', 'Machine Learning', 0.90],
  ['Artificial Intelligence', 'Deep Learning', 0.85],
  ['Artificial Intelligence', 'NLP', 0.80],
  ['Web Development', 'React', 0.85],
  ['Web Development', 'JavaScript', 0.90],
  ['Web Development', 'HTML / CSS', 0.85],
  ['Web Development', 'Node.js', 0.75],
  ['Mobile Apps', 'React Native', 0.85],
  ['Mobile Apps', 'Flutter', 0.85],
  ['Mobile Apps', 'Swift', 0.75],
  ['Mobile Apps', 'Kotlin', 0.75],
  ['Cybersecurity', 'Linux Admin', 0.65],
  ['Blockchain', 'JavaScript', 0.60],
  ['Blockchain', 'Python', 0.55],
  ['Cloud Computing', 'AWS', 0.85],
  ['Cloud Computing', 'Docker', 0.75],
  ['Cloud Computing', 'Kubernetes', 0.75],
  ['Internet of Things', 'Arduino', 0.80],
  ['Game Development', 'Unity', 0.90],
  ['Game Development', 'C#', 0.70],
  ['Computer Vision', 'Computer Vision', 1.00],
  ['Quantum Computing', 'Physics', 0.65],
  ['Quantum Computing', 'Linear Algebra', 0.60],
  ['Operating Systems', 'Linux Admin', 0.75],
  ['Operating Systems', 'C / C++', 0.60],
  ['Distributed Systems', 'AWS', 0.65],
  ['Distributed Systems', 'Kubernetes', 0.70],

  // Engineering (interest ↔ skill)
  ['Mechanical Engineering', 'CAD / SolidWorks', 0.80],
  ['Mechanical Engineering', 'MATLAB', 0.65],
  ['Mechanical Engineering', 'Physics', 0.70],
  ['Electrical Engineering', 'Electronics', 0.85],
  ['Electrical Engineering', 'Arduino', 0.70],
  ['Electrical Engineering', 'C / C++', 0.55],
  ['Civil Engineering', 'AutoCAD', 0.75],
  ['Aerospace Engineering', 'Physics', 0.70],
  ['Aerospace Engineering', 'CAD / SolidWorks', 0.65],
  ['Biomedical Engineering', 'Biology', 0.70],
  ['Biomedical Engineering', 'Chemistry', 0.65],
  ['Industrial Design', 'UI/UX Design', 0.65],
  ['Industrial Design', 'Figma', 0.60],
  ['Industrial Design', 'CAD / SolidWorks', 0.75],
  ['Product Design', 'UI/UX Design', 0.80],
  ['Product Design', 'Figma', 0.75],
  ['Sustainable Design', 'Renewable Energy', 0.60],
  ['Sustainable Design', 'Environmental Science', 0.55],

  // Science & Research (interest ↔ skill)
  ['Physics Research', 'Physics', 0.95],
  ['Physics Research', 'Research Methods', 0.80],
  ['Chemistry Research', 'Chemistry', 0.95],
  ['Chemistry Research', 'Lab Techniques', 0.85],
  ['Biology Research', 'Biology', 0.95],
  ['Biology Research', 'Lab Techniques', 0.85],
  ['Environmental Science', 'Biology', 0.65],
  ['Environmental Science', 'Chemistry', 0.60],
  ['Neuroscience', 'Biology', 0.65],
  ['Neuroscience', 'Python', 0.50],
  ['Genetics', 'Biology', 0.85],
  ['Genetics', 'Chemistry', 0.60],
  ['Astrophysics', 'Physics', 0.85],
  ['Astrophysics', 'Python', 0.55],
  ['Materials Science', 'Chemistry', 0.70],
  ['Materials Science', 'Physics', 0.60],

  // Health & Medicine (interest ↔ skill)
  ['Health Tech', 'Python', 0.55],
  ['Health Tech', 'Machine Learning', 0.60],
  ['Public Health', 'Research Methods', 0.65],
  ['Biotech', 'Biology', 0.80],
  ['Biotech', 'Chemistry', 0.75],
  ['Pharmacology', 'Chemistry', 0.70],
  ['Mental Health', 'Psychology', 0.80],
  ['Medical Devices', 'CAD / SolidWorks', 0.60],
  ['Medical Devices', 'Electronics', 0.55],
  ['Healthcare Policy', 'Research Methods', 0.55],

  // Creative (interest ↔ skill)
  ['Creative Writing', 'Copywriting', 0.65],
  ['Creative Writing', 'Technical Writing', 0.50],
  ['Graphic Design', 'Adobe Photoshop', 0.85],
  ['Graphic Design', 'Adobe Illustrator', 0.85],
  ['Graphic Design', 'Figma', 0.75],
  ['Music Production', 'Audio Engineering', 0.85],
  ['Photography', 'Adobe Photoshop', 0.65],
  ['Photography', 'Food Photography', 0.75],
  ['Film / Video', 'Motion Graphics', 0.70],
  ['Film / Video', 'Adobe Premiere', 0.85],
  ['Animation', 'Blender', 0.75],
  ['Animation', '3D Modeling', 0.70],
  ['Digital Art', 'Adobe Photoshop', 0.75],
  ['Digital Art', 'Adobe Illustrator', 0.70],
  ['Theater', 'Public Speaking', 0.65],

  // Culinary (interest ↔ skill)
  ['Culinary Arts', 'Cooking', 0.90],
  ['Culinary Arts', 'Baking', 0.75],
  ['Food Science', 'Cooking', 0.70],
  ['Food Science', 'Food Safety', 0.75],
  ['Restaurant Management', 'Menu Planning', 0.70],
  ['Restaurant Management', 'Catering', 0.65],
  ['Pastry & Baking', 'Baking', 0.95],
  ['Wine & Spirits', 'Culinary Arts', 0.60],
  ['Hotel Management', 'Restaurant Management', 0.75],
  ['Event Planning', 'Catering', 0.70],

  // Aviation (interest ↔ skill)
  ['Aviation / Piloting', 'Pilot Knowledge', 0.95],
  ['Aviation / Piloting', 'Aviation Safety', 0.85],
  ['Drone Technology', 'Drone Operation', 0.90],
  ['Autonomous Vehicles', 'Robotics', 0.70],
  ['Autonomous Vehicles', 'Machine Learning', 0.65],
  ['Marine Engineering', 'Marine Navigation', 0.70],
  ['Marine Engineering', 'Mechanical Engineering', 0.60],
  ['Space Exploration', 'Aerospace Engineering', 0.80],
  ['Space Exploration', 'Physics', 0.60],
  ['Rail Systems', 'Mechanical Engineering', 0.50],

  // Environment (interest ↔ skill)
  ['Climate / Sustainability', 'Renewable Energy', 0.75],
  ['Climate / Sustainability', 'Environmental Science', 0.70],
  ['Renewable Energy', 'Physics', 0.55],
  ['Renewable Energy', 'Electrical Engineering', 0.60],
  ['Conservation Biology', 'Biology', 0.80],
  ['Conservation Biology', 'Environmental Science', 0.80],
  ['Environmental Policy', 'Environmental Science', 0.80],
  ['Sustainable Agriculture', 'Biology', 0.55],
  ['Sustainable Agriculture', 'Environmental Science', 0.65],
  ['Ocean Conservation', 'Biology', 0.55],
  ['Ocean Conservation', 'Marine Navigation', 0.50],

  // Social Sciences (interest ↔ skill)
  ['Psychology', 'Research Methods', 0.70],
  ['Psychology', 'Statistics', 0.60],
  ['Sociology', 'Research Methods', 0.65],
  ['Political Science', 'Research Methods', 0.60],
  ['Anthropology', 'Research Methods', 0.65],
  ['Philosophy', 'Logic', 0.60],
  ['Economics', 'Financial Modeling', 0.70],
  ['Economics', 'Statistics', 0.65],
  ['International Relations', 'Cultural Competency', 0.60],
  ['Linguistics', 'NLP', 0.65],
  ['Linguistics', 'Translation', 0.75],

  // Trades (interest ↔ skill)
  ['Woodworking', 'Woodworking', 1.00],
  ['Metalworking', 'Welding', 0.80],
  ['Metalworking', 'CNC Machining', 0.70],
  ['Automotive', 'Mechanical Engineering', 0.60],
  ['Automotive', 'Electrical Wiring', 0.55],
  ['Electronics', 'Arduino', 0.75],
  ['Electronics', 'Raspberry Pi', 0.70],
  ['Electronics', 'Robotics', 0.75],
  ['Robotics', 'Arduino', 0.85],
  ['Robotics', 'Raspberry Pi', 0.80],
  ['3D Printing / Fab', '3D Printing', 0.95],
  ['3D Printing / Fab', '3D Modeling', 0.75],
  ['Home Improvement', 'Woodworking', 0.70],
  ['Home Improvement', 'Electrical Wiring', 0.65],
  ['Home Improvement', 'Plumbing', 0.65],
  ['Gardening', 'Sustainable Agriculture', 0.65],
  ['Gardening', 'Conservation Biology', 0.50],

  // ═══════════════════════════════════════════════════════════════
  // INDUSTRY ↔ SKILL MAPPINGS (how relevant each skill is to each industry)
  // ═══════════════════════════════════════════════════════════════

  // Technology / SaaS
  ['Technology / SaaS', 'Python', 0.85],
  ['Technology / SaaS', 'JavaScript', 0.90],
  ['Technology / SaaS', 'TypeScript', 0.85],
  ['Technology / SaaS', 'React', 0.85],
  ['Technology / SaaS', 'Node.js', 0.80],
  ['Technology / SaaS', 'AWS', 0.80],
  ['Technology / SaaS', 'Docker', 0.75],
  ['Technology / SaaS', 'SQL', 0.80],
  ['Technology / SaaS', 'Machine Learning', 0.70],
  ['Technology / SaaS', 'UI/UX Design', 0.75],
  ['Technology / SaaS', 'Product Management', 0.75],
  ['Technology / SaaS', 'Agile / Scrum', 0.80],
  ['Technology / SaaS', 'Java', 0.80],
  ['Technology / SaaS', 'Go', 0.75],
  ['Technology / SaaS', 'Kubernetes', 0.75],
  ['Technology / SaaS', 'CI/CD', 0.75],
  ['Technology / SaaS', 'Git', 0.80],
  ['Technology / SaaS', 'HTML / CSS', 0.80],

  // Finance / Fintech
  ['Finance / Fintech', 'Python', 0.80],
  ['Finance / Fintech', 'SQL', 0.80],
  ['Finance / Fintech', 'Financial Modeling', 0.95],
  ['Finance / Fintech', 'Data Science', 0.75],
  ['Finance / Fintech', 'Machine Learning', 0.70],
  ['Finance / Fintech', 'R', 0.70],
  ['Finance / Fintech', 'Tableau', 0.65],
  ['Finance / Fintech', 'Power BI', 0.65],
  ['Finance / Fintech', 'Statistics', 0.75],
  ['Finance / Fintech', 'Excel', 0.85],
  ['Finance / Fintech', 'Strategic Planning', 0.70],
  ['Finance / Fintech', 'JavaScript', 0.60],
  ['Finance / Fintech', 'Risk Management', 0.80],

  // Healthcare / Biotech
  ['Healthcare / Biotech', 'Biology', 0.85],
  ['Healthcare / Biotech', 'Chemistry', 0.80],
  ['Healthcare / Biotech', 'Lab Techniques', 0.80],
  ['Healthcare / Biotech', 'Python', 0.65],
  ['Healthcare / Biotech', 'Machine Learning', 0.70],
  ['Healthcare / Biotech', 'Data Science', 0.70],
  ['Healthcare / Biotech', 'SQL', 0.65],
  ['Healthcare / Biotech', 'Research Methods', 0.80],
  ['Healthcare / Biotech', 'Statistics', 0.70],
  ['Healthcare / Biotech', 'Genetics', 0.75],
  ['Healthcare / Biotech', 'CAD / SolidWorks', 0.55],
  ['Healthcare / Biotech', 'Project Management', 0.65],
  ['Healthcare / Biotech', 'Technical Writing', 0.60],

  // E-commerce / Retail
  ['E-commerce / Retail', 'JavaScript', 0.75],
  ['E-commerce / Retail', 'React', 0.70],
  ['E-commerce / Retail', 'SQL', 0.75],
  ['E-commerce / Retail', 'Marketing Strategy', 0.85],
  ['E-commerce / Retail', 'SEO', 0.80],
  ['E-commerce / Retail', 'Data Science', 0.70],
  ['E-commerce / Retail', 'Python', 0.65],
  ['E-commerce / Retail', 'Sales', 0.80],
  ['E-commerce / Retail', 'UI/UX Design', 0.70],
  ['E-commerce / Retail', 'Content Strategy', 0.70],
  ['E-commerce / Retail', 'Social Media', 0.70],

  // Education / EdTech
  ['Education / EdTech', 'Python', 0.65],
  ['Education / EdTech', 'JavaScript', 0.70],
  ['Education / EdTech', 'React', 0.65],
  ['Education / EdTech', 'UI/UX Design', 0.70],
  ['Education / EdTech', 'Content Strategy', 0.75],
  ['Education / EdTech', 'Technical Writing', 0.70],
  ['Education / EdTech', 'Public Speaking', 0.70],
  ['Education / EdTech', 'Project Management', 0.65],
  ['Education / EdTech', 'SQL', 0.55],
  ['Education / EdTech', 'Machine Learning', 0.55],
  ['Education / EdTech', 'Coaching', 0.70],
  ['Education / EdTech', 'Documentation', 0.70],

  // Media / Entertainment
  ['Media / Entertainment', 'Adobe Photoshop', 0.75],
  ['Media / Entertainment', 'Adobe Illustrator', 0.70],
  ['Media / Entertainment', 'Video Editing', 0.85],
  ['Media / Entertainment', 'Motion Graphics', 0.80],
  ['Media / Entertainment', '3D Modeling', 0.70],
  ['Media / Entertainment', 'Blender', 0.65],
  ['Media / Entertainment', 'Social Media', 0.75],
  ['Media / Entertainment', 'Content Strategy', 0.80],
  ['Media / Entertainment', 'Copywriting', 0.70],
  ['Media / Entertainment', 'Photography', 0.70],
  ['Media / Entertainment', 'Figma', 0.60],
  ['Media / Entertainment', 'Animation', 0.75],

  // Manufacturing
  ['Manufacturing', 'CAD / SolidWorks', 0.85],
  ['Manufacturing', '3D Printing', 0.80],
  ['Manufacturing', 'CNC Machining', 0.85],
  ['Manufacturing', 'Welding', 0.75],
  ['Manufacturing', 'Quality Control', 0.80],
  ['Manufacturing', 'Mechanical Engineering', 0.85],
  ['Manufacturing', 'Electrical Wiring', 0.65],
  ['Manufacturing', 'Robotics', 0.70],
  ['Manufacturing', 'Python', 0.55],
  ['Manufacturing', 'Project Management', 0.70],
  ['Manufacturing', 'Lean Manufacturing', 0.85],

  // Real Estate
  ['Real Estate', 'Marketing Strategy', 0.70],
  ['Real Estate', 'Sales', 0.75],
  ['Real Estate', 'Financial Modeling', 0.70],
  ['Real Estate', 'AutoCAD', 0.60],
  ['Real Estate', 'Negotiation', 0.75],
  ['Real Estate', 'Photography', 0.55],
  ['Real Estate', 'Social Media', 0.55],
  ['Real Estate', 'Project Management', 0.60],

  // Energy / CleanTech
  ['Energy / CleanTech', 'Physics', 0.70],
  ['Energy / CleanTech', 'Electrical Engineering', 0.75],
  ['Energy / CleanTech', 'Mechanical Engineering', 0.65],
  ['Energy / CleanTech', 'Environmental Science', 0.80],
  ['Energy / CleanTech', 'Data Science', 0.60],
  ['Energy / CleanTech', 'Python', 0.60],
  ['Energy / CleanTech', 'CAD / SolidWorks', 0.65],
  ['Energy / CleanTech', 'Project Management', 0.70],
  ['Energy / CleanTech', 'Statistics', 0.55],
  ['Energy / CleanTech', 'Renewable Energy', 0.90],

  // Transportation / Logistics
  ['Transportation / Logistics', 'Data Science', 0.70],
  ['Transportation / Logistics', 'Python', 0.65],
  ['Transportation / Logistics', 'SQL', 0.70],
  ['Transportation / Logistics', 'Mechanical Engineering', 0.65],
  ['Transportation / Logistics', 'Project Management', 0.75],
  ['Transportation / Logistics', 'Statistics', 0.60],
  ['Transportation / Logistics', 'MapReduce', 0.55],
  ['Transportation / Logistics', 'Robotics', 0.60],

  // Food & Beverage
  ['Food & Beverage', 'Cooking', 0.90],
  ['Food & Beverage', 'Baking', 0.80],
  ['Food & Beverage', 'Food Safety', 0.90],
  ['Food & Beverage', 'Menu Planning', 0.85],
  ['Food & Beverage', 'Nutrition Knowledge', 0.75],
  ['Food & Beverage', 'Catering', 0.80],
  ['Food & Beverage', 'Marketing Strategy', 0.65],
  ['Food & Beverage', 'Restaurant Management', 0.85],
  ['Food & Beverage', 'Financial Modeling', 0.55],
  ['Food & Beverage', 'Social Media', 0.60],

  // Legal / Compliance
  ['Legal / Compliance', 'Technical Writing', 0.65],
  ['Legal / Compliance', 'Documentation', 0.70],
  ['Legal / Compliance', 'Research Methods', 0.75],
  ['Legal / Compliance', 'Strategic Planning', 0.60],
  ['Legal / Compliance', 'Negotiation', 0.75],
  ['Legal / Compliance', 'Cybersecurity', 0.60],
  ['Legal / Compliance', 'SQL', 0.50],

  // Marketing / Advertising
  ['Marketing / Advertising', 'Marketing Strategy', 0.95],
  ['Marketing / Advertising', 'SEO', 0.90],
  ['Marketing / Advertising', 'Social Media', 0.90],
  ['Marketing / Advertising', 'Content Strategy', 0.90],
  ['Marketing / Advertising', 'Copywriting', 0.85],
  ['Marketing / Advertising', 'Figma', 0.65],
  ['Marketing / Advertising', 'Adobe Photoshop', 0.70],
  ['Marketing / Advertising', 'Data Science', 0.65],
  ['Marketing / Advertising', 'Python', 0.55],
  ['Marketing / Advertising', 'UI/UX Design', 0.65],
  ['Marketing / Advertising', 'Public Speaking', 0.60],

  // Consulting
  ['Consulting', 'Strategic Planning', 0.90],
  ['Consulting', 'Project Management', 0.85],
  ['Consulting', 'Financial Modeling', 0.75],
  ['Consulting', 'Data Science', 0.70],
  ['Consulting', 'SQL', 0.65],
  ['Consulting', 'Power BI', 0.70],
  ['Consulting', 'Tableau', 0.70],
  ['Consulting', 'Team Leadership', 0.80],
  ['Consulting', 'Negotiation', 0.75],
  ['Consulting', 'Public Speaking', 0.70],
  ['Consulting', 'Python', 0.60],

  // Non-profit / Social Enterprise
  ['Non-profit / Social Enterprise', 'Grant Writing', 0.90],
  ['Non-profit / Social Enterprise', 'Project Management', 0.75],
  ['Non-profit / Social Enterprise', 'Marketing Strategy', 0.65],
  ['Non-profit / Social Enterprise', 'Social Media', 0.70],
  ['Non-profit / Social Enterprise', 'Content Strategy', 0.65],
  ['Non-profit / Social Enterprise', 'Team Leadership', 0.75],
  ['Non-profit / Social Enterprise', 'Fundraising', 0.90],
  ['Non-profit / Social Enterprise', 'Volunteer Management', 0.85],
  ['Non-profit / Social Enterprise', 'Public Speaking', 0.70],
  ['Non-profit / Social Enterprise', 'Event Planning', 0.65],

  // ═══════════════════════════════════════════════════════════════
  // INDUSTRY ↔ INDUSTRY SIMILARITY
  // ═══════════════════════════════════════════════════════════════
  ['Technology / SaaS', 'Finance / Fintech', 0.70],
  ['Technology / SaaS', 'Education / EdTech', 0.70],
  ['Technology / SaaS', 'Healthcare / Biotech', 0.60],
  ['Technology / SaaS', 'E-commerce / Retail', 0.70],
  ['Technology / SaaS', 'Media / Entertainment', 0.60],
  ['Finance / Fintech', 'Consulting', 0.75],
  ['Finance / Fintech', 'E-commerce / Retail', 0.60],
  ['Healthcare / Biotech', 'Education / EdTech', 0.50],
  ['Manufacturing', 'Energy / CleanTech', 0.65],
  ['Manufacturing', 'Transportation / Logistics', 0.60],
  ['Marketing / Advertising', 'Media / Entertainment', 0.80],
  ['Marketing / Advertising', 'E-commerce / Retail', 0.75],
  ['Marketing / Advertising', 'Education / EdTech', 0.55],
  ['Non-profit / Social Enterprise', 'Education / EdTech', 0.65],
  ['Non-profit / Social Enterprise', 'Healthcare / Biotech', 0.55],
  ['Food & Beverage', 'E-commerce / Retail', 0.55],
  ['Real Estate', 'Consulting', 0.55],
  ['Legal / Compliance', 'Consulting', 0.65],
  ['Energy / CleanTech', 'Transportation / Logistics', 0.55],

  // ═══════════════════════════════════════════════════════════════
  // NONPROFIT FIELD ↔ SKILL
  // ═══════════════════════════════════════════════════════════════
  ['Education', 'Public Speaking', 0.70],
  ['Education', 'Coaching', 0.75],
  ['Education', 'Content Strategy', 0.65],
  ['Education', 'Technical Writing', 0.60],
  ['Health / Medical', 'Biology', 0.75],
  ['Health / Medical', 'Lab Techniques', 0.70],
  ['Health / Medical', 'Research Methods', 0.65],
  ['Health / Medical', 'First Aid / CPR', 0.80],
  ['Environment / Climate', 'Environmental Science', 0.85],
  ['Environment / Climate', 'Biology', 0.60],
  ['Human Rights', 'Public Speaking', 0.70],
  ['Human Rights', 'Grant Writing', 0.65],
  ['Human Rights', 'Legal Aid', 0.75],
  ['Poverty / Economic Development', 'Financial Modeling', 0.60],
  ['Poverty / Economic Development', 'Project Management', 0.70],
  ['Disaster Relief', 'First Aid / CPR', 0.80],
  ['Disaster Relief', 'Project Management', 0.65],
  ['Animal Welfare', 'Biology', 0.60],
  ['Arts / Culture', 'Adobe Photoshop', 0.65],
  ['Arts / Culture', 'Figma', 0.60],
  ['Arts / Culture', 'Creative Writing', 0.65],
  ['Community Development', 'Project Management', 0.70],
  ['Community Development', 'Team Leadership', 0.70],
  ['Community Development', 'Event Planning', 0.65],
  ['Mental Health', 'Psychology', 0.85],
  ['Mental Health', 'Coaching', 0.65],
  ['Hunger / Food Security', 'Cooking', 0.70],
  ['Hunger / Food Security', 'Nutrition Knowledge', 0.75],
  ['Hunger / Food Security', 'Food Safety', 0.70],
  ['Housing / Homelessness', 'Project Management', 0.60],
  ['Technology Access', 'Python', 0.60],
  ['Technology Access', 'JavaScript', 0.65],
  ['Technology Access', 'HTML / CSS', 0.65],
  ['Technology Access', 'Technical Writing', 0.60],
  ['Youth Development', 'Coaching', 0.80],
  ['Youth Development', 'Public Speaking', 0.65],
  ['Immigration / Refugees', 'Cultural Competency', 0.80],
  ['Immigration / Refugees', 'Translation', 0.75],
  ['Legal Aid', 'Research Methods', 0.70],
  ['Legal Aid', 'Technical Writing', 0.65],
  ['STEM Education', 'Python', 0.70],
  ['STEM Education', 'Mathematics', 0.70],
  ['STEM Education', 'Coaching', 0.70],

  // ═══════════════════════════════════════════════════════════════
  // NONPROFIT FIELD ↔ INTEREST
  // ═══════════════════════════════════════════════════════════════
  ['Education', 'Education / EdTech', 0.85],
  ['Health / Medical', 'Health & Medicine', 0.90],
  ['Environment / Climate', 'Environment & Sustainability', 0.90],
  ['Human Rights', 'Social Sciences & Humanities', 0.70],
  ['Mental Health', 'Health & Medicine', 0.75],
  ['Technology Access', 'Computer Science & Tech', 0.70],
  ['Youth Development', 'Education / EdTech', 0.70],
  ['STEM Education', 'Computer Science & Tech', 0.75],
  ['STEM Education', 'Engineering & Design', 0.65],

  // ═══════════════════════════════════════════════════════════════
  // MISSING INTEREST ↔ INDUSTRY PAIRS
  // ═══════════════════════════════════════════════════════════════
  ['Startups', 'Technology / SaaS', 0.80],
  ['Startups', 'E-commerce / Retail', 0.65],
  ['Startups', 'Finance / Fintech', 0.65],
  ['Startups', 'Marketing / Advertising', 0.60],
  ['Finance', 'Finance / Fintech', 0.90],
  ['Finance', 'Consulting', 0.70],
  ['Health Tech', 'Healthcare / Biotech', 0.85],
  ['Biotech', 'Healthcare / Biotech', 0.90],
  ['Venture Capital', 'Finance / Fintech', 0.80],
  ['Venture Capital', 'Consulting', 0.65],
  ['E-Commerce', 'E-commerce / Retail', 0.90],
  ['Marketing', 'Marketing / Advertising', 0.90],
  ['Marketing', 'E-commerce / Retail', 0.70],
  ['Game Development', 'Media / Entertainment', 0.80],
  ['Game Development', 'Technology / SaaS', 0.70],
  ['Film / Video', 'Media / Entertainment', 0.90],
  ['Music Production', 'Media / Entertainment', 0.80],
  ['Graphic Design', 'Marketing / Advertising', 0.75],
  ['Graphic Design', 'Media / Entertainment', 0.70],
  ['Web Development', 'Technology / SaaS', 0.85],
  ['Web Development', 'E-commerce / Retail', 0.70],
  ['Mobile Apps', 'Technology / SaaS', 0.80],
  ['Cybersecurity', 'Technology / SaaS', 0.70],
  ['Cloud Computing', 'Technology / SaaS', 0.85],
  ['Artificial Intelligence', 'Technology / SaaS', 0.80],
  ['Blockchain', 'Finance / Fintech', 0.75],
  ['Blockchain', 'Technology / SaaS', 0.75],
  ['Mechanical Engineering', 'Manufacturing', 0.85],
  ['Electrical Engineering', 'Manufacturing', 0.75],
  ['Civil Engineering', 'Real Estate', 0.70],
  ['Aerospace Engineering', 'Technology / SaaS', 0.60],
  ['Biomedical Engineering', 'Healthcare / Biotech', 0.85],
  ['Renewable Energy', 'Energy / CleanTech', 0.90],
  ['Climate / Sustainability', 'Energy / CleanTech', 0.80],
  ['Environmental Science', 'Energy / CleanTech', 0.70],
  ['Conservation Biology', 'Environment / Climate', 0.85],
  ['Sustainable Agriculture', 'Environment / Climate', 0.75],
  ['Psychology', 'Health & Medicine', 0.70],
  ['Nursing', 'Healthcare / Biotech', 0.80],
  ['Public Health', 'Healthcare / Biotech', 0.85],
  ['Pharmacology', 'Healthcare / Biotech', 0.85],
  ['Culinary Arts', 'Food & Beverage', 0.90],
  ['Restaurant Management', 'Food & Beverage', 0.90],
  ['Hotel Management', 'Food & Beverage', 0.70],
  ['Wine & Spirits', 'Food & Beverage', 0.80],
  ['Aviation / Piloting', 'Transportation / Logistics', 0.80],
  ['Drone Technology', 'Technology / SaaS', 0.70],
  ['Autonomous Vehicles', 'Technology / SaaS', 0.70],
  ['Autonomous Vehicles', 'Transportation / Logistics', 0.75],
  ['Space Exploration', 'Technology / SaaS', 0.65],
  ['Nonprofit Management', 'Non-profit / Social Enterprise', 0.90],
  ['Sales', 'E-commerce / Retail', 0.75],
  ['Sales', 'Technology / SaaS', 0.65],
  ['Sales', 'Finance / Fintech', 0.60],
  ['Economics', 'Finance / Fintech', 0.80],
  ['Economics', 'Consulting', 0.70],
  ['Political Science', 'Legal / Compliance', 0.55],
  ['International Relations', 'Legal / Compliance', 0.55],
  ['Woodworking', 'Manufacturing', 0.55],
  ['Metalworking', 'Manufacturing', 0.70],
  ['Automotive', 'Manufacturing', 0.70],
  ['Automotive', 'Transportation / Logistics', 0.65],
  ['Electronics', 'Technology / SaaS', 0.60],
  ['Robotics', 'Technology / SaaS', 0.70],
  ['Robotics', 'Manufacturing', 0.70],
  ['3D Printing / Fab', 'Manufacturing', 0.75],
  ['Home Improvement', 'Real Estate', 0.60],
  ['Gardening', 'Environment / Climate', 0.55],
  ['Photography', 'Media / Entertainment', 0.70],
  ['Photography', 'Marketing / Advertising', 0.60],
  ['Creative Writing', 'Media / Entertainment', 0.65],
  ['Animation', 'Media / Entertainment', 0.85],
  ['Theater', 'Media / Entertainment', 0.70],
  ['Physics Research', 'Energy / CleanTech', 0.55],
  ['Astrophysics', 'Technology / SaaS', 0.55],
  ['Materials Science', 'Manufacturing', 0.70],
  ['Genetics', 'Healthcare / Biotech', 0.85],
  ['Neuroscience', 'Healthcare / Biotech', 0.70],
  ['Linguistics', 'Education / EdTech', 0.60],

  // ═══════════════════════════════════════════════════════════════
  // NONPROFIT FIELD ↔ INDUSTRY
  // ═══════════════════════════════════════════════════════════════
  ['Education', 'Education / EdTech', 0.90],
  ['Health / Medical', 'Healthcare / Biotech', 0.85],
  ['Environment / Climate', 'Energy / CleanTech', 0.70],
  ['Technology Access', 'Technology / SaaS', 0.65],
  ['STEM Education', 'Education / EdTech', 0.80],
  ['Legal Aid', 'Legal / Compliance', 0.75],
  ['Community Development', 'Non-profit / Social Enterprise', 0.80],
  ['Youth Development', 'Education / EdTech', 0.70],
];

// Build lookup map for O(1) access
const similarityMap = new Map();
for (const [a, b, score] of PAIRWISE_SIMILARITIES) {
  const key1 = `${a}|||${b}`;
  const key2 = `${b}|||${a}`;
  similarityMap.set(key1, score);
  similarityMap.set(key2, score);
}


module.exports = {
  SKILL_CATEGORIES,
  INTEREST_CATEGORIES,
  INDUSTRIES,
  NONPROFIT_FIELDS,
  entityCategory,
  similarityMap,
  PAIRWISE_SIMILARITIES
};
