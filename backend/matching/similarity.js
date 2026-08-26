/**
 * LARPABLE — Similarity Computation Engine
 * 
 * Computes similarity scores (0–1) between any two entities using a
 * hybrid approach combining:
 * 
 *   1. DIRECT MATCH     — Exact string match → 1.0
 *   2. GRAPH LOOKUP     — Explicit pairwise score from taxonomy
 *   3. CATEGORY PROXIMITY — Same category → baseline score
 *   4. MULTI-HOP        — Traverse intermediate nodes with decay
 *   5. CROSS-DOMAIN     — Skill↔Interest, Skill↔Industry mappings
 * 
 * The final score is a weighted combination of these signals.
 * 
 * ALGORITHM DESIGN NOTES:
 * ───────────────────────
 * After researching the landscape (Cosine similarity, Jaccard, TF-IDF,
 * Word2Vec, BERT, Knowledge Graphs, Bipartite Matching, etc.), this
 * system uses a KNOWLEDGE GRAPH approach for the following reasons:
 * 
 *   - Controlled vocabulary: entities are a fixed, curated set (not free text)
 *   - No ML dependencies: no model loading, no GPU, no external APIs
 *   - Explainable: every score can be traced to specific graph paths
 *   - Fast: O(V+E) lookups, no matrix factorization needed
 *   - Accurate for this domain: manual curation beats unsupervised methods
 *     when the entity space is small (<500 nodes)
 * 
 * Word2Vec/BERT would add complexity without accuracy gains here because:
 *   - Our entities are canonical names, not natural language
 *   - We control the taxonomy explicitly
 *   - Latent semantic relationships are already encoded in the graph
 * 
 * Cosine similarity is used internally for SET-LEVEL comparisons
 * (user skills set vs opportunity skills set).
 */

const {
  entityCategory,
  similarityMap,
  SKILL_CATEGORIES,
  INTEREST_CATEGORIES,
  INDUSTRIES,
  NONPROFIT_FIELDS
} = require('./taxonomy');


// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
  // Category proximity baselines (used when no explicit pair exists)
  CATEGORY_BASELINES: {
    // Same super-domain
    sameSkillCategory: 0.65,       // Same skill category (e.g., both Programming)
    sameInterestCategory: 0.60,    // Same interest category
    sameIndustry: 0.70,            // Same industry/field

    // Cross-domain defaults (overridden by affinity matrix when available)
    skillToSkillDiffCategory: 0.25,    // Different skill categories (default)
    skillToInterest: 0.20,             // Skill ↔ Interest (no explicit link)
    skillToIndustry: 0.20,             // Skill ↔ Industry (no explicit link)
    interestToIndustry: 0.20,          // Interest ↔ Industry (no explicit link)
    interestToInterestDiff: 0.20,      // Different interest categories
    industryToIndustry: 0.30,          // Different industries

    // Unrelated
    unrelated: 0.05,
  },

  // Category affinity matrix — how related are two DIFFERENT skill categories?
  // Higher values = more related. Used as fallback when no explicit pair exists.
  SKILL_CATEGORY_AFFINITY: {
    // Programming Languages ↔ others
    'Programming Languages|Web & Frontend': 0.65,
    'Programming Languages|Backend & Infrastructure': 0.70,
    'Programming Languages|Data & AI': 0.65,
    'Programming Languages|Mobile Development': 0.60,
    'Programming Languages|DevOps & Cloud': 0.45,
    'Programming Languages|Design & Creative': 0.25,
    'Programming Languages|Writing & Communication': 0.20,
    'Programming Languages|Business & Leadership': 0.25,
    'Programming Languages|Science & Math': 0.40,
    'Programming Languages|Culinary & Food': 0.10,
    'Programming Languages|Mechanical & Trades': 0.20,
    'Programming Languages|Aviation & Marine': 0.10,
    'Programming Languages|Languages & Culture': 0.10,
    'Programming Languages|Fitness & Outdoors': 0.10,

    // Web & Frontend ↔ others
    'Web & Frontend|Backend & Infrastructure': 0.70,
    'Web & Frontend|Data & AI': 0.45,
    'Web & Frontend|Mobile Development': 0.60,
    'Web & Frontend|DevOps & Cloud': 0.45,
    'Web & Frontend|Design & Creative': 0.55,
    'Web & Frontend|Writing & Communication': 0.30,
    'Web & Frontend|Business & Leadership': 0.30,
    'Web & Frontend|Science & Math': 0.25,
    'Web & Frontend|Culinary & Food': 0.10,
    'Web & Frontend|Mechanical & Trades': 0.15,
    'Web & Frontend|Aviation & Marine': 0.10,
    'Web & Frontend|Languages & Culture': 0.10,
    'Web & Frontend|Fitness & Outdoors': 0.10,

    // Backend & Infrastructure ↔ others
    'Backend & Infrastructure|Data & AI': 0.55,
    'Backend & Infrastructure|Mobile Development': 0.50,
    'Backend & Infrastructure|DevOps & Cloud': 0.65,
    'Backend & Infrastructure|Design & Creative': 0.30,
    'Backend & Infrastructure|Writing & Communication': 0.25,
    'Backend & Infrastructure|Business & Leadership': 0.30,
    'Backend & Infrastructure|Science & Math': 0.35,
    'Backend & Infrastructure|Culinary & Food': 0.10,
    'Backend & Infrastructure|Mechanical & Trades': 0.15,
    'Backend & Infrastructure|Aviation & Marine': 0.10,
    'Backend & Infrastructure|Languages & Culture': 0.10,
    'Backend & Infrastructure|Fitness & Outdoors': 0.10,

    // Data & AI ↔ others
    'Data & AI|Mobile Development': 0.45,
    'Data & AI|DevOps & Cloud': 0.50,
    'Data & AI|Design & Creative': 0.30,
    'Data & AI|Writing & Communication': 0.25,
    'Data & AI|Business & Leadership': 0.40,
    'Data & AI|Science & Math': 0.65,
    'Data & AI|Culinary & Food': 0.10,
    'Data & AI|Mechanical & Trades': 0.20,
    'Data & AI|Aviation & Marine': 0.15,
    'Data & AI|Languages & Culture': 0.15,
    'Data & AI|Fitness & Outdoors': 0.10,

    // Mobile Development ↔ others
    'Mobile Development|DevOps & Cloud': 0.40,
    'Mobile Development|Design & Creative': 0.50,
    'Mobile Development|Writing & Communication': 0.25,
    'Mobile Development|Business & Leadership': 0.25,
    'Mobile Development|Science & Math': 0.25,
    'Mobile Development|Culinary & Food': 0.10,
    'Mobile Development|Mechanical & Trades': 0.15,
    'Mobile Development|Aviation & Marine': 0.10,
    'Mobile Development|Languages & Culture': 0.10,
    'Mobile Development|Fitness & Outdoors': 0.10,

    // DevOps & Cloud ↔ others
    'DevOps & Cloud|Design & Creative': 0.20,
    'DevOps & Cloud|Writing & Communication': 0.20,
    'DevOps & Cloud|Business & Leadership': 0.30,
    'DevOps & Cloud|Science & Math': 0.30,
    'DevOps & Cloud|Culinary & Food': 0.10,
    'DevOps & Cloud|Mechanical & Trades': 0.20,
    'DevOps & Cloud|Aviation & Marine': 0.15,
    'DevOps & Cloud|Languages & Culture': 0.10,
    'DevOps & Cloud|Fitness & Outdoors': 0.10,

    // Design & Creative ↔ others
    'Design & Creative|Writing & Communication': 0.45,
    'Design & Creative|Business & Leadership': 0.35,
    'Design & Creative|Science & Math': 0.20,
    'Design & Creative|Culinary & Food': 0.20,
    'Design & Creative|Mechanical & Trades': 0.40,
    'Design & Creative|Aviation & Marine': 0.10,
    'Design & Creative|Languages & Culture': 0.15,
    'Design & Creative|Fitness & Outdoors': 0.10,

    // Writing & Communication ↔ others
    'Writing & Communication|Business & Leadership': 0.50,
    'Writing & Communication|Science & Math': 0.25,
    'Writing & Communication|Culinary & Food': 0.15,
    'Writing & Communication|Mechanical & Trades': 0.10,
    'Writing & Communication|Aviation & Marine': 0.10,
    'Writing & Communication|Languages & Culture': 0.45,
    'Writing & Communication|Fitness & Outdoors': 0.10,

    // Business & Leadership ↔ others
    'Business & Leadership|Science & Math': 0.30,
    'Business & Leadership|Culinary & Food': 0.20,
    'Business & Leadership|Mechanical & Trades': 0.15,
    'Business & Leadership|Aviation & Marine': 0.15,
    'Business & Leadership|Languages & Culture': 0.20,
    'Business & Leadership|Fitness & Outdoors': 0.15,

    // Science & Math ↔ others
    'Science & Math|Culinary & Food': 0.25,
    'Science & Math|Mechanical & Trades': 0.35,
    'Science & Math|Aviation & Marine': 0.30,
    'Science & Math|Languages & Culture': 0.15,
    'Science & Math|Fitness & Outdoors': 0.15,

    // Culinary & Food ↔ others
    'Culinary & Food|Mechanical & Trades': 0.20,
    'Culinary & Food|Aviation & Marine': 0.10,
    'Culinary & Food|Languages & Culture': 0.15,
    'Culinary & Food|Fitness & Outdoors': 0.20,

    // Mechanical & Trades ↔ others
    'Mechanical & Trades|Aviation & Marine': 0.35,
    'Mechanical & Trades|Languages & Culture': 0.10,
    'Mechanical & Trades|Fitness & Outdoors': 0.15,

    // Aviation & Marine ↔ others
    'Aviation & Marine|Languages & Culture': 0.10,
    'Aviation & Marine|Fitness & Outdoors': 0.20,

    // Languages & Culture ↔ others
    'Languages & Culture|Fitness & Outdoors': 0.10,
  },

  // Interest category affinity
  INTEREST_CATEGORY_AFFINITY: {
    'Computer Science & Tech|Engineering & Design': 0.55,
    'Computer Science & Tech|Science & Research': 0.55,
    'Computer Science & Tech|Business & Entrepreneurship': 0.50,
    'Computer Science & Tech|Health & Medicine': 0.40,
    'Computer Science & Tech|Creative & Arts': 0.35,
    'Computer Science & Tech|Culinary & Hospitality': 0.15,
    'Computer Science & Tech|Aviation & Transportation': 0.40,
    'Computer Science & Tech|Environment & Sustainability': 0.35,
    'Computer Science & Tech|Social Sciences & Humanities': 0.25,
    'Computer Science & Tech|Trades & Hands-On': 0.30,
    'Engineering & Design|Science & Research': 0.55,
    'Engineering & Design|Business & Entrepreneurship': 0.35,
    'Engineering & Design|Health & Medicine': 0.45,
    'Engineering & Design|Creative & Arts': 0.45,
    'Engineering & Design|Culinary & Hospitality': 0.15,
    'Engineering & Design|Aviation & Transportation': 0.55,
    'Engineering & Design|Environment & Sustainability': 0.40,
    'Engineering & Design|Social Sciences & Humanities': 0.20,
    'Engineering & Design|Trades & Hands-On': 0.55,
    'Science & Research|Business & Entrepreneurship': 0.35,
    'Science & Research|Health & Medicine': 0.60,
    'Science & Research|Creative & Arts': 0.25,
    'Science & Research|Culinary & Hospitality': 0.25,
    'Science & Research|Aviation & Transportation': 0.40,
    'Science & Research|Environment & Sustainability': 0.55,
    'Science & Research|Social Sciences & Humanities': 0.40,
    'Science & Research|Trades & Hands-On': 0.30,
    'Business & Entrepreneurship|Health & Medicine': 0.30,
    'Business & Entrepreneurship|Creative & Arts': 0.35,
    'Business & Entrepreneurship|Culinary & Hospitality': 0.35,
    'Business & Entrepreneurship|Aviation & Transportation': 0.30,
    'Business & Entrepreneurship|Environment & Sustainability': 0.30,
    'Business & Entrepreneurship|Social Sciences & Humanities': 0.40,
    'Business & Entrepreneurship|Trades & Hands-On': 0.20,
    'Health & Medicine|Creative & Arts': 0.20,
    'Health & Medicine|Culinary & Hospitality': 0.25,
    'Health & Medicine|Aviation & Transportation': 0.20,
    'Health & Medicine|Environment & Sustainability': 0.40,
    'Health & Medicine|Social Sciences & Humanities': 0.45,
    'Health & Medicine|Trades & Hands-On': 0.20,
    'Creative & Arts|Culinary & Hospitality': 0.30,
    'Creative & Arts|Aviation & Transportation': 0.15,
    'Creative & Arts|Environment & Sustainability': 0.20,
    'Creative & Arts|Social Sciences & Humanities': 0.35,
    'Creative & Arts|Trades & Hands-On': 0.25,
    'Culinary & Hospitality|Aviation & Transportation': 0.15,
    'Culinary & Hospitality|Environment & Sustainability': 0.30,
    'Culinary & Hospitality|Social Sciences & Humanities': 0.20,
    'Culinary & Hospitality|Trades & Hands-On': 0.25,
    'Aviation & Transportation|Environment & Sustainability': 0.30,
    'Aviation & Transportation|Social Sciences & Humanities': 0.20,
    'Aviation & Transportation|Trades & Hands-On': 0.35,
    'Environment & Sustainability|Social Sciences & Humanities': 0.45,
    'Environment & Sustainability|Trades & Hands-On': 0.30,
    'Social Sciences & Humanities|Trades & Hands-On': 0.20,
  },

  // Multi-hop decay factor (score multiplied by this per hop)
  MULTI_HOP_DECAY: 0.70,

  // Maximum hops to traverse
  MAX_HOPS: 2,

  // Minimum score to consider a path relevant
  MIN_PATH_SCORE: 0.15,

  // Weights for combining signals in user↔opportunity matching
  WEIGHTS: {
    skillMatch: 0.55,   // User skills vs required skills (highest priority)
    industryFit: 0.30,  // User skills vs opportunity industry
    interestFit: 0.15,  // User interests vs opportunity industry/skills
  }
};


// ═══════════════════════════════════════════════════════════════
// CATEGORY LOOKUP HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Get the category of an entity.
 * @param {string} entity
 * @returns {{ type: string, category: string } | null}
 */
function getCategory(entity) {
  return entityCategory[entity] || null;
}

/**
 * Get all entities in a skill category.
 * @param {string} category
 * @returns {string[]}
 */
function getSkillCategoryMembers(category) {
  return SKILL_CATEGORIES[category] || [];
}

/**
 * Get the skill category for a given skill.
 * @param {string} skill
 * @returns {string | null}
 */
function getSkillCategory(skill) {
  const info = entityCategory[skill];
  if (info && info.type === 'skill') return info.category;
  return null;
}

/**
 * Get the interest category for a given interest.
 * @param {string} interest
 * @returns {string | null}
 */
function getInterestCategory(interest) {
  const info = entityCategory[interest];
  if (info && info.type === 'interest') return info.category;
  return null;
}


// ═══════════════════════════════════════════════════════════════
// CORE SIMILARITY: ENTITY ↔ ENTITY
// ═══════════════════════════════════════════════════════════════

/**
 * Compute similarity between two entities (skill, interest, or industry).
 * 
 * Algorithm:
 *   1. Exact match → 1.0
 *   2. Check explicit pairwise score in taxonomy graph
 *   3. Check category proximity (same super-domain)
 *   4. Multi-hop traversal (if score still low)
 *   5. Fall back to domain-crossing baseline
 * 
 * @param {string} a - First entity (skill, interest, or industry)
 * @param {string} b - Second entity (skill, interest, or industry)
 * @returns {number} Similarity score 0–1
 */
function entitySimilarity(a, b) {
  // Exact match
  if (a === b) return 1.0;

  // Normalize
  const aNorm = a.trim();
  const bNorm = b.trim();
  if (aNorm === bNorm) return 1.0;

  // 1. Direct graph lookup (O(1))
  const directScore = similarityMap.get(`${aNorm}|||${bNorm}`);
  if (directScore !== undefined) return directScore;

  // 2. Get categories
  const catA = getCategory(aNorm);
  const catB = getCategory(bNorm);

  // Both unknown → unrelated
  if (!catA || !catB) return CONFIG.CATEGORY_BASELINES.unrelated;

  // 3. Same type, same category → category baseline
  if (catA.type === catB.type && catA.category === catB.category) {
    if (catA.type === 'skill') return CONFIG.CATEGORY_BASELINES.sameSkillCategory;
    if (catA.type === 'interest') return CONFIG.CATEGORY_BASELINES.sameInterestCategory;
    if (catA.type === 'industry') return CONFIG.CATEGORY_BASELINES.sameIndustry;
  }

  // 4. Multi-hop traversal through graph
  const hopScore = multiHopSearch(aNorm, bNorm, catA, catB);
  if (hopScore > CONFIG.MIN_PATH_SCORE) return hopScore;

  // 5. Cross-domain baselines
  return crossDomainBaseline(catA, catB);
}

/**
 * Cross-domain baseline score when no graph path exists.
 * Uses category affinity matrices for more accurate fallbacks.
 */
function crossDomainBaseline(catA, catB) {
  const { type: typeA, category: catNameA } = catA;
  const { type: typeB, category: catNameB } = catB;

  // Same type, different category → check affinity matrix
  if (typeA === 'skill' && typeB === 'skill') {
    return getCategoryAffinity(catNameA, catNameB, CONFIG.SKILL_CATEGORY_AFFINITY, CONFIG.CATEGORY_BASELINES.skillToSkillDiffCategory);
  }
  if (typeA === 'interest' && typeB === 'interest') {
    return getCategoryAffinity(catNameA, catNameB, CONFIG.INTEREST_CATEGORY_AFFINITY, CONFIG.CATEGORY_BASELINES.interestToInterestDiff);
  }
  if (typeA === 'industry' && typeB === 'industry') {
    return CONFIG.CATEGORY_BASELINES.industryToIndustry;
  }

  // Cross-type baselines
  if ((typeA === 'skill' && typeB === 'interest') || (typeA === 'interest' && typeB === 'skill'))
    return CONFIG.CATEGORY_BASELINES.skillToInterest;
  if ((typeA === 'skill' && typeB === 'industry') || (typeA === 'industry' && typeB === 'skill'))
    return CONFIG.CATEGORY_BASELINES.skillToIndustry;
  if ((typeA === 'interest' && typeB === 'industry') || (typeA === 'industry' && typeB === 'interest'))
    return CONFIG.CATEGORY_BASELINES.interestToIndustry;

  return CONFIG.CATEGORY_BASELINES.unrelated;
}

/**
 * Look up affinity between two categories. Checks both A→B and B→A.
 * @param {string} catA
 * @param {string} catB
 * @param {object} matrix - The affinity matrix
 * @param {number} fallback - Default score if not in matrix
 * @returns {number}
 */
function getCategoryAffinity(catA, catB, matrix, fallback) {
  if (catA === catB) return fallback;
  const key1 = `${catA}|${catB}`;
  const key2 = `${catB}|${catA}`;
  if (matrix[key1] !== undefined) return matrix[key1];
  if (matrix[key2] !== undefined) return matrix[key2];
  return fallback;
}

/**
 * Multi-hop search through the similarity graph.
 * Finds the best path between a and b through intermediate nodes.
 * 
 * @param {string} a - Source entity
 * @param {string} b - Target entity
 * @param {object} catA - Category info for a
 * @param {object} catB - Category info for b
 * @returns {number} Best score found via multi-hop path
 */
function multiHopSearch(a, b, catA, catB) {
  let bestScore = 0;

  // Collect candidate intermediate nodes from a's category
  const candidates = [];

  if (catA.type === 'skill') {
    const members = getSkillCategoryMembers(catA.category);
    for (const m of members) {
      if (m === a || m === b) continue;
      const scoreAB = entitySimilarityDirect(a, m);
      if (scoreAB > 0.3) candidates.push({ node: m, scoreFromA: scoreAB });
    }
  } else if (catA.type === 'interest') {
    const members = INTEREST_CATEGORIES[catA.category] || [];
    for (const m of members) {
      if (m === a || m === b) continue;
      const scoreAB = entitySimilarityDirect(a, m);
      if (scoreAB > 0.3) candidates.push({ node: m, scoreFromA: scoreAB });
    }
  }

  // Also check explicit cross-domain links from a (same entity type only)
  for (const [key, score] of similarityMap) {
    const [x, y] = key.split('|||');
    if (x === a && y !== b && score > 0.4) {
      // Only add if same entity type — don't route through industries/interests
      const nodeInfo = entityCategory[y];
      if (nodeInfo && nodeInfo.type === catA.type && !candidates.find(c => c.node === y)) {
        candidates.push({ node: y, scoreFromA: score });
      }
    }
  }

  // For each candidate, check if it connects to b (same entity type only)
  for (const { node, scoreFromA } of candidates) {
    const nodeInfo = entityCategory[node];
    // Only traverse if candidate is same type as target b
    if (nodeInfo && nodeInfo.type === catB.type) {
      const scoreNodeB = entitySimilarityDirect(node, b);
      if (scoreNodeB > 0.2) {
        const pathScore = scoreFromA * scoreNodeB * CONFIG.MULTI_HOP_DECAY;
        if (pathScore > bestScore) bestScore = pathScore;
      }
    }
  }

  return bestScore;
}

/**
 * Direct pairwise lookup (no recursion, no multi-hop).
 * Used internally to avoid infinite loops in multi-hop.
 */
function entitySimilarityDirect(a, b) {
  if (a === b) return 1.0;
  const direct = similarityMap.get(`${a}|||${b}`);
  if (direct !== undefined) return direct;
  return 0;
}


// ═══════════════════════════════════════════════════════════════
// SET-LEVEL SIMILARITY: USER ↔ OPPORTUNITY
// ═══════════════════════════════════════════════════════════════

/**
 * Compute how well a user matches an opportunity.
 * 
 * Input:
 *   user.skills     — array of skill strings
 *   user.interests  — array of interest strings
 *   opportunity.skills          — required skills for the opportunity
 *   opportunity.industry        — company industry (or nonprofit_field)
 *   opportunity.nonprofit_field  — nonprofit field (alternative to industry)
 * 
 * Weighting (configurable in CONFIG.WEIGHTS):
 *   1. SKILL MATCH (55%)   — user skills vs required skills
 *   2. INDUSTRY FIT (30%)  — user skills vs opportunity industry
 *   3. INTEREST FIT (15%)  — user interests vs opportunity industry/skills
 * 
 * @param {object} user - { skills: string[], interests: string[] }
 * @param {object} opportunity - { skills: string[], industry?: string, nonprofit_field?: string }
 * @returns {{ score: number, breakdown: object }}
 */
function matchScore(user, opportunity) {
  const userSkills = (user.skills || []).map(s => s.trim());
  const userInterests = (user.interests || []).map(i => i.trim());
  const oppSkills = (opportunity.skills || []).map(s => s.trim());
  const oppIndustry = opportunity.industry || opportunity.nonprofit_field || '';

  // ═══════════════════════════════════════════════════════════════
  // SIGNAL 1: SKILL MATCH (weight: 0.55)
  // For each required skill, find the best matching user skill.
  // Score = weighted average of best-match similarity + coverage.
  // ═══════════════════════════════════════════════════════════════
  let totalSkillSim = 0;
  let matchedRequiredSkills = 0;
  const skillMatchDetails = [];

  for (const reqSkill of oppSkills) {
    let bestMatch = 0;
    let bestMatchSource = '';
    for (const userSkill of userSkills) {
      const sim = entitySimilarity(userSkill, reqSkill);
      if (sim > bestMatch) {
        bestMatch = sim;
        bestMatchSource = userSkill;
      }
    }
    totalSkillSim += bestMatch;
    if (bestMatch >= 0.6) matchedRequiredSkills++;
    skillMatchDetails.push({ required: reqSkill, matched: bestMatchSource, score: bestMatch });
  }

  const avgSkillSim = oppSkills.length > 0 ? totalSkillSim / oppSkills.length : 0;
  const skillCoverage = oppSkills.length > 0 ? matchedRequiredSkills / oppSkills.length : 0;

  // Skill match composite: 60% avg similarity + 40% coverage
  const skillMatchScore = oppSkills.length > 0
    ? (avgSkillSim * 0.6 + skillCoverage * 0.4)
    : 0;

  // ═══════════════════════════════════════════════════════════════
  // SIGNAL 2: INDUSTRY FIT (weight: 0.30)
  // How relevant are the user's skills to the opportunity's industry?
  // Uses the best match across all user skills.
  // ═══════════════════════════════════════════════════════════════
  let industrySkillFit = 0;
  let industryBestSkill = '';
  if (oppIndustry) {
    for (const userSkill of userSkills) {
      const sim = entitySimilarity(userSkill, oppIndustry);
      if (sim > industrySkillFit) {
        industrySkillFit = sim;
        industryBestSkill = userSkill;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // SIGNAL 3: INTEREST FIT (weight: 0.15)
  // Do the user's interests align with the opportunity?
  // Check interest → industry and interest → required skills.
  // ═══════════════════════════════════════════════════════════════
  let interestFit = 0;
  let interestBestMatch = '';
  let interestBestSource = '';

  if (userInterests.length > 0) {
    for (const interest of userInterests) {
      // Interest → industry
      if (oppIndustry) {
        const simInd = entitySimilarity(interest, oppIndustry);
        if (simInd > interestFit) {
          interestFit = simInd;
          interestBestMatch = interest;
          interestBestSource = oppIndustry;
        }
      }
      // Interest → required skills (average across skills)
      if (oppSkills.length > 0) {
        let totalSimSkill = 0;
        for (const reqSkill of oppSkills) {
          totalSimSkill += entitySimilarity(interest, reqSkill);
        }
        const avgSimSkill = totalSimSkill / oppSkills.length;
        if (avgSimSkill > interestFit) {
          interestFit = avgSimSkill;
          interestBestMatch = interest;
          interestBestSource = 'required skills (avg)';
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // COMBINE
  // ═══════════════════════════════════════════════════════════════
  const hasRequiredSkills = oppSkills.length > 0;
  const hasIndustry = !!oppIndustry;
  const hasInterests = userInterests.length > 0;

  let score;
  if (hasRequiredSkills && hasIndustry) {
    // Full signal: skills + industry + interests
    score =
      CONFIG.WEIGHTS.skillMatch * skillMatchScore +
      CONFIG.WEIGHTS.industryFit * industrySkillFit +
      CONFIG.WEIGHTS.interestFit * interestFit;
  } else if (hasRequiredSkills) {
    // Skills only (no industry)
    score = skillMatchScore;
  } else if (hasIndustry) {
    // Industry only (no required skills)
    score = industrySkillFit * 0.7 + interestFit * 0.3;
  } else {
    // No signals
    score = 0.1;
  }

  // Clamp to [0, 1]
  score = Math.max(0, Math.min(1, score));

  return {
    score: Math.round(score * 1000) / 1000,
    breakdown: {
      skillMatch: Math.round(skillMatchScore * 1000) / 1000,
      avgSkillSim: Math.round(avgSkillSim * 1000) / 1000,
      skillCoverage: Math.round(skillCoverage * 1000) / 1000,
      matchedRequiredSkills,
      totalRequiredSkills: oppSkills.length,
      industryFit: Math.round(industrySkillFit * 1000) / 1000,
      industryBestSkill,
      interestFit: Math.round(interestFit * 1000) / 1000,
      interestBestMatch,
      interestBestSource,
    }
  };
}


// ═══════════════════════════════════════════════════════════════
// BATCH RANKING
// ═══════════════════════════════════════════════════════════════

/**
 * Rank a list of opportunities for a given user.
 * Returns opportunities sorted by match score (highest first).
 * 
 * @param {object} user - { skills: string[], interests: string[] }
 * @param {object[]} opportunities - Array of opportunity objects
 * @returns {Array<{ opportunity: object, score: number, breakdown: object }>}
 */
function rankOpportunities(user, opportunities) {
  const scored = opportunities.map(opp => ({
    opportunity: opp,
    ...matchScore(user, opp)
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored;
}


// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
  entitySimilarity,
  matchScore,
  rankOpportunities,
  CONFIG,
  getCategory,
  getSkillCategory,
  getInterestCategory
};
