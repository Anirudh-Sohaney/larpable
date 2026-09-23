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
const { emailExists, claimVerifiedEmail, releaseVerifiedEmail, consumeVerifiedEmail } = require('./verify.routes');

const COOKIE_NAME = 'larpable_session';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DEFAULT_LEGAL_VERSIONS = { terms: { version: '2026-08-27' }, privacy: { version: '2026-08-27' } };
const OPPORTUNITY_PREFERENCES = new Set(['paid', 'unpaid', 'volunteer', 'all']);

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'strict',
  maxAge: COOKIE_MAX_AGE,
  path: '/',
  // Issue #7 fix: secure flag in production (requires HTTPS)
  ...(IS_PRODUCTION && { secure: true })
};

function requestAbortSignal(req, res) {
  const controller = new AbortController();
  res.once('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  return controller.signal;
}

// ── POST /api/auth/signup ────────────────────────────────────
router.post('/signup', async (req, res) => {
  let reservedSignupEmail = '';
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'A JSON object is required' });
    }
    const { username, password, type, legal_agreed, ...profile } = req.body;
    
    // Validate required fields
    if (typeof username !== 'string' || typeof password !== 'string' || !type) {
      return res.status(400).json({ error: 'Username, password, and type are required' });
    }
    
    // Require legal agreement
    if (legal_agreed !== true) {
      return res.status(400).json({ error: 'You must agree to the Terms of Service and Privacy Policy' });
    }
    
    if (username.length < 3 || username.length > 30) {
      return res.status(400).json({ error: 'Username must be 3-30 characters' });
    }
    
    if (password.length < 6 || password.length > 1024) {
      return res.status(400).json({ error: 'Password must be 6-1024 characters' });
    }
    
    if (type !== 'student') {
      return res.status(400).json({ error: 'Only student accounts are supported' });
    }
    
    // Validate min interests and skills
    if (!Array.isArray(profile.interests) || profile.interests.length < 3 || profile.interests.length > 100 || profile.interests.some(value => typeof value !== 'string' || value.length > 120)) {
      return res.status(400).json({ error: 'Select at least 3 interests' });
    }
    if (!Array.isArray(profile.skills) || profile.skills.length < 3 || profile.skills.length > 100 || profile.skills.some(value => typeof value !== 'string' || value.length > 120)) {
      return res.status(400).json({ error: 'Select at least 3 skills' });
    }

    if (profile.opportunity_preference === undefined) {
      profile.opportunity_preference = 'all';
    } else if (!OPPORTUNITY_PREFERENCES.has(profile.opportunity_preference)) {
      return res.status(400).json({ error: 'Invalid opportunity preference' });
    }
    
    // Validate age and grade are required
    if (!profile.age && profile.age !== 0) {
      return res.status(400).json({ error: 'Age is required' });
    }
    if (!profile.grade) {
      return res.status(400).json({ error: 'Grade is required' });
    }
    
    // Reject emails already associated with an account (checked again at
    // /api/verify/email; this closes the race between verify and signup)
    if (profile.email && await emailExists(profile.email)) {
      return res.status(409).json({ error: 'Email already associated with an account' });
    }

    // Require proof of email ownership when an email is supplied.
    // (No email supplied → allowed for back-compat callers; no stranger's
    // address can be stored that way.) Stamp is consumed after success so
    // failed validations don't burn it.
    const signupEmail = profile.email ? String(profile.email).trim().toLowerCase() : '';
    if (signupEmail && !claimVerifiedEmail(signupEmail)) {
      return res.status(403).json({ error: 'Please verify your email before signing up' });
    }
    if (signupEmail) reservedSignupEmail = signupEmail;

    const store = require('../store');
    let versions;
    try {
      versions = await store.read('legal_versions.json');
    } catch (e) {
      console.error('Could not read legal versions:', e);
      if (reservedSignupEmail) releaseVerifiedEmail(reservedSignupEmail);
      return res.status(503).json({ error: 'Signup temporarily unavailable' });
    }
    const legalVersions = versions.terms?.version && versions.privacy?.version ? versions : DEFAULT_LEGAL_VERSIONS;
    const legalAgreement = {
      terms_version: legalVersions.terms.version,
      privacy_version: legalVersions.privacy.version,
      agreed_at: new Date().toISOString()
    };
    const result = await auth.signup({ username, password, type, profile, legalAgreement, signal: requestAbortSignal(req, res) });
    if (signupEmail) {
      consumeVerifiedEmail(signupEmail);
      reservedSignupEmail = '';
    }
    
    res.cookie(COOKIE_NAME, result.token, COOKIE_OPTIONS);
    
    res.json({ userId: result.userId, type });
  } catch (e) {
    if (reservedSignupEmail) releaseVerifiedEmail(reservedSignupEmail);
    if (e.code === 'AUTH_WORK_CANCELLED') return;
    if (e.code === 'AUTH_WORK_QUEUE_FULL') {
      res.set('Retry-After', '2');
      return res.status(503).json({ error: 'Authentication is busy. Please try again shortly.', retryAfter: 2 });
    }
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
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'A JSON object is required' });
    }
    const { username, password } = req.body;
    
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    if (username.length > 256 || password.length > 1024) {
      return res.status(400).json({ error: 'Credentials are too long' });
    }
    
    const result = await auth.login(username, password, requestAbortSignal(req, res));
    
    res.cookie(COOKIE_NAME, result.token, COOKIE_OPTIONS);
    
    res.json({ userId: result.userId, type: result.user.type, role: result.user.role || 'student' });
  } catch (e) {
    if (e.code === 'AUTH_WORK_CANCELLED') return;
    if (e.code === 'AUTH_WORK_QUEUE_FULL') {
      res.set('Retry-After', '2');
      return res.status(503).json({ error: 'Authentication is busy. Please try again shortly.', retryAfter: 2 });
    }
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

  // Handle admin user specially
  if (user.id === 'admin_larpable') {
    return res.json({ user: { id: 'admin_larpable', type: 'admin', role: 'admin', displayName: 'Admin' } });
  }

  // Build display name from profile (store.getUser already decrypts)
  const fields = user.encrypted_fields || {};
  const firstName = fields.firstName || fields.first_name || '';
  const lastName = fields.lastName || fields.last_name || '';
  const displayName = [firstName, lastName].filter(Boolean).join(' ') || 'User';

  // Derive latitude/longitude if missing (async, non-blocking)
  let latitude = fields.latitude || null;
  let longitude = fields.longitude || null;
  if (!latitude && !longitude && (fields.city || fields.state || fields.country)) {
    try {
      const { geocodeStructured } = require('../geocode');
      const coords = await geocodeStructured(fields.city, fields.state, fields.country);
      if (coords) {
        latitude = coords.lat;
        longitude = coords.lon;
        // Persist back to user record
        const rawUser = await store.getRawUser(user.id);
        if (rawUser) {
          const currentFields = require('../crypto').decryptObject(rawUser.encrypted_fields || {});
          currentFields.latitude = latitude;
          currentFields.longitude = longitude;
          rawUser.encrypted_fields = require('../crypto').encryptObject(currentFields);
          await store.saveUser(user.id, rawUser);
        }
      }
    } catch (e) {
      console.error('Geocode on sign-in failed:', e.message);
    }
  }
  
  // Strip sensitive fields before sending to client
  const safeUser = {
    id: user.id,
    type: user.type,
    role: user.role || 'student',
    staff_access: !!user.staff_access,
    staffAccess: !!user.staff_access,
    created_at: user.created_at,
    displayName,
    latitude,
    longitude
  };
  
  res.json({ user: safeUser });
});

module.exports = router;
