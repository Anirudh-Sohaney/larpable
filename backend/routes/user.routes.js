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
const { emailExists, claimVerifiedEmail, releaseVerifiedEmail, consumeVerifiedEmail } = require('./verify.routes');
const { removeUserFeedback } = require('../feedback');

const COOKIE_NAME = 'larpable_session';
const OPPORTUNITY_PREFERENCES = new Set(['paid', 'unpaid', 'volunteer', 'all']);

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

  // Derive latitude/longitude if missing
  let latitude = fields.latitude || null;
  let longitude = fields.longitude || null;
  if (!latitude && !longitude && (fields.city || fields.state || fields.country)) {
    try {
      const { geocodeStructured } = require('../geocode');
      const coords = await geocodeStructured(fields.city, fields.state, fields.country);
      if (coords) {
        latitude = coords.lat;
        longitude = coords.lon;
        await store.atomicUpdate('users.json', users => {
          const rawUser = users[req.user.id];
          if (rawUser) {
            const currentFields = decryptObject(rawUser.encrypted_fields || {});
            if (!currentFields.latitude && !currentFields.longitude) {
              currentFields.latitude = latitude;
              currentFields.longitude = longitude;
              rawUser.encrypted_fields = encryptObject(currentFields);
            }
          }
          return users;
        });
      }
    } catch (e) {
      console.error('Geocode on profile fetch failed:', e.message);
    }
  }

  // Support both old camelCase and new snake_case field names
  res.json({
    id: req.user.id,
    type: req.user.type,
    staff_access: !!req.user.staff_access,
    created_at: req.user.created_at,
    username: fields.username || '',
    first_name: fields.first_name || fields.firstName || '',
    last_name: fields.last_name || fields.lastName || '',
    email: fields.email || '',
    age: fields.age || '',
    grade: fields.grade || '',
    location: fields.location || '',
    city: fields.city || '',
    state: fields.state || '',
    country: fields.country || '',
    latitude,
    longitude,
    skills: fields.skills || [],
    interests: fields.interests || [],
    opportunity_preference: fields.opportunity_preference || 'all',
    saved_posts: fields.saved_posts || []
  });
});

// ── PATCH /api/users/me — update profile ─────────────────────
router.patch('/me', requireAuth, async (req, res) => {
  let reservedEmail = '';
  try {
    // Allowed fields (username, type, created_at are NEVER overwritable)
    const allowed = ['first_name', 'last_name', 'email', 'age', 'grade', 'location', 'city', 'state', 'country', 'latitude', 'longitude', 'skills', 'interests', 'opportunity_preference'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (updates.opportunity_preference !== undefined && !OPPORTUNITY_PREFERENCES.has(updates.opportunity_preference)) {
      return res.status(400).json({ error: 'Invalid opportunity preference' });
    }

    const rawUser = await store.getRawUser(req.user.id);
    if (!rawUser) return res.status(404).json({ error: 'User not found' });
    const currentFields = decryptObject(rawUser.encrypted_fields || {});

    // Changing to a new email requires proof of ownership (same stamp as
    // signup). Re-saving the unchanged address needs no verification.
    const currentEmail = String(currentFields.email || '').trim().toLowerCase();
    const newEmail = req.body.email !== undefined ? String(req.body.email).trim().toLowerCase() : '';
    const emailChanged = !!newEmail && newEmail !== currentEmail;
    if (emailChanged) {
      if (await emailExists(newEmail)) {
        return res.status(409).json({ error: 'Email already associated with an account' });
      }
      if (!claimVerifiedEmail(newEmail)) {
        return res.status(403).json({ error: 'Please verify the new email address first' });
      }
      reservedEmail = newEmail;
    }

    await store.atomicUpdate('users.json', users => {
      const latest = users[req.user.id];
      if (!latest) throw Object.assign(new Error('User not found'), { status: 404 });
      const latestFields = decryptObject(latest.encrypted_fields || {});
      if (emailChanged && String(latestFields.email || '').trim().toLowerCase() !== currentEmail) {
        throw Object.assign(new Error('Email changed concurrently'), { status: 409 });
      }
      latest.encrypted_fields = encryptObject({ ...latestFields, ...updates });
      return users;
    });
    if (emailChanged) {
      consumeVerifiedEmail(newEmail);
      reservedEmail = '';
    }

    res.json({ ok: true });
  } catch (e) {
    if (reservedEmail) releaseVerifiedEmail(reservedEmail);
    console.error('Update user error:', e);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Server error' });
  }
});

// ── POST /api/users/me/saved/:opportunityId ─────────────────────
router.post('/me/saved/:opportunityId', requireAuth, async (req, res) => {
  try {
    let saved;
    await store.atomicUpdate('users.json', users => {
      const rawUser = users[req.user.id];
      if (!rawUser) throw Object.assign(new Error('User not found'), { status: 404 });
      const fields = decryptObject(rawUser.encrypted_fields || {});
      saved = Array.isArray(fields.saved_posts) ? fields.saved_posts : [];
      if (!saved.includes(req.params.opportunityId)) saved.push(req.params.opportunityId);
      fields.saved_posts = saved;
      rawUser.encrypted_fields = encryptObject(fields);
      return users;
    });
    res.json({ ok: true, saved_posts: saved });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Server error' });
  }
});

// ── DELETE /api/users/me/saved/:opportunityId ─────────────────────
router.delete('/me/saved/:opportunityId', requireAuth, async (req, res) => {
  try {
    let saved;
    await store.atomicUpdate('users.json', users => {
      const rawUser = users[req.user.id];
      if (!rawUser) throw Object.assign(new Error('User not found'), { status: 404 });
      const fields = decryptObject(rawUser.encrypted_fields || {});
      const current = Array.isArray(fields.saved_posts) ? fields.saved_posts : [];
      saved = current.filter(id => id !== req.params.opportunityId);
      fields.saved_posts = saved;
      rawUser.encrypted_fields = encryptObject(fields);
      return users;
    });
    res.json({ ok: true, saved_posts: saved });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Server error' });
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

    // 3. Delete feedback and prompt history owned by this user
    await removeUserFeedback(store, userId);

    // 4. Delete user record
    await store.remove('users.json', userId);

    // 5. Clear session cookie
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.json({ ok: true });
  } catch (e) {
    console.error('Delete account error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
