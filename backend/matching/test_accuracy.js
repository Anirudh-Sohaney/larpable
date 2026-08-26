/**
 * LARPABLE — Matching Algorithm Accuracy Test
 * 
 * Tests 100+ entity pairs across multiple categories.
 * Flags pairs where the score seems inaccurate based on domain knowledge.
 * 
 * Run: node backend/matching/test_accuracy.js
 */

const matching = require('./index');

const { similarity } = matching;

// ═══════════════════════════════════════════════════════════════
// TEST CASES — each with expected score range
// Format: [entityA, entityB, minExpected, maxExpected, reason]
// ═══════════════════════════════════════════════════════════════

const TEST_CASES = [
  // ── SAME CATEGORY (should be high) ──
  ['Python', 'Java', 0.85, 1.0, 'Both programming languages'],
  ['Python', 'JavaScript', 0.70, 1.0, 'Both programming languages'],
  ['React', 'Vue.js', 0.85, 1.0, 'Both frontend frameworks'],
  ['React', 'Angular', 0.80, 1.0, 'Both frontend frameworks'],
  ['Django', 'Flask', 0.85, 1.0, 'Both Python web frameworks'],
  ['AWS', 'Google Cloud', 0.85, 1.0, 'Both cloud providers'],
  ['Docker', 'Kubernetes', 0.80, 1.0, 'Both container tools'],
  ['SQL', 'PostgreSQL', 0.90, 1.0, 'SQL and its implementation'],
  ['Machine Learning', 'Deep Learning', 0.85, 1.0, 'Both AI subfields'],
  ['Figma', 'Sketch', 0.85, 1.0, 'Both design tools'],
  ['Cooking', 'Baking', 0.80, 1.0, 'Both culinary skills'],
  ['Welding', 'Woodworking', 0.50, 0.80, 'Both trades'],
  ['Spanish', 'Portuguese', 0.70, 1.0, 'Both Romance languages'],
  ['Project Management', 'Agile / Scrum', 0.85, 1.0, 'Both PM methodologies'],

  // ── CROSS-CATEGORY RELATED (should be moderate-high) ──
  ['Flask', 'HTML / CSS', 0.60, 1.0, 'Backend + Frontend = web dev'],
  ['Django', 'React', 0.55, 1.0, 'Backend + Frontend = web dev'],
  ['Node.js', 'React', 0.60, 1.0, 'Both JS ecosystem'],
  ['Python', 'Django', 0.80, 1.0, 'Language + its framework'],
  ['Python', 'React', 0.50, 0.85, 'Programming + Frontend'],
  ['JavaScript', 'Node.js', 0.85, 1.0, 'Language + its runtime'],
  ['React', 'React Native', 0.85, 1.0, 'Same library, different platform'],
  ['Swift', 'SwiftUI', 0.90, 1.0, 'Language + its UI framework'],
  ['Kotlin', 'Android Dev', 0.85, 1.0, 'Language + its platform'],
  ['Ruby', 'Ruby on Rails', 0.85, 1.0, 'Language + its framework'],
  ['Flutter', 'Dart', 0.90, 1.0, 'Framework + its language'],
  ['Figma', 'UI/UX Design', 0.80, 1.0, 'Tool + discipline'],
  ['HTML / CSS', 'UI/UX Design', 0.60, 1.0, 'Frontend markup + design'],
  ['Python', 'Machine Learning', 0.80, 1.0, 'Language + its primary use case'],
  ['Python', 'Data Science', 0.75, 1.0, 'Language + its primary use case'],
  ['Python', 'Pandas', 0.80, 1.0, 'Language + its library'],
  ['Python', 'TensorFlow', 0.70, 1.0, 'Language + its library'],
  ['Statistics', 'Data Science', 0.80, 1.0, 'Math + its application'],
  ['Statistics', 'Machine Learning', 0.75, 1.0, 'Math + its foundation'],

  // ── CROSS-DOMAIN (should be moderate) ──
  ['Python', 'Finance / Fintech', 0.70, 1.0, 'Programming used heavily in fintech'],
  ['JavaScript', 'Technology / SaaS', 0.85, 1.0, 'Core web tech in SaaS'],
  ['React', 'Technology / SaaS', 0.80, 1.0, 'Frontend framework in SaaS'],
  ['Cooking', 'Food & Beverage', 0.85, 1.0, 'Core skill in F&B'],
  ['Cooking', 'Catering', 0.75, 1.0, 'Culinary skill + its application'],
  ['Biology', 'Healthcare / Biotech', 0.80, 1.0, 'Science in healthcare'],
  ['Chemistry', 'Healthcare / Biotech', 0.75, 1.0, 'Science in healthcare'],
  ['Grant Writing', 'Non-profit / Social Enterprise', 0.85, 1.0, 'Core nonprofit skill'],
  ['Marketing Strategy', 'Marketing / Advertising', 0.90, 1.0, 'Skill maps to industry'],
  ['SEO', 'Marketing / Advertising', 0.85, 1.0, 'Skill maps to industry'],
  ['CAD / SolidWorks', 'Manufacturing', 0.80, 1.0, 'Design tool in manufacturing'],
  ['Financial Modeling', 'Finance / Fintech', 0.90, 1.0, 'Core finance skill'],
  ['Public Speaking', 'Education / EdTech', 0.65, 1.0, 'Soft skill in education'],
  ['Team Leadership', 'Consulting', 0.75, 1.0, 'Management in consulting'],

  // ── UNRELATED (should be low) ──
  ['Python', 'Cooking', 0.05, 0.40, 'Programming vs culinary'],
  ['Python', 'Swimming', 0.05, 0.35, 'Programming vs fitness'],
  ['React', 'Welding', 0.05, 0.35, 'Web dev vs trades'],
  ['Machine Learning', 'Baking', 0.05, 0.35, 'AI vs culinary'],
  ['Docker', 'Yoga', 0.05, 0.30, 'DevOps vs fitness'],
  ['JavaScript', 'Rock Climbing', 0.05, 0.35, 'Programming vs outdoor'],
  ['SQL', 'Cooking', 0.05, 0.35, 'Database vs culinary'],
  ['AWS', 'Swimming', 0.05, 0.30, 'Cloud vs fitness'],
  ['Kubernetes', 'Baking', 0.05, 0.30, 'DevOps vs culinary'],
  ['TypeScript', 'Woodworking', 0.05, 0.35, 'Programming vs trades'],

  // ── INTEREST ↔ INTEREST ──
  ['Artificial Intelligence', 'Machine Learning', 0.85, 1.0, 'AI encompasses ML'],
  ['Web Development', 'React', 0.80, 1.0, 'Interest maps to skill'],
  ['Startups', 'Business Strategy', 0.80, 1.0, 'Related business concepts'],
  ['Climate / Sustainability', 'Renewable Energy', 0.70, 1.0, 'Related environmental topics'],
  ['Health Tech', 'Biomedical Engineering', 0.65, 1.0, 'Related health fields'],

  // ── INDUSTRY ↔ INDUSTRY ──
  ['Technology / SaaS', 'Finance / Fintech', 0.60, 1.0, 'Related tech industries'],
  ['Marketing / Advertising', 'Media / Entertainment', 0.75, 1.0, 'Closely related industries'],
  ['Manufacturing', 'Energy / CleanTech', 0.55, 1.0, 'Related industrial sectors'],

  // ── EDGE CASES ──
  ['Python', 'Python', 1.0, 1.0, 'Exact match'],
  ['React', 'React', 1.0, 1.0, 'Exact match'],
  ['Cooking', 'Cooking', 1.0, 1.0, 'Exact match'],

  // ── PROBLEMATIC PAIRS (known issues to verify) ──
  ['HTML / CSS', 'Bootstrap', 0.85, 1.0, 'CSS framework uses CSS'],
  ['HTML / CSS', 'Tailwind CSS', 0.85, 1.0, 'CSS framework uses CSS'],
  ['HTML / CSS', 'SASS / SCSS', 0.90, 1.0, 'CSS preprocessors'],
  ['React', 'JavaScript', 0.80, 1.0, 'Framework built on language'],
  ['Vue.js', 'JavaScript', 0.80, 1.0, 'Framework built on language'],
  ['Angular', 'TypeScript', 0.80, 1.0, 'Framework built on language'],
  ['Next.js', 'React', 0.90, 1.0, 'Framework built on framework'],
  ['Express.js', 'Node.js', 0.90, 1.0, 'Framework built on runtime'],
  ['Django', 'Python', 0.80, 1.0, 'Framework built on language'],
  ['Flask', 'Python', 0.80, 1.0, 'Framework built on language'],
  ['FastAPI', 'Python', 0.80, 1.0, 'Framework built on language'],
  ['Spring Boot', 'Java', 0.80, 1.0, 'Framework built on language'],
  ['Ruby on Rails', 'Ruby', 0.85, 1.0, 'Framework built on language'],
  ['ASP.NET', 'C#', 0.80, 1.0, 'Framework built on language'],

  // ── MORE CROSS-CATEGORY (web dev ecosystem) ──
  ['Node.js', 'HTML / CSS', 0.55, 1.0, 'Both web dev'],
  ['Django', 'HTML / CSS', 0.55, 1.0, 'Backend + frontend'],
  ['Flask', 'React', 0.55, 1.0, 'Backend + frontend'],
  ['Express.js', 'React', 0.55, 1.0, 'Backend + frontend'],
  ['SQL', 'Django', 0.55, 1.0, 'Database + backend framework'],
  ['MongoDB', 'Node.js', 0.65, 1.0, 'Database + backend runtime'],
  ['Redis', 'Node.js', 0.55, 1.0, 'Cache + backend runtime'],

  // ── MORE CROSS-DOMAIN ──
  ['UI/UX Design', 'Product Management', 0.55, 1.0, 'Design + product'],
  ['Copywriting', 'Marketing Strategy', 0.65, 1.0, 'Writing + marketing'],
  ['Technical Writing', 'Documentation', 0.90, 1.0, 'Same thing'],
  ['Content Strategy', 'SEO', 0.75, 1.0, 'Content + search'],
  ['Sales', 'Negotiation', 0.75, 1.0, 'Related business skills'],
  ['Financial Modeling', 'Pitch Deck', 0.65, 1.0, 'Finance + fundraising'],

  // ── MORE UNRELATED ──
  ['Aviation Safety', 'Python', 0.05, 0.35, 'Aviation vs programming'],
  ['Marine Navigation', 'JavaScript', 0.05, 0.35, 'Maritime vs web dev'],
  ['Pilot Knowledge', 'React', 0.05, 0.35, 'Aviation vs frontend'],
  ['Welding', 'Machine Learning', 0.05, 0.35, 'Trades vs AI'],
  ['Plumbing', 'Data Science', 0.05, 0.35, 'Trades vs data'],
  ['Sailing', 'TypeScript', 0.05, 0.35, 'Maritime vs programming'],

  // ── NONPROFIT FIELDS ──
  ['Education', 'Public Speaking', 0.65, 1.0, 'Education uses speaking'],
  ['Health / Medical', 'Biology', 0.70, 1.0, 'Health based on biology'],
  ['Environment / Climate', 'Environmental Science', 0.80, 1.0, 'Direct mapping'],
  ['Mental Health', 'Psychology', 0.80, 1.0, 'Direct mapping'],
  ['Technology Access', 'Python', 0.55, 1.0, 'Tech access needs programming'],

  // ── INTEREST ↔ INDUSTRY ──
  ['Startups', 'Technology / SaaS', 0.60, 1.0, 'Startups often in tech'],
  ['Finance', 'Finance / Fintech', 0.85, 1.0, 'Direct mapping'],
  ['Health Tech', 'Healthcare / Biotech', 0.75, 1.0, 'Related health fields'],
  ['Education / EdTech', 'Education', 0.85, 1.0, 'Direct mapping'],
];

// ═══════════════════════════════════════════════════════════════
// RUN TESTS
// ═══════════════════════════════════════════════════════════════

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║  LARPABLE — Matching Algorithm Accuracy Test            ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

let passed = 0;
let failed = 0;
let warnings = 0;
const failures = [];
const warnList = [];

for (const [a, b, minExp, maxExp, reason] of TEST_CASES) {
  const score = similarity(a, b);
  const inRange = score >= minExp && score <= maxExp;

  if (inRange) {
    passed++;
    console.log(`  ✅ ${a} ↔ ${b}: ${score.toFixed(3)}  (expected ${minExp}–${maxExp}) — ${reason}`);
  } else if (score > maxExp) {
    // Score higher than expected — usually fine (better than expected)
    warnings++;
    warnList.push({ a, b, score, minExp, maxExp, reason });
    console.log(`  ⚠️  ${a} ↔ ${b}: ${score.toFixed(3)}  (expected ${minExp}–${maxExp}) — HIGHER than expected — ${reason}`);
  } else {
    // Score lower than expected — problem
    failed++;
    failures.push({ a, b, score, minExp, maxExp, reason });
    console.log(`  ❌ ${a} ↔ ${b}: ${score.toFixed(3)}  (expected ${minExp}–${maxExp}) — TOO LOW — ${reason}`);
  }
}

console.log('\n' + '─'.repeat(60));
console.log(`  Total: ${TEST_CASES.length} | ✅ Passed: ${passed} | ⚠️  Warnings: ${warnings} | ❌ Failed: ${failed}`);
console.log('─'.repeat(60));

if (failures.length > 0) {
  console.log('\n❌ FAILURES (score too low):');
  for (const f of failures) {
    console.log(`  ${f.a} ↔ ${f.b}: ${f.score.toFixed(3)} (expected min ${f.minExp}) — ${f.reason}`);
  }
}

if (warnList.length > 0) {
  console.log('\n⚠️  WARNINGS (score higher than expected, usually OK):');
  for (const w of warnList) {
    console.log(`  ${w.a} ↔ ${w.b}: ${w.score.toFixed(3)} (expected max ${w.maxExp}) — ${w.reason}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// ANALYSIS: Find root cause patterns
// ═══════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(60));
console.log('  ROOT CAUSE ANALYSIS');
console.log('═'.repeat(60));

// Check which fallback category each failure hit
const fallbackCauses = {};
for (const f of failures) {
  const infoA = matching.entityCategory[f.a];
  const infoB = matching.entityCategory[f.b];
  const cause = infoA && infoB
    ? `${infoA.type}↔${infoB.type} (${infoA.category} vs ${infoB.category})`
    : 'unknown';
  if (!fallbackCauses[cause]) fallbackCauses[cause] = [];
  fallbackCauses[cause].push(f);
}

for (const [cause, items] of Object.entries(fallbackCauses)) {
  console.log(`\n  Pattern: ${cause}`);
  for (const item of items) {
    console.log(`    ${item.a} ↔ ${item.b}: ${item.score.toFixed(3)} (needs ≥${item.minExp})`);
  }
}

// Also run 100 random pairs for broader coverage
console.log('\n' + '═'.repeat(60));
console.log('  RANDOM SAMPLING (100 pairs)');
console.log('═'.repeat(60));

const allEntities = [];
for (const [cat, items] of Object.entries(matching.categories.skills)) {
  for (const item of items) allEntities.push({ name: item, type: 'skill', category: cat });
}
for (const [cat, items] of Object.entries(matching.categories.interests)) {
  for (const item of items) allEntities.push({ name: item, type: 'interest', category: cat });
}
for (const ind of matching.industries) allEntities.push({ name: ind, type: 'industry', category: ind });

// Seed random for reproducibility
let seed = 42;
function seededRandom() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

const randomPairs = [];
for (let i = 0; i < 100; i++) {
  const a = allEntities[Math.floor(seededRandom() * allEntities.length)];
  const b = allEntities[Math.floor(seededRandom() * allEntities.length)];
  if (a.name === b.name) continue;
  const score = similarity(a.name, b.name);
  randomPairs.push({ a: a.name, b: b.name, typeA: a.type, typeB: b.type, catA: a.category, catB: b.category, score });
}

// Sort by score
randomPairs.sort((a, b) => a.score - b.score);

// Show distribution
const buckets = { '0.0-0.1': 0, '0.1-0.2': 0, '0.2-0.3': 0, '0.3-0.4': 0, '0.4-0.5': 0, '0.5-0.6': 0, '0.6-0.7': 0, '0.7-0.8': 0, '0.8-0.9': 0, '0.9-1.0': 0 };
for (const p of randomPairs) {
  const bucket = Math.floor(p.score * 10);
  const key = `${(bucket/10).toFixed(1)}-${((bucket+1)/10).toFixed(1)}`;
  buckets[key] = (buckets[key] || 0) + 1;
}

console.log('\n  Score Distribution:');
for (const [range, count] of Object.entries(buckets)) {
  const bar = '█'.repeat(count);
  console.log(`  ${range}: ${bar} (${count})`);
}

// Show suspicious pairs (same type, same category, but low score)
console.log('\n  Suspicious: Same category pairs with low scores:');
const suspicious = randomPairs.filter(p => p.typeA === p.typeB && p.catA === p.catB && p.score < 0.5);
for (const s of suspicious.slice(0, 15)) {
  console.log(`    ${s.a} ↔ ${s.b}: ${s.score.toFixed(3)} (${s.catA})`);
}

// Show low cross-category pairs that seem like they should be higher
console.log('\n  Low cross-category pairs:');
const lowCross = randomPairs.filter(p => p.typeA === p.typeB && p.catA !== p.catB && p.score < 0.3);
for (const s of lowCross.slice(0, 15)) {
  console.log(`    ${s.a} ↔ ${s.b}: ${s.score.toFixed(3)} (${s.catA} vs ${s.catB})`);
}
