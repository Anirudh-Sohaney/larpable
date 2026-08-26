# LARPABLE — Matching Algorithm

## Overview

The matching system computes similarity scores (0–1) between users and opportunities based on their skills, interests, and industry/field. It uses a **Knowledge Graph** approach with a manually curated taxonomy.

## Architecture

```
backend/matching/
├── index.js          # Public API entry point
├── similarity.js     # Core computation engine
├── taxonomy.js       # Knowledge graph (entities + scores)
└── README.md         # This file
```

## API

```javascript
const matching = require('./matching');

// Compare two entities (skill, interest, or industry)
const sim = matching.similarity('Python', 'Java');  // 0.90

// Score a user against an opportunity
const result = matching.score(user, opportunity);
// { score: 0.75, breakdown: { avgSkillSim, skillCoverage, industryRelevance, ... } }

// Rank opportunities for a user (sorted by score descending)
const ranked = matching.rank(user, opportunities);
// [{ opportunity: {...}, score: 0.85, breakdown: {...} }, ...]
```

## Algorithm Design

### Why Knowledge Graph?

After evaluating 15+ algorithms, we chose a Knowledge Graph approach:

| Algorithm | Why Not |
|-----------|---------|
| **Cosine Similarity** | Designed for high-dimensional sparse vectors (documents). Our entities are low-dimensional and curated. |
| **Jaccard Similarity** | Too coarse. Treats "Python → Java" same as "Python → Cooking". No semantic nuance. |
| **TF-IDF** | Needs term frequency in documents. Our entities are canonical names, not free text. |
| **Word2Vec** | Adds latency + dependencies. Latent semantics already encoded in our graph. |
| **BERT Embeddings** | Overkill. GPU required. Our entity space is too small for neural embeddings to add value. |
| **Matrix Factorization** | Needs user-item interaction history. We don't have that yet. |
| **Collaborative Filtering** | Same — needs interaction data from many users. |
| **Association Rule Mining** | Discovers patterns in transactional data. Not applicable here. |
| **Bayesian Networks** | Requires conditional probability tables. Massive complexity for marginal gain. |
| **Mutual Information** | Needs large corpora. Not applicable to curated entity set. |
| **Bipartite Matching** | Good for assignment, but needs similarity scores as INPUT first. |
| **Learning-to-Rank** | Needs labeled training data (clicks, applications). Not available yet. |
| **Neural Recommender** | Same — needs large interaction dataset. |

### Why Knowledge Graph Wins

1. **Controlled vocabulary** — ~300 skills + ~120 interests + ~30 industries. Fixed, curated set.
2. **No ML dependencies** — Pure computation. No model loading, no GPU, no external APIs.
3. **Explainable** — Every score traces to specific graph paths.
4. **Fast** — O(V+E) lookups via hash map. No matrix operations.
5. **Accurate for this domain** — Manual curation beats unsupervised methods when entity space is small.

### Algorithm Steps

#### Entity ↔ Entity Similarity

```
1. EXACT MATCH       → 1.0
2. GRAPH LOOKUP      → Explicit pairwise score (O(1) via hash map)
3. CATEGORY PROXIMITY → Same category → baseline score (0.60–0.70)
4. MULTI-HOP          → Traverse intermediate nodes with decay (×0.70 per hop)
5. CROSS-DOMAIN       → Skill↔Interest, Skill↔Industry baseline
6. UNRELATED          → 0.05
```

#### User ↔ Opportunity Matching

```
1. SKILL-TO-SKILL     → For each required skill, find best match in user skills
2. SKILL COVERAGE     → % of required skills matched (threshold ≥ 0.6)
3. INDUSTRY RELEVANCE → Best match between user skills/interests and opportunity industry
4. INTEREST ALIGNMENT → Best match between user interests and opportunity industry
5. COMBINE            → Weighted sum of signals
```

Weights:
- Direct skill match: 40%
- Cross-domain relevance: 30%
- Coverage: 30%

### Similarity Tiers

| Score | Meaning | Example |
|-------|---------|---------|
| 1.00 | Exact match | Python ↔ Python |
| 0.95 | Nearly identical | JavaScript ↔ TypeScript |
| 0.90 | Very closely related | Python ↔ Java, React ↔ Vue.js |
| 0.85 | Closely related | Python ↔ Machine Learning |
| 0.80 | Related | Python ↔ Go, Cooking ↔ Baking |
| 0.70 | Moderately related | Python ↔ SQL, React ↔ UI/UX |
| 0.60 | Somewhat related | Python ↔ Finance |
| 0.50 | Distantly related | — |
| 0.30 | Loosely related | Python ↔ Cooking (cross-domain) |
| 0.05 | Unrelated | — |

### Test Results

```
User: Python, JavaScript, React, Machine Learning, Data Science
Interests: AI, Web Development, Startups

1. AI Research Intern (Tech/SaaS)     — 0.828
2. Frontend Developer (Tech/SaaS)     — 0.812
3. Data Analyst (Finance/Fintech)     — 0.739
4. ML Engineer (Healthcare/Biotech)   — 0.715
5. Climate Tech (Energy/CleanTech)    — 0.655
6. Cooking Volunteer (Food&Beverage)  — 0.234
```

## Taxonomy Coverage

- **157 skills** across 15 categories
- **118+ interests** across 11 categories
- **15 industries** (company types)
- **18 nonprofit fields**
- **600+ explicit pairwise similarity scores**
- **200+ cross-domain mappings** (skill↔interest, skill↔industry)

## Future Enhancements

1. **Collaborative Filtering** — Add user interaction data (applications, saves, clicks) to discover patterns
2. **Word2Vec/BERT** — For fuzzy matching of free-text opportunity descriptions
3. **Learning-to-Rank** — Train a model on click-through data
4. **Graph Neural Networks** — For richer relationship modeling in the knowledge graph
5. **A/B Testing** — Compare algorithm variants against user satisfaction metrics
