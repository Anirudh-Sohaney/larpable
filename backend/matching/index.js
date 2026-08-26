/**
 * LARPABLE — Matching Module
 * 
 * Public API for the skill/interest/industry matching system.
 * 
 * USAGE:
 *   const matching = require('./matching');
 *   
 *   // Compare two entities
 *   const sim = matching.similarity('Python', 'Java');  // 0.90
 *   
 *   // Score a user against an opportunity
 *   const result = matching.score(user, opportunity);
 *   // { score: 0.75, breakdown: { ... } }
 *   
 *   // Rank opportunities for a user
 *   const ranked = matching.rank(user, opportunities);
 *   // [{ opportunity: {...}, score: 0.85 }, ...]
 * 
 * ALGORITHM OVERVIEW:
 * ───────────────────
 * This system uses a KNOWLEDGE GRAPH approach with manual curation.
 * 
 * After evaluating 15+ algorithms (Cosine similarity, Jaccard, TF-IDF,
 * Word2Vec, BERT embeddings, Matrix factorization, Collaborative filtering,
 * Association rule mining, Bayesian networks, Mutual information,
 * Graph-based similarity, Knowledge graphs, Bipartite matching,
 * Learning-to-rank, Neural recommender systems), we chose a Knowledge
 * Graph approach for these reasons:
 * 
 *   1. CONTROLLED VOCABULARY — Entities are a fixed, curated set (~300
 *      skills + ~120 interests + ~30 industries). No free text.
 * 
 *   2. NO ML DEPENDENCIES — No model loading, no GPU, no external APIs.
 *      Pure computation. Runs anywhere Node.js runs.
 * 
 *   3. EXPLAINABLE — Every score can be traced to specific graph paths.
 *      "Python scores 0.85 on this opportunity because it matches
 *       the required 'Machine Learning' skill at 0.85."
 * 
 *   4. FAST — O(V+E) lookups via hash map. No matrix factorization,
 *      no embedding inference, no neural network forward pass.
 * 
 *   5. ACCURATE FOR THIS DOMAIN — Manual curation beats unsupervised
 *      methods when the entity space is small (<500 nodes). We know
 *      that Python is similar to Java; we don't need Word2Vec to
 *      discover this.
 * 
 * WHY NOT OTHER ALGORITHMS:
 * 
 *   - Cosine/TF-IDF: Designed for high-dimensional sparse vectors
 *     (documents). Our entities are low-dimensional and curated.
 *   
 *   - Word2Vec/BERT: Add latency, dependencies, and complexity.
 *     Latent semantic relationships are already encoded manually
 *     in our graph with higher precision.
 *   
 *   - Collaborative Filtering: Requires user-item interaction data.
 *     We don't have that (yet).
 *   
 *   - Matrix Factorization: Same issue — needs interaction history.
 *   
 *   - Jaccard: Too coarse. Treats "Python → Java" same as
 *     "Python → Cooking". No semantic nuance.
 *   
 *   - Bayesian Networks: Overkill. Requires conditional probability
 *     tables for every entity pair. Not worth the complexity.
 *   
 *   - Mutual Information: Needs large corpora to estimate. Not
 *     applicable to our curated set.
 *   
 *   - Bipartite Matching: Good for assignment (which user → which
 *     opportunity), but needs similarity scores as input first.
 *     We provide those scores.
 * 
 * FUTURE ENHANCEMENTS:
 *   - Add user interaction data → enable collaborative filtering
 *   - Add Word2Vec/BERT for fuzzy matching of free-text descriptions
 *   - Add learning-to-rank using click-through data
 *   - Add graph neural networks for richer relationship modeling
 */

const { entitySimilarity, matchScore, rankOpportunities, CONFIG } = require('./similarity');
const { entityCategory, similarityMap, SKILL_CATEGORIES, INTEREST_CATEGORIES, INDUSTRIES, NONPROFIT_FIELDS } = require('./taxonomy');

module.exports = {
  // ── Core API ──

  /**
   * Compute similarity between two entities.
   * @param {string} a - Skill, interest, or industry name
   * @param {string} b - Skill, interest, or industry name
   * @returns {number} Score 0–1
   */
  similarity: entitySimilarity,

  /**
   * Score how well a user matches an opportunity.
   * @param {object} user - { skills: string[], interests: string[] }
   * @param {object} opp  - { skills: string[], industry?: string, nonprofit_field?: string, type: string }
   * @returns {{ score: number, breakdown: object }}
   */
  score: matchScore,

  /**
   * Rank opportunities by relevance to a user.
   * @param {object} user - { skills: string[], interests: string[] }
   * @param {object[]} opportunities
   * @returns {Array<{ opportunity, score, breakdown }>}
   */
  rank: rankOpportunities,

  // ── Taxonomy Data ──
  categories: {
    skills: SKILL_CATEGORIES,
    interests: INTEREST_CATEGORIES,
  },
  industries: INDUSTRIES,
  nonprofitFields: NONPROFIT_FIELDS,
  entityCategory,

  // ── Config (for tuning) ──
  config: CONFIG,
};
