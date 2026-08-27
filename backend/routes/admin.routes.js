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
const { decryptObject } = require('../crypto');

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

module.exports = router;
