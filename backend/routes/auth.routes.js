/**
 * LARPABLE — Auth Routes
 * 
 * POST /api/auth/signup   — create account
 * POST /api/auth/login    — authenticate
 * POST /api/auth/logout   — destroy session
 * GET  /api/auth/me       — get current user
 * 
 * All handlers are async (non-blocking I/O).
 */

const express = require('express');
const router = express.Router();
const auth = require('../auth');

const COOKIE_NAME = 'larpable_session';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'strict',
  maxAge: COOKIE_MAX_AGE,
  path: '/',
  // Issue #7 fix: secure flag in production (requires HTTPS)
  ...(IS_PRODUCTION && { secure: true })
};

// ── POST /api/auth/signup ────────────────────────────────────
router.post('/signup', async (req, res) => {
  try {
    const { username, password, type, legal_agreed, ...profile } = req.body;
    
    // Validate required fields
    if (!username || !password || !type) {
      return res.status(400).json({ error: 'Username, password, and type are required' });
    }
    
    // Require legal agreement
    if (!legal_agreed) {
      return res.status(400).json({ error: 'You must agree to the Terms of Service and Privacy Policy' });
    }
    
    if (username.length < 3 || username.length > 30) {
      return res.status(400).json({ error: 'Username must be 3-30 characters' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    if (type !== 'student') {
      return res.status(400).json({ error: 'Only student accounts are supported' });
    }
    
    // Validate min interests and skills
    if (!profile.interests || profile.interests.length < 3) {
      return res.status(400).json({ error: 'Select at least 3 interests' });
    }
    if (!profile.skills || profile.skills.length < 3) {
      return res.status(400).json({ error: 'Select at least 3 skills' });
    }
    
    const result = await auth.signup({ username, password, type, profile });
    
    // Record legal agreement for this user
    try {
      const store = require('../store');
      const versions = await store.read('legal_versions.json');
      const rawUser = await store.getRawUser(result.userId);
      if (rawUser) {
        rawUser.legal_agreements = {
          terms_version: versions.terms?.version || '',
          privacy_version: versions.privacy?.version || '',
          agreed_at: new Date().toISOString()
        };
        await store.saveUser(result.userId, rawUser);
      }
    } catch (e) {
      console.error('Failed to record legal agreement:', e);
    }
    
    res.cookie(COOKIE_NAME, result.token, COOKIE_OPTIONS);
    
    res.json({ userId: result.userId, type });
  } catch (e) {
    if (e.message === 'Username already taken') {
      return res.status(409).json({ error: e.message });
    }
    console.error('Signup error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/auth/login ─────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    const result = await auth.login(username, password);
    
    res.cookie(COOKIE_NAME, result.token, COOKIE_OPTIONS);
    
    res.json({ userId: result.userId, type: result.user.type });
  } catch (e) {
    if (e.message === 'Invalid username or password') {
      return res.status(401).json({ error: e.message });
    }
    console.error('Login error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/auth/logout ────────────────────────────────────
router.post('/logout', async (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  await auth.destroySession(token);
  
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

// ── GET /api/auth/me ─────────────────────────────────────────
router.get('/me', async (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  const user = await auth.getUserFromToken(token);
  
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Build display name from profile (store.getUser already decrypts)
  const fields = user.encrypted_fields || {};
  const firstName = fields.firstName || fields.first_name || '';
  const lastName = fields.lastName || fields.last_name || '';
  const displayName = [firstName, lastName].filter(Boolean).join(' ') || 'User';
  
  // Strip sensitive fields before sending to client
  const safeUser = {
    id: user.id,
    type: user.type,
    created_at: user.created_at,
    displayName
  };
  
  res.json({ user: safeUser });
});

module.exports = router;
