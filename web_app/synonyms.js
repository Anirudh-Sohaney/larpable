/**
 * LARPABLE — Synonym Map
 * 
 * Maps common search terms / abbreviations / synonyms to canonical
 * skill / interest names used in the taxonomy.
 * 
 * Used in:
 *   1. UI search (signup + profile) — show canonical items when user types synonyms
 *   2. Matching algorithm — normalize entity names before similarity lookup
 * 
 * NOTE: Each canonical name appears exactly ONCE. All synonyms for both
 * skills and interests that share the same canonical name are merged.
 */

// ── Canonical name → synonyms ──
const CANONICAL_SYNONYMS = {

  // ═══ DESIGN & CREATIVE ═══
  'UI/UX Design': [
    'web design', 'ux', 'ui', 'ui/ux', 'user experience', 'user interface',
    'user experience design', 'interface design', 'ux/ui', 'ux design', 'ui design'
  ],
  'Figma': ['figma'],
  'Photoshop / Illustrator': [
    'photoshop', 'illustrator', 'adobe photoshop', 'adobe illustrator',
    'adobe creative suite', 'creative suite'
  ],
  'Canva': ['canva'],
  'Adobe Premiere / After Effects': [
    'premiere', 'after effects', 'adobe premiere', 'adobe after effects',
    'premiere pro', 'video production'
  ],
  'Video Editing': ['video editor', 'editing', 'film editing', 'video production'],
  '3D Modeling': ['3d model', 'modeling', '3d design'],
  'Blender': ['blender'],
  'Logo Design': ['logo', 'logos', 'logo creation'],
  'Brand Identity': ['branding', 'brand', 'identity design', 'visual identity'],
  'Motion Graphics': ['motion', 'motion design', 'mograph', 'motion graphic'],
  'Graphic Design': ['graphic', 'graphics', 'visual design', 'print design', 'digital design'],

  // ═══ WRITING & COMMUNICATION ═══
  'Public Speaking': [
    'speaking', 'presentations', 'presentation', 'presenting', 'oratory',
    'speech', 'public talk'
  ],
  'Technical Writing': [
    'tech writing', 'technical docs', 'docs writing', 'documentation writing'
  ],
  'Copywriting': ['copy', 'copy write', 'ad copy', 'advertising copy'],
  'Grant Writing': ['grants', 'grant', 'grant writer'],
  'Blogging': ['blog', 'blog writer', 'blogger'],
  'Newsletter Writing': ['newsletter', 'newsletters', 'email writing'],
  'Storytelling': ['story', 'narrative', 'narration'],
  'Debate': ['debating', 'argumentation', 'forensics'],
  'Communication': [
    'comm', 'communicating', 'interpersonal', 'interpersonal skills',
    'verbal communication', 'written communication', 'people skills'
  ],
  'Public Relations': ['pr', 'public relation', 'media relations', 'communications'],

  // ═══ BUSINESS & LEADERSHIP ═══
  'Project Management': [
    'pm', 'project manager', 'project manage', 'managing projects'
  ],
  'Product Management': [
    'product manager', 'product manage', 'product owner', 'pm (product)'
  ],
  'Marketing': ['market', 'marketing', 'advertise'],
  'SEO / SEM': [
    'seo', 'sem', 'search engine optimization', 'search engine marketing',
    'search marketing', 'ppc', 'pay per click'
  ],
  'Social Media Management': [
    'social media', 'social', 'smm', 'community management',
    'social media marketing'
  ],
  'Market Research': [
    'market analysis', 'consumer research', 'user research'
  ],
  'Financial Modeling': [
    'finance', 'financial', 'modeling', 'finance modeling', 'fin model'
  ],
  'Pitch Deck Creation': [
    'pitch', 'pitch deck', 'deck', 'investor deck', 'fundraising deck'
  ],
  'Fundraising': ['fundraise', 'fundraiser', 'raising funds', 'development'],
  'Team Leadership': [
    'leadership', 'lead', 'leading', 'team lead', 'team leader',
    'people management', 'management'
  ],
  'Negotiation': ['negotiate', 'negotiating', 'deal making', 'bargaining'],
  'Critical Thinking': [
    'critical', 'critical analyze', 'analytical thinking', 'analytical'
  ],
  'Problem Solving': [
    'problem solve', 'problem solver', 'problem-solving', 'troubleshooting'
  ],
  'Time Management': [
    'time manage', 'prioritization', 'organizational skills'
  ],
  'Client Relations': [
    'client', 'client manage', 'customer relations', 'account management',
    'client management'
  ],
  'Business Analysis': [
    'business analyst', 'ba', 'business analy', 'requirements analysis',
    'requirements gathering'
  ],
  'Excel / Spreadsheets': [
    'excel', 'spreadsheet', 'spreadsheets', 'google sheets', 'sheets',
    'microsoft excel', 'data entry'
  ],

  // ═══ WEB & FRONTEND ═══
  'HTML / CSS': [
    'html', 'css', 'html5', 'css3', 'front end', 'frontend',
    'markup', 'styling', 'web markup'
  ],
  'React': ['reactjs', 'react.js', 'react js'],
  'Vue.js': ['vue', 'vuejs', 'vue js'],
  'Angular': ['angularjs', 'angular.js', 'angular js'],
  'Svelte': ['sveltejs', 'svelte.js', 'svelte js'],
  'Next.js': ['nextjs', 'next js', 'next'],
  'Tailwind CSS': ['tailwind', 'tailwindcss'],
  'SASS / LESS': ['sass', 'less', 'scss', 'stylus', 'preprocessor'],
  'Web Accessibility': ['accessibility', 'a11y', 'wcag', 'accessible design'],
  'Web Design': [
    'website design', 'website', 'webpage design', 'site design'
  ],

  // ═══ BACKEND & INFRASTRUCTURE ═══
  'Node.js': ['node', 'nodejs', 'node js'],
  'Express.js': ['express', 'expressjs', 'express js'],
  'Django': ['django'],
  'Flask': ['flask'],
  'Spring Boot': ['spring', 'springboot', 'java spring'],
  'GraphQL': ['graph ql', 'gql'],
  'REST APIs': [
    'rest', 'rest api', 'api', 'api develop', 'web api', 'http api'
  ],
  'Docker': ['containerization', 'containers'],
  'Kubernetes': ['k8s', 'kube'],
  'AWS / Cloud': [
    'aws', 'cloud', 'amazon web services', 'cloud comput',
    'cloud infrastructure', 'gcp', 'google cloud', 'azure'
  ],
  'Firebase': ['firebase'],
  'MongoDB': ['mongo', 'mongo db'],
  'SQL / Databases': [
    'sql', 'database', 'databases', 'db', 'relational database',
    'mysql', 'postgresql', 'postgres', 'sqlite', 'rdbms'
  ],
  'Redis': ['redis'],
  'Cloud Architecture': [
    'cloud arch', 'cloud infrastructure design', 'infrastructure design'
  ],

  // ═══ DATA & AI ═══
  'Data Analysis': [
    'data analy', 'analytics', 'data analytics', 'data analyst',
    'business intelligence'
  ],
  'Machine Learning': [
    'ml', 'machine learn', 'statistical learning', 'predictive modeling'
  ],
  'TensorFlow': ['tensor flow', 'tf'],
  'Pandas / NumPy': ['pandas', 'numpy', 'num py', 'data manipulation'],
  'Data Visualization': [
    'data viz', 'visualization', 'visualize data', 'chart', 'dashboards'
  ],
  'Statistical Modeling': [
    'statistics', 'stats', 'statistical', 'stat modeling', 'stat model'
  ],
  'NLP': [
    'natural language processing', 'text mining', 'text analysis',
    'computational linguistics'
  ],
  'SQL / Database Design': [
    'database design', 'schema design', 'data modeling', 'er diagram'
  ],
  'Data Engineering': [
    'data engineer', 'data pipeline', 'etl', 'data infrastructure',
    'data warehousing'
  ],
  'Quality Assurance': [
    'qa', 'quality', 'testing', 'software testing', 'test',
    'quality control', 'quality manage'
  ],

  // ═══ SCIENCE & MATH ═══
  'Math / Statistics': [
    'math', 'mathematics', 'mathematical'
  ],
  'Lab Research': ['lab', 'laboratory', 'lab work', 'bench work'],
  'Scientific Writing': [
    'science writing', 'research paper', 'academic writing', 'paper writing'
  ],
  'Experimental Design': [
    'experiment', 'experimental', 'study design', 'research design'
  ],
  'Calculus': ['calc', 'differentiation', 'integration'],
  'Linear Algebra': ['linear', 'linalg', 'la'],
  'Physics Modeling': ['physics', 'physical modeling', 'computational physics'],
  'Chemistry Lab Skills': ['chemistry', 'chem', 'chem lab', 'wet lab'],
  'Research': [
    'researching', 'academic research', 'scientific research',
    'literature review'
  ],

  // ═══ CULINARY & FOOD ═══
  'Cooking / Cuisine': ['cooking', 'cuisine', 'chef', 'culinary', 'cook'],
  'Baking / Pastry': ['baking', 'pastry', 'baker', 'bread'],
  'Food Photography': ['food photo', 'food stylist', 'food shoot'],
  'Menu Planning': ['menu', 'menu design', 'menu create'],
  'Food Safety': ['food safe', 'sanitation', 'haccp'],
  'Meal Prep & Nutrition': [
    'meal prep', 'meal planning', 'nutrition', 'nutritionist', 'diet'
  ],
  'Sous Vide': ['sous vide', 'sous-vide'],
  'Fermentation': ['ferment', 'fermenting', 'fermented'],

  // ═══ MECHANICAL & TRADES ═══
  'Soldering': ['solder', 'solder iron'],
  '3D Printing': ['3d print', 'additive manufacturing', 'fdm', 'sla'],
  'CAD / SolidWorks': [
    'cad', 'solidworks', 'solid works', 'autocad', 'auto cad',
    'computer aided design', '3d cad'
  ],
  'Arduino / Raspberry Pi': [
    'arduino', 'raspberry pi', 'raspberry', 'rpi', 'embedded',
    'microcontroller'
  ],
  'Woodworking': ['wood', 'carpentry', 'wood work', 'joinery'],
  'Basic Carpentry': ['carpentry', 'carpenter'],
  'Automotive Basics': ['automotive', 'car repair', 'auto repair', 'mechanic'],
  'Drone Operation': ['drone', 'drones', 'uav', 'pilot drone'],
  'Robotics Programming': [
    'robotics', 'robot', 'robot programming', 'robotic'
  ],

  // ═══ AVIATION & MARINE ═══
  'Flight Simulation': ['flight sim', 'flightsim', 'flight simulator'],
  'Aircraft Maintenance Basics': [
    'aircraft maintenance', 'aircraft', 'aviation maintenance', 'ame'
  ],
  'Navigation / Cartography': [
    'navigation', 'cartography', 'mapping', 'gis', 'geospatial'
  ],
  'Sailing': ['sail', 'sailor', 'boating'],
  'Scuba Diving': ['scuba', 'diving', 'dive', 'underwater'],
  'Meteorology Basics': ['meteorology', 'weather', 'climate science'],

  // ═══ LANGUAGES & CULTURE ═══
  'Spanish': ['espanol', 'español', 'castellano'],
  'Mandarin': ['chinese', 'mandarin chinese', 'putonghua'],
  'French': ['français', 'french language'],
  'Japanese': ['nihongo'],
  'German': ['deutsch', 'german language'],
  'Korean': ['korean language'],
  'Arabic': ['arabic language'],
  'Portuguese': ['português', 'brazilian portuguese'],
  'ASL (Sign Language)': ['asl', 'sign language', 'american sign language'],

  // ═══ FITNESS & OUTDOORS ═══
  'First Aid / CPR': ['first aid', 'cpr', 'emergency response', 'aed'],
  'Wilderness Survival': ['survival', 'bushcraft', 'outdoor skills'],
  'Yoga': ['yogi'],
  'Strength Training': ['strength', 'weightlifting', 'weights', 'lifting', 'gym'],
  'Swimming': ['swim', 'swimmer', 'aquatics'],
  'Rock Climbing': ['climbing', 'climb', 'bouldering', 'rock climb'],
  'Trail Running': ['running', 'trail running', 'jogging'],

  // ═══ PROGRAMMING LANGUAGES ═══
  'Python': ['python3', 'python 3', 'py'],
  'JavaScript': ['js', 'ecmascript', 'es6', 'es2015'],
  'TypeScript': ['ts'],
  'Java': ['java'],
  'C / C++': ['c', 'c++', 'cpp', 'c language', 'c programming'],
  'C#': ['csharp', 'c sharp', '.net'],
  'Swift': ['swiftlang'],
  'Kotlin': ['kt'],
  'Rust': ['rs'],
  'Go': ['golang', 'go lang'],
  'Ruby': ['ruby lang'],
  'PHP': ['php'],
  'Dart': ['dart'],
  'Scala': ['scala'],
  'R': ['r language', 'r studio', 'rprog'],
  'MATLAB': ['mat lab'],
  'Assembly': ['asm', 'assembly language', 'machine code'],
  'Lua': ['lua'],

  // ═══ INTERESTS: Computer Science & Tech ═══
  'AI / Machine Learning': [
    'ai', 'artificial intelligence', 'deep learning', 'dl',
    'neural network', 'neural nets'
  ],
  'Web Development': [
    'web dev', 'web develop', 'webapp', 'web application',
    'website develop'
  ],
  'Mobile Development': [
    'mobile', 'mobile dev', 'app develop', 'app development',
    'mobile app', 'ios develop', 'android develop'
  ],
  'Game Development': [
    'gamedev', 'game dev', 'game design', 'game make', 'video game'
  ],
  'Cybersecurity': [
    'cyber', 'security', 'infosec', 'information security',
    'network security', 'hacking', 'penetration testing'
  ],
  'Data Science': [
    'data sci', 'ds', 'data scientist', 'big data'
  ],
  'Cloud Computing': [
    'cloud comput', 'cloud service', 'saas', 'paas', 'iaas'
  ],
  'DevOps / Infrastructure': [
    'devops', 'dev ops', 'infrastructure', 'sysadmin', 'system admin',
    'operations', 'sre', 'site reliability'
  ],
  'Blockchain / Web3': [
    'blockchain', 'web3', 'web 3', 'crypto', 'cryptocurrency',
    'defi', 'decentralized', 'smart contract', 'solidity'
  ],
  'AR / VR Development': [
    'ar', 'vr', 'augmented reality', 'virtual reality', 'mixed reality',
    'xr', 'extended reality', 'ar/vr'
  ],
  'IoT / Embedded Systems': [
    'iot', 'internet of things', 'embedded', 'embedded systems',
    'embedded develop'
  ],
  'Natural Language Processing': [
    'nlp', 'natural language', 'text process', 'language model'
  ],
  'Computer Vision': [
    'cv', 'image process', 'image recognize'
  ],
  'Quantum Computing': [
    'quantum', 'qc', 'quantum comput', 'quantum mechanic'
  ],
  'Operating Systems': [
    'os', 'operating system', 'linux', 'windows', 'macos', 'kernel'
  ],
  'Distributed Systems': [
    'distributed', 'distributed comput', 'distributed system',
    'microservice', 'microservices'
  ],

  // ═══ INTERESTS: Engineering & Design ═══
  'Robotics': ['robot', 'robotic', 'automation'],
  'Aerospace': [
    'aeronautics', 'aviation engineer', 'space'
  ],
  'Biomedical Engineering': [
    'biomedical', 'bioengineer', 'bio engineer', 'biomedical eng'
  ],
  'Civil Engineering': ['civil', 'civil eng', 'structural engineer'],
  'Mechanical Engineering': [
    'mechanical', 'mech eng', 'mechanical eng', 'me'
  ],
  'Electrical Engineering': [
    'electrical', 'ee', 'electrical eng', 'electronics eng'
  ],
  'Industrial Design': ['industrial', 'id'],
  'Product Design': [
    'product', 'pd', 'design product'
  ],
  '3D Printing / Fabrication': [
    'fabrication', 'fab', 'makerspace', 'maker'
  ],
  'CAD / Engineering Design': [
    'engineering design'
  ],
  'Nanotechnology': ['nano', 'nanotech', 'nano tech', 'nanoscience'],

  // ═══ INTERESTS: Science & Research ═══
  'Biology': ['bio', 'biological', 'life science', 'life sciences'],
  'Chemistry': ['chemical', 'chem sci'],
  'Physics': ['phys', 'physical science'],
  'Mathematics': ['maths'],
  'Environmental Science': [
    'environmental', 'env sci', 'environment', 'earth science'
  ],
  'Neuroscience': ['neuro', 'neuro science', 'brain science', 'neurolog'],
  'Genetics': ['genetic', 'genomics', 'gene', 'dna'],
  'Astrophysics': ['astro', 'astro physics', 'astronomy', 'space science'],
  'Geology': ['geo', 'geological', 'geoscience'],
  'Microbiology': ['micro', 'micro bio', 'microbe', 'germ'],
  'Ecology': ['eco', 'ecological', 'ecosystem'],
  'Materials Science': [
    'material', 'materials', 'mat sci', 'material science'
  ],
  'Data Analytics': [
    'analytic', 'business intelligence'
  ],

  // ═══ INTERESTS: Business & Entrepreneurship ═══
  'Entrepreneurship': [
    'entrepreneur', 'startup', 'start-up', 'founder', 'business creation'
  ],
  'Venture Capital': [
    'vc', 'venture', 'venture fund', 'investment', 'investing'
  ],
  'Finance / Fintech': [
    'fintech', 'financial tech', 'banking'
  ],
  'Accounting': ['accountant', 'bookkeep', 'bookkeeping', 'account'],
  'Supply Chain / Logistics': [
    'supply chain', 'logistics', 'procurement', 'operations'
  ],
  'Real Estate': ['property', 'realty', 'real property'],
  'Consulting': ['consultant', 'advisory', 'advisor'],
  'Sales': ['selling', 'biz dev', 'business development'],
  'Business Strategy': [
    'strategy', 'strategic', 'biz strategy', 'corporate strategy'
  ],
  'E-Commerce': [
    'ecommerce', 'online retail', 'online store', 'digital commerce'
  ],
  'Nonprofit Management': [
    'nonprofit', 'non-profit', 'ngo', 'third sector', 'charity'
  ],
  'Digital Marketing': [
    'digital', 'digital advertise', 'online marketing', 'internet marketing',
    'digi marketing'
  ],

  // ═══ INTERESTS: Health & Medicine ═══
  'Health Tech': [
    'healthtech', 'digital health', 'medtech', 'med tech'
  ],
  'Public Health': ['pub health', 'population health', 'global health'],
  'Biotech': ['bio tech', 'biotechnology', 'bio technology'],
  'Pharmacology': [
    'pharma', 'drug develop', 'pharmaceutical'
  ],
  'Nutrition Science': [
    'nutritional', 'dietary', 'dietetics', 'food science'
  ],
  'Sports Medicine': [
    'sports med', 'exercise science', 'kinesiology', 'athletic training'
  ],
  'Mental Health': [
    'mental', 'behavioral health', 'behavioral', 'therapy', 'counseling'
  ],
  'Epidemiology': ['epi', 'disease', 'public health research'],
  'Medical Devices': ['med device', 'medical device', 'biomedical device'],
  'Nursing': ['nurse', 'rn', 'registered nurse'],
  'Healthcare Policy': [
    'health policy', 'healthcare', 'health care', 'medical policy'
  ],

  // ═══ INTERESTS: Creative & Arts ═══
  'Creative Writing': [
    'creative', 'creative write', 'fiction', 'fiction writing', 'prose'
  ],
  'Music Production': [
    'music', 'music prod', 'audio', 'sound', 'beat making', 'beat'
  ],
  'Photography': ['photo', 'photographer', 'photos'],
  'Film / Media': ['film', 'media', 'video', 'filmmaking', 'documentary'],
  'Animation': ['animate', 'animating', '2d animation', '3d animation'],
  'Fashion Design': [
    'fashion', 'apparel', 'clothing', 'textile'
  ],
  'Interior Design': [
    'interior', 'interior decor', 'decor', 'home design'
  ],
  'Architecture': ['arch', 'architect', 'building design'],
  'Digital Art': ['digi art', 'computer art'],
  'Content Creation': [
    'content', 'content create', 'creator', 'influencer', 'content creator'
  ],

  // ═══ INTERESTS: Culinary & Hospitality ═══
  'Culinary Arts': [],
  'Food Science': ['food sci', 'food technology', 'foodtech'],
  'Restaurant Management': [
    'food service', 'dining', 'restaurant ops'
  ],
  'Pastry & Baking': ['patisserie'],
  'Sustainable Food Systems': [
    'sustainable food', 'food system', 'local food', 'farm to table'
  ],
  'Wine & Beverage Studies': [
    'sommelier', 'beverage', 'bartending', 'mixology'
  ],
  'Hospitality Management': [
    'hospitality', 'hotel', 'hotel manage', 'tourism', 'travel'
  ],
  'Event Planning': [
    'event', 'event plan', 'event coord', 'wedding planner', 'party plan'
  ],
  'Nutrition & Dietetics': [
    'dietitian', 'diet plan'
  ],

  // ═══ INTERESTS: Aviation & Transportation ═══
  'Aviation / Piloting': [
    'aviation', 'pilot', 'piloting', 'flying', 'flight'
  ],
  'Drone Technology': [
    'uav', 'unmanned aerial'
  ],
  'Autonomous Vehicles': [
    'autonomous', 'self-driving', 'self driving', 'autonomous car'
  ],
  'Marine Engineering': ['marine', 'naval', 'ship', 'ocean engineer'],
  'Space Exploration': [
    'space', 'astronaut', 'nasa', 'spacecraft'
  ],
  'Urban Planning / Transit': [
    'urban', 'planning', 'transit', 'urban planning', 'public transit',
    'city planning', 'transportation'
  ],
  'Logistics Technology': [
    'logistics tech', 'supply chain tech', 'logitech'
  ],

  // ═══ INTERESTS: Environment & Sustainability ═══
  'Climate / Sustainability': [
    'climate', 'sustainability', 'sustainable', 'green', 'climate change',
    'global warming'
  ],
  'Renewable Energy': [
    'renewable', 'clean energy', 'solar', 'wind energy', 'green energy'
  ],
  'Conservation Biology': [
    'conservation', 'wildlife', 'biodiversity', 'nature'
  ],
  'Environmental Policy': [
    'env policy', 'green policy', 'epa'
  ],
  'Agriculture / Agritech': [
    'agriculture', 'agritech', 'farming', 'farm', 'agri'
  ],
  'Water Resource Management': [
    'water', 'water resource', 'hydrology', 'water management'
  ],
  'Sustainable Architecture': [
    'green building', 'sustainable arch', 'leed', 'green design'
  ],
  'Zero Waste': ['waste reduction', 'circular economy'],

  // ═══ INTERESTS: Social Sciences & Humanities ═══
  'Psychology': ['psych', 'psychological', 'behavioral science'],
  'Sociology': ['social', 'social science', 'sociological'],
  'Political Science': [
    'political', 'polisci', 'poli sci', 'politics', 'government'
  ],
  'Economics': ['econ', 'economic', 'economy'],
  'Philosophy': ['phil', 'ethics', 'moral'],
  'Linguistics': ['ling', 'linguistic', 'language science'],
  'Anthropology': ['anthro', 'anthropological', 'cultural study'],
  'International Relations': [
    'international', 'ir', 'global affairs', 'foreign affairs',
    'international affairs', 'geopolitics'
  ],
  'Criminal Justice': [
    'criminal', 'crim justice', 'criminology', 'law enforcement', 'policing'
  ],
  'Education Tech': [
    'edtech', 'ed tech', 'learning'
  ],
  'Social Impact': [
    'impact', 'social good', 'social change', 'civic'
  ],
  'Human Rights': ['rights', 'civil rights', 'human right'],
  'Community Outreach': [
    'outreach', 'community service', 'community work'
  ],
  'Volunteer Coordination': [
    'volunteer', 'volunteering', 'volunteer manage', 'service'
  ],

  // ═══ INTERESTS: Trades & Hands-On ═══
  'Automotive Repair': [
    'car', 'auto', 'mechanic', 'vehicle'
  ],
  'Electrical Wiring': ['electric', 'electrician'],
  'Plumbing Basics': ['plumber', 'pipe', 'pipes'],
  'Metalworking': ['metal', 'metal work', 'blacksmith', 'metalwork'],
  'Textile / Sewing': [
    'sewing', 'sew', 'fabric', 'knitting', 'weaving'
  ],
  'Gardening / Horticulture': [
    'garden', 'horticulture', 'plants', 'botany', 'grow'
  ],
  'Home Renovation': [
    'home', 'renovation', 'remodel', 'home improvement', 'diy', 'fix'
  ],
};

// ── Build reverse lookup: synonym → canonical name ──
// Process in order; later entries overwrite earlier ones for the same synonym.
const SYNONYM_TO_CANONICAL = {};
for (const [canonical, synonyms] of Object.entries(CANONICAL_SYNONYMS)) {
  // The canonical name itself maps to itself
  SYNONYM_TO_CANONICAL[canonical.toLowerCase()] = canonical;
  for (const syn of synonyms) {
    SYNONYM_TO_CANONICAL[syn.toLowerCase()] = canonical;
  }
}

/**
 * Normalize an entity name using synonyms.
 * Returns the canonical name if found, or the original name if no synonym match.
 * @param {string} name - The entity name to normalize
 * @returns {string} The canonical name
 */
function normalizeSynonym(name) {
  if (!name) return name;
  const lower = name.toLowerCase().trim();
  return SYNONYM_TO_CANONICAL[lower] || name;
}

/**
 * Check if a search query matches an item (direct or via synonyms).
 * @param {string} query - The search query (lowercase)
 * @param {string} itemName - The canonical item name
 * @returns {boolean} Whether the query matches
 */
function matchesSynonym(query, itemName) {
  if (!query) return true;
  const q = query.toLowerCase().trim();
  const itemLower = itemName.toLowerCase();
  
  // Direct match (substring of canonical name)
  if (itemLower.includes(q)) return true;
  
  // Check synonyms for this item
  const synonyms = CANONICAL_SYNONYMS[itemName];
  if (synonyms) {
    for (const syn of synonyms) {
      if (syn.toLowerCase().includes(q)) return true;
    }
  }
  
  // Check if query resolves to this canonical name via synonym map
  const resolved = SYNONYM_TO_CANONICAL[q];
  if (resolved && resolved === itemName) return true;
  
  return false;
}

// Export for Node.js (backend) and browser (frontend)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CANONICAL_SYNONYMS, SYNONYM_TO_CANONICAL, normalizeSynonym, matchesSynonym };
}
