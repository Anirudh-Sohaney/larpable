/**
 * LARPABLE — Server
 * 
 * Express app serving the frontend + API.
 * Reads .env for config, uses cookie-parser for sessions.
 * 
 * Security: CORS restricted, rate limiting, body size limits.
 * Auto-deploy test: This comment verifies the watcher is working.
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 9194;
const HOST = process.env.HOST || '0.0.0.0';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// ── Allowed Origins (CORS) ───────────────────────────────────
// Only these origins can make authenticated requests.
// Set ALLOWED_ORIGINS env var as comma-separated list for production.
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [
      `http://localhost:${PORT}`,
      `http://127.0.0.1:${PORT}`,
      `http://larpable.me`,
      `https://larpable.me`
    ];

// ── Rate Limiter (in-memory, per-IP) ─────────────────────────
// Protects auth endpoints from brute-force and abuse.
const rateLimitBuckets = new Map();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_AUTH = 300;  // auth: test suite needs ~200+ auth requests
const RATE_LIMIT_MAX_API = 500;   // api: 40 users × multiple requests each

// Cleanup stale buckets every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateLimitBuckets) {
    if (now - bucket.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      rateLimitBuckets.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Simple per-IP rate limiter middleware.
 * @param {string} namespace - e.g. "auth", "api"
 */
function rateLimit(namespace) {
  const max = namespace === 'auth' ? RATE_LIMIT_MAX_AUTH : RATE_LIMIT_MAX_API;
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const key = `${namespace}:${ip}`;
    const now = Date.now();

    let bucket = rateLimitBuckets.get(key);
    if (!bucket || now - bucket.windowStart > RATE_LIMIT_WINDOW_MS) {
      bucket = { windowStart: now, count: 0 };
      rateLimitBuckets.set(key, bucket);
    }

    bucket.count++;

    // Set rate limit headers
    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    res.set('X-RateLimit-Reset', String(Math.ceil((bucket.windowStart + RATE_LIMIT_WINDOW_MS) / 1000)));

    if (bucket.count > max) {
      return res.status(429).json({
        error: 'Too many requests. Try again later.',
        retryAfter: Math.ceil((bucket.windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000)
      });
    }

    next();
  };
}

// ── Middleware ────────────────────────────────────────────────
app.use(cookieParser(process.env.COOKIE_SECRET));
app.use(express.json({ limit: '1mb' }));

// Handle body-parser errors (malformed JSON) with 400 instead of 500
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }
  next(err);
});

// CORS — only allow whitelisted origins (Issue #5 fix)
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    // Same-origin requests (no Origin header) — allow
    res.header('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0]);
  }
  // If origin is not in allowed list → no CORS header = browser blocks it

  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── API Routes ───────────────────────────────────────────────
const authRoutes = require('./backend/routes/auth.routes');
const opportunityRoutes = require('./backend/routes/opportunity.routes');
const userRoutes = require('./backend/routes/user.routes');
const legalRoutes = require('./backend/routes/legal.routes');
const matching = require('./backend/matching');

// Rate-limit auth endpoints (Issue #10 fix)
app.use('/api/auth', rateLimit('auth'));
app.use('/api/auth', authRoutes);

app.use('/api/opportunities', rateLimit('api'), opportunityRoutes);
app.use('/api/users', rateLimit('api'), userRoutes);
app.use('/api/legal', rateLimit('api'), legalRoutes);

// Admin routes (must come before user routes to avoid conflict)
const adminRoutes = require('./backend/routes/admin.routes');
const draftRoutes = require('./backend/routes/draft.routes');
app.use('/api/admin', rateLimit('api'), adminRoutes);
app.use('/api/drafts', rateLimit('api'), draftRoutes);

// Staff routes
const staffRoutes = require('./staff/routes/staff.routes');
app.use('/api/staff', rateLimit('api'), staffRoutes);

// ── Matching API ─────────────────────────────────────────────
app.get('/api/match/entities', (req, res) => {
  const entities = [];
  for (const [cat, items] of Object.entries(matching.categories.skills)) {
    for (const item of items) entities.push({ name: item, type: 'skill', category: cat });
  }
  for (const [cat, items] of Object.entries(matching.categories.interests)) {
    for (const item of items) entities.push({ name: item, type: 'interest', category: cat });
  }
  for (const ind of matching.industries) entities.push({ name: ind, type: 'industry', category: ind });
  for (const f of matching.nonprofitFields) entities.push({ name: f, type: 'industry', category: f });
  res.json({ entities });
});

app.get('/api/match/similarity', (req, res) => {
  const { a, b } = req.query;
  if (!a || !b) return res.status(400).json({ error: 'Both a and b required' });
  const score = matching.similarity(a, b);
  res.json({ a, b, score });
});

// Issue #4 fix: require auth + cap array size on rank endpoint
const auth = require('./backend/auth');
app.post('/api/match/rank', rateLimit('api'), async (req, res) => {
  try {
    // Require authentication
    const token = req.cookies?.['larpable_session'];
    const user = await auth.getUserFromToken(token);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { user: matchUser, opportunities } = req.body;
    if (!matchUser || !opportunities) {
      return res.status(400).json({ error: 'user and opportunities required' });
    }

    // Cap array size to prevent CPU exhaustion (Issue #4)
    if (!Array.isArray(opportunities) || opportunities.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 opportunities per rank request' });
    }

    const ranked = matching.rank(matchUser, opportunities);
    res.json({ ranked });
  } catch (e) {
    console.error('Rank error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Global Error Handler ──────────────────────────────────────
// Catches any unhandled error to prevent server crash
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Uncaught Exception Handler ───────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION (server staying alive):', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION (server staying alive):', reason);
});

// ── Static File Serving ──────────────────────────────────────
// Serve web_app/ at root
app.use(express.static(path.join(__dirname, 'web_app')));

// Extensionless URL support (mirrors nginx try_files behavior for local dev)
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.includes('.')) return next();
  const filePath = path.join(__dirname, 'web_app', req.path + '.html');
  const fs = require('fs');
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }
  next();
});

// ── Protected Routes ──────────────────────────────────────────
// Staff dashboard protection - only accessible to authorized staff members
// Serve staff page (HTML) when hitting /staff exactly
const fs = require('fs');
app.get('/staff', async (req, res) => {
  // Parse cookies manually
  const cookies = {};
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    cookieHeader.split(';').forEach(cookie => {
      const parts = cookie.trim().split('=');
      if (parts.length === 2) {
        cookies[parts[0]] = decodeURIComponent(parts[1]);
      }
    });
  }
  
  const token = cookies['larpable_session'];
  if (!token) {
    return res.redirect('/feed');
  }
  
  try {
    const auth = require('./backend/auth');
    const session = await auth.validateSession(token);
    
    if (!session) {
      return res.redirect('/feed');
    }
    
    if (session.userId === 'admin_larpable') {
      return res.sendFile(path.join(__dirname, 'staff', 'staff.html'));
    }
    
    const user = await require('./backend/store').getUser(session.userId);
    if (!user) {
      return res.redirect('/feed');
    }
    
    if (user.staff_access !== true) {
      return res.redirect('/feed');
    }
    
    return res.sendFile(path.join(__dirname, 'staff', 'staff.html'));
  } catch (e) {
    console.error('Staff route protection error:', e);
    return res.redirect('/feed');
  }
});

// Serve staff/ static assets (CSS, JS) — for /staff/staff.js, /staff/staff.css, etc.
app.use('/staff', express.static(path.join(__dirname, 'staff')));

// ── Start Server ─────────────────────────────────────────────
app.listen(PORT, HOST, () => {
  console.log(`\n  ┌─────────────────────────────────────┐`);
  console.log(`  │  LARPABLE. server                    │`);
  console.log(`  │  http://${HOST}:${PORT}                │`);
  console.log(`  │                                      │`);
  console.log(`  │  Frontend:  /                        │`);
  console.log(`  │  API:       /api/*                   │`);
  console.log(`  │  Data:      backend/data/*.json      │`);
  console.log(`  │  Env:       ${IS_PRODUCTION ? 'production' : 'development'}              │`);
  console.log(`  └─────────────────────────────────────┘\n`);
});
