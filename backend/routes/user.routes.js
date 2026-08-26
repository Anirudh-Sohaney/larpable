/**
 * LARPABLE — User Routes
 * 
 * GET  /api/users/me  — get current user profile
 * PATCH /api/users/me — update profile fields
 * 
 * All handlers are async (non-blocking I/O).
 */

const express = require('express');
const router = express.Router();
const auth = require('../auth');
const store = require('../store');
const { encryptObject, decryptObject } = require('../crypto');

const COOKIE_NAME = 'larpable_session';

// ── Middleware: require auth ──────────────────────────────────
async function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  const user = await auth.getUserFromToken(token);
  
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  req.user = user;
  next();
}

// ── GET /api/users/me ────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

// ── PATCH /api/users/me ──────────────────────────────────────
router.patch('/me', requireAuth, async (req, res) => {
  try {
    const updates = req.body;
    
    // Get current user record from store (encrypted)
    const rawUser = await store.getById('users.json', req.user.id);
    if (!rawUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Deep merge updates into encrypted_fields
    const merged = deepMerge(rawUser.encrypted_fields || {}, updates);
    
    // Re-encrypt the merged fields
    rawUser.encrypted_fields = encryptObject(decryptObject(merged));
    
    // Save back
    await store.saveUser(req.user.id, rawUser);
    
    res.json({ ok: true });
  } catch (e) {
    console.error('Update user error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Helper: deep merge ───────────────────────────────────────
function deepMerge(target, source) {
  const result = { ...target };
  
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object') {
      result[key] = deepMerge(target[key], value);
    } else {
      result[key] = value;
    }
  }
  
  return result;
}

module.exports = router;
