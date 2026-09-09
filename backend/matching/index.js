/**
 * LARPABLE — Matching Module (Vector-based)
 * 
 * Public API for the skill/interest/industry matching system.
 * Uses cosine similarity over BGE embedding vectors.
 */

const { entitySimilarity, matchScore, rankOpportunities, score, rank, computeDistanceScore, computeDistanceMiles, haversineDistance, CONFIG, dimensions, model } = require('./similarity');
const taxonomy = require('./taxonomy.json');

module.exports = {
  similarity: entitySimilarity,
  score,
  rank: (user, opps) => {
    const entries = Object.entries(rank(user, opps));
    return entries.map(([id, sc]) => ({ opportunity: { id }, score: sc }));
  },
  computeDistanceScore,
  computeDistanceMiles,
  categories: {
    skills: { 'All Skills': taxonomy.skills || [] },
    interests: { 'All Interests': taxonomy.interests || [] },
  },
  industries: (taxonomy.fields || []),
  nonprofitFields: (taxonomy.fields || []),
  entityCategory: {},
  config: CONFIG,
  dimensions,
  model
};
