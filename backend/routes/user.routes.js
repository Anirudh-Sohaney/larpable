/**
 * LARPABLE — User Routes
 * 
 * GET    /api/users/me  — get current user profile (full)
 * PATCH  /api/users/me — update profile fields
 * DELETE /api/users/me — delete account + all associated data
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

// ── GET /api/users/me — full profile ─────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  const fields = req.user.encrypted_fields || {};
  res.json({
    id: req.user.id,
    type: req.user.type,
    created_at: req.user.created_at,
    username: fields.username || '',
    first_name: fields.first_name || '',
    last_name: fields.last_name || '',
    email: fields.email || '',
    age: fields.age || '',
    grade: fields.grade || '',
    location: fields.location || '',
    city: fields.city || '',
    state: fields.state || '',
    country: fields.country || '',
    skills: fields.skills || [],
    interests: fields.interests || []
  });
});

// ── PATCH /api/users/me — update profile ─────────────────────
router.patch('/me', requireAuth, async (req, res) => {
  try {
    // Get raw encrypted user from store
    const rawUser = await store.getRawUser(req.user.id);
    if (!rawUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Allowed fields (username, type, created_at are NEVER overwritable)
    const allowed = ['first_name', 'last_name', 'email', 'age', 'grade', 'location', 'city', 'state', 'country', 'skills', 'interests'];
    const currentFields = decryptObject(rawUser.encrypted_fields || {});
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    const merged = { ...currentFields, ...updates };
    rawUser.encrypted_fields = encryptObject(merged);
    await store.saveUser(req.user.id, rawUser);

    res.json({ ok: true });
  } catch (e) {
    console.error('Update user error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /api/users/me — delete account + all data ─────────
router.delete('/me', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Delete all opportunities created by this user
    const allOpps = await store.read('opportunities.json');
    for (const [oppId, opp] of Object.entries(allOpps)) {
      if (opp.created_by === userId) {
        await store.remove('opportunities.json', oppId);
      }
    }

    // 2. Destroy all sessions for this user
    await store.atomicUpdate('sessions.json', (sessions) => {
      for (const [hash, session] of Object.entries(sessions)) {
        if (session.user_id === userId) {
          delete sessions[hash];
        }
      }
      return sessions;
    });

    // 3. Delete user record
    await store.remove('users.json', userId);

    // 4. Clear session cookie
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.json({ ok: true });
  } catch (e) {
    console.error('Delete account error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
