/**
 * LARPABLE — Legal Routes
 * 
 * GET  /api/legal/versions   — get current active versions (no auth needed)
 * GET  /api/legal/status     — check if user has agreed to current versions (auth required)
 * POST /api/legal/agree      — record user agreement (auth required)
 * 
 * Version tracking ensures users must re-agree when ToS or Privacy Policy changes.
 */

const express = require('express');
const router = express.Router();
const auth = require('../auth');
const store = require('../store');

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

// ── GET /api/legal/versions ──────────────────────────────────
// Returns current active versions (public, no auth needed for signup page)
router.get('/versions', async (req, res) => {
  try {
    const versions = await store.read('legal_versions.json');
    res.json(versions);
  } catch (e) {
    console.error('Legal versions read error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/legal/status ────────────────────────────────────
// Returns whether the current user has agreed to the latest versions
router.get('/status', requireAuth, async (req, res) => {
  try {
    const versions = await store.read('legal_versions.json');
    const user = req.user;
    
    // User's agreements (may be undefined for pre-update users)
    const agreements = user.legal_agreements || {};
    
    const termsVersion = versions.terms?.version || '';
    const privacyVersion = versions.privacy?.version || '';
    
    const agreedToTerms = agreements.terms_version === termsVersion;
    const agreedToPrivacy = agreements.privacy_version === privacyVersion;
    
    res.json({
      current_versions: {
        terms: termsVersion,
        privacy: privacyVersion
      },
      user_agreed: {
        terms: agreedToTerms,
        privacy: agreedToPrivacy
      },
      all_agreed: agreedToTerms && agreedToPrivacy,
      // When user last agreed (null if never)
      agreed_at: agreements.agreed_at || null
    });
  } catch (e) {
    console.error('Legal status error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/legal/agree ────────────────────────────────────
// Record user's agreement to current versions
router.post('/agree', requireAuth, async (req, res) => {
  try {
    const versions = await store.read('legal_versions.json');
    const userId = req.user.id;
    
    // Get raw encrypted user record
    const rawUser = await store.getRawUser(userId);
    if (!rawUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Record agreement with current versions and timestamp
    rawUser.legal_agreements = {
      terms_version: versions.terms?.version || '',
      privacy_version: versions.privacy?.version || '',
      agreed_at: new Date().toISOString()
    };
    
    await store.saveUser(userId, rawUser);
    
    res.json({ ok: true, agreed_at: rawUser.legal_agreements.agreed_at });
  } catch (e) {
    console.error('Legal agree error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/legal/agree-with-signup ────────────────────────
// Record agreement during signup (no auth required, user ID passed in body)
router.post('/agree-with-signup', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }
    
    const versions = await store.read('legal_versions.json');
    
    const rawUser = await store.getRawUser(userId);
    if (!rawUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    rawUser.legal_agreements = {
      terms_version: versions.terms?.version || '',
      privacy_version: versions.privacy?.version || '',
      agreed_at: new Date().toISOString()
    };
    
    await store.saveUser(userId, rawUser);
    
    res.json({ ok: true });
  } catch (e) {
    console.error('Legal agree-with-signup error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
