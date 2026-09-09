/**
 * LARPABLE — Admin Routes
 * 
 * GET    /api/users/:id    — get any user's profile (admin only)
 * DELETE /api/users/:id    — delete any user (admin only)
 * 
 * All handlers require admin role.
 */

const express = require('express');
const router = express.Router();
const auth = require('../auth');
const store = require('../store');
const { decryptObject, encryptObject } = require('../crypto');
const { geocode, geocodeStructured } = require('../geocode');

const COOKIE_NAME = 'larpable_session';

// ── Middleware: require admin ─────────────────────────────────
async function requireAdmin(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  const user = await auth.getUserFromToken(token);
  
  if (!user || user.id !== 'admin_larpable') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  req.user = user;
  next();
}

// ── GET /api/users/:id — get any user's profile (admin) ──────
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Prevent admin from viewing themselves this way
    if (userId === 'admin_larpable') {
      return res.status(400).json({ error: 'Cannot view admin profile' });
    }
    
    const rawUser = await store.getRawUser(userId);
    if (!rawUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const fields = decryptObject(rawUser.encrypted_fields || {});
    
    res.json({
      id: userId,
      type: rawUser.type,
      created_at: rawUser.created_at,
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
      skills: fields.skills || [],
      interests: fields.interests || []
    });
  } catch (e) {
    console.error('Admin get user error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /api/users/:id — delete any user (admin) ──────────
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Prevent admin from deleting themselves
    if (userId === 'admin_larpable') {
      return res.status(400).json({ error: 'Cannot delete admin account' });
    }
    
    // 1. Delete all opportunities created by this user
    const allOpps = await store.getAllOpportunities();
    for (const [oppId, opp] of Object.entries(allOpps)) {
      if (opp.created_by === userId) {
        await store.deleteOpportunity(oppId);
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
    
    res.json({ ok: true });
  } catch (e) {
    console.error('Admin delete user error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/admin/migrate-coords — bulk geocode old data ────
// Iterates all users and opportunities, derives lat/long from location
// for any records missing coordinates. Returns progress summary.
router.post('/migrate-coords', requireAdmin, async (req, res) => {
  try {
    const users = await store.read('users.json');
    const opportunities = await store.read('opportunities.json');

    let usersUpdated = 0, usersSkipped = 0, usersFailed = 0;
    let oppsUpdated = 0, oppsSkipped = 0, oppsFailed = 0;

    // Process users
    for (const [userId, rawUser] of Object.entries(users)) {
      if (userId === 'admin_larpable') continue;
      const fields = decryptObject(rawUser.encrypted_fields || {});

      // Skip if already has coordinates
      if (fields.latitude && fields.longitude) { usersSkipped++; continue; }

      // Skip if no location data
      const city = fields.city || '';
      const state = fields.state || '';
      const country = fields.country || '';
      if (!city && !state && !country) { usersSkipped++; continue; }

      try {
        const coords = await geocodeStructured(city, state, country);
        if (coords) {
          fields.latitude = coords.lat;
          fields.longitude = coords.lon;
          rawUser.encrypted_fields = encryptObject(fields);
          await store.saveUser(userId, rawUser);
          usersUpdated++;
        } else {
          usersFailed++;
        }
      } catch (e) {
        usersFailed++;
      }
    }

    // Process opportunities
    for (const [oppId, rawOpp] of Object.entries(opportunities)) {
      const fields = decryptObject(rawOpp.encrypted_fields || {});

      // Skip if already has coordinates
      if (fields.latitude && fields.longitude) { oppsSkipped++; continue; }

      // Skip remote or empty locations
      const location = fields.location || '';
      if (!location || location.toLowerCase() === 'remote') { oppsSkipped++; continue; }

      try {
        const coords = await geocode(location);
        if (coords) {
          fields.latitude = coords.lat;
          fields.longitude = coords.lon;
          rawOpp.encrypted_fields = encryptObject(fields);
          await store.saveOpportunity(oppId, rawOpp);
          oppsUpdated++;
        } else {
          oppsFailed++;
        }
      } catch (e) {
        oppsFailed++;
      }
    }

    res.json({
      ok: true,
      users: { updated: usersUpdated, skipped: usersSkipped, failed: usersFailed },
      opportunities: { updated: oppsUpdated, skipped: oppsSkipped, failed: oppsFailed }
    });
  } catch (e) {
    console.error('Migration error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
