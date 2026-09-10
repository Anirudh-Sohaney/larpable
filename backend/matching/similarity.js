const fs = require('fs');
const path = require('path');

const DB = JSON.parse(fs.readFileSync(path.join(__dirname, 'vectors.json'), 'utf8'));
const V = DB.vectors;
const TAXONOMY = JSON.parse(fs.readFileSync(path.join(__dirname, 'taxonomy.json'), 'utf8'));
const neighborhoods = [
  ...Object.values(TAXONOMY.skills_by_field || {}),
  ...Object.values(TAXONOMY.skills_by_interest || {})
].map(x => new Set(x));
const skillAliases = Object.fromEntries(Object.entries(TAXONOMY.skill_aliases || {}).map(([a, b]) => [a.toLowerCase(), b]));
const interestAliases = Object.fromEntries(Object.entries(TAXONOMY.interest_aliases || {}).map(([a, b]) => [a.toLowerCase(), b]));
const aliases = {
  'technology / saas': 'Technology & Software', 'finance / fintech': 'Finance & Economics',
  'healthcare / biotech': 'Medicine & Public Health', 'e-commerce / retail': 'Business & Entrepreneurship',
  'education / edtech': 'Education & Learning', 'media / entertainment': 'Arts, Design & Media',
  'manufacturing': 'Engineering & Manufacturing', 'energy / cleantech': 'Environment, Agriculture & Sports',
  'food & beverage': 'Environment, Agriculture & Sports', 'marketing / advertising': 'Business & Entrepreneurship',
  'non-profit / social enterprise': 'Humanities & Social Sciences', 'education tech': 'Education & Learning',
  'health & medicine': 'Medicine & Public Health', 'environment & sustainability': 'Environment, Agriculture & Sports',
  'social sciences & humanities': 'Humanities & Social Sciences', 'stem education': 'Education & Learning',
  'community development': 'Humanities & Social Sciences', 'education': 'Education & Learning',
  'human rights': 'Law & Public Policy', 'hunger / food security': 'Environment, Agriculture & Sports',
  'youth development': 'Education & Learning'
};

function canonicalField(value) { return aliases[String(value || '').toLowerCase()] || value; }
function canonicalSkill(value) { return skillAliases[String(value || '').toLowerCase()] || value; }
function canonicalInterest(value) { return interestAliases[String(value || '').toLowerCase()] || value; }
function vector(kind, value) { return V[kind]?.[value] || null; }
function cosine(a, b) {
  if (!a || !b) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
function semantic(a, b) { return Math.max(0, Math.min(1, (cosine(a, b) - 0.35) / 0.65)); }
function skillHit(target, candidates) {
  if (!candidates?.length) return 0;
  target = canonicalSkill(target);
  candidates = candidates.map(canonicalSkill);
  if (candidates.some(x => x.toLowerCase() === target.toLowerCase())) return 1;
  for (const group of neighborhoods) {
    if (group.has(target) && candidates.some(x => group.has(x))) return 0.65;
  }
  if (vector('skill', target)) return 0;
  return bestAgainst('skill', target, candidates);
}
function bestAgainst(kind, target, candidates) {
  const tv = vector(kind, target);
  if (!tv || !candidates?.length) return 0;
  return Math.max(...candidates.map(x => x === target ? 1 : semantic(tv, vector(kind, x))));
}
function bestCross(targetKind, target, candidateKind, candidates) {
  const tv = vector(targetKind, target);
  if (!tv || !candidates?.length) return 0;
  return Math.max(...candidates.map(x => semantic(tv, vector(candidateKind, x))));
}

function score(user, opportunity) {
  const userSkills = (user?.skills || []).map(canonicalSkill), interests = (user?.interests || []).map(canonicalInterest);
  const required = (opportunity?.skills || opportunity?.required_skills || []).map(canonicalSkill);
  const field = canonicalField(opportunity?.field || opportunity?.industry || opportunity?.nonprofit_field);
  const skillScore = required.length ? required.reduce((sum, req) => sum + skillHit(req, userSkills), 0) / required.length : 0;
  const fieldSkills = new Set(TAXONOMY.skills_by_field?.[field] || []);
  const interestFit = interests.map(i => {
    const related = new Set(TAXONOMY.skills_by_interest?.[i] || []);
    return related.size && fieldSkills.size ? [...related].filter(x => fieldSkills.has(x)).length / Math.min(related.size, fieldSkills.size) : 0;
  });
  const interestScore = Math.max(0, ...(interestFit.length ? interestFit : [0]));
  const fieldSkillScore = userSkills.length && fieldSkills.size ? Math.max(...userSkills.map(s => fieldSkills.has(s) ? 1 : 0)) : 0;
  return Math.round((skillScore * 0.70 + interestScore * 0.20 + fieldSkillScore * 0.10) * 10000) / 10000;
}

function rank(user, opportunities) {
  const userLat = user?.latitude || null;
  const userLon = user?.longitude || null;
  return Object.fromEntries((opportunities || []).map(o => {
    const matchScore = score(user, o);
    const dScore = computeDistanceScore(userLat, userLon, o.latitude || null, o.longitude || null, o.remote);
    const blended = Math.round((matchScore * 0.86 + (dScore / 10) * 0.14) * 10000) / 10000;
    return [o.id, blended];
  }));
}

function entitySimilarity(a, b) {
  if (a === b) return 1;
  const sv = vector('skill', a), tv = vector('skill', b);
  if (sv && tv) return semantic(sv, tv);
  return 0;
}

// ── Distance scoring ──────────────────────────────────────────

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distanceScore(miles) {
  if (miles <= 5)   return 10;
  if (miles <= 15)  return 9;
  if (miles <= 30)  return 8;
  if (miles <= 50)  return 7;
  if (miles <= 70)  return 6;
  if (miles <= 100) return 5;
  if (miles <= 150) return 4;
  if (miles <= 200) return 3;
  return 2;
}

function computeDistanceScore(userLat, userLon, oppLat, oppLon, oppRemote) {
  if (oppRemote) return 9;
  if (userLat == null || userLon == null || oppLat == null || oppLon == null) return 5;
  const miles = haversineDistance(userLat, userLon, oppLat, oppLon);
  return distanceScore(miles);
}

function computeDistanceMiles(userLat, userLon, oppLat, oppLon) {
  if (userLat == null || userLon == null || oppLat == null || oppLon == null) return null;
  return Math.round(haversineDistance(userLat, userLon, oppLat, oppLon));
}

const CONFIG = { WEIGHTS: { skillMatch: 0.70, industryFit: 0.10, interestFit: 0.20 } };

module.exports = {
  entitySimilarity,
  canonicalField,
  canonicalSkill,
  canonicalInterest,
  matchScore: score,
  rankOpportunities: (user, opps) => {
    const scores = rank(user, opps);
    return opps.map(o => ({ opportunity: o, score: scores[o.id] || 0, breakdown: {} })).sort((a, b) => b.score - a.score);
  },
  score,
  rank,
  computeDistanceScore,
  computeDistanceMiles,
  haversineDistance,
  CONFIG,
  dimensions: DB.dimensions,
  model: DB.model
};
