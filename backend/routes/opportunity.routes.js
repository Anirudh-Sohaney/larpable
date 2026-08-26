/**
 * LARPABLE — Opportunity Routes
 * 
 * GET    /api/opportunities          — list all (optional ?type= filter)
 * GET    /api/opportunities/mine     — list opportunities created by current user
 * GET    /api/opportunities/:id      — get one
 * POST   /api/opportunities          — create (requires auth)
 * PATCH  /api/opportunities/:id      — update (owner only)
 * DELETE /api/opportunities/:id      — delete (owner only)
 * 
 * All handlers are async (non-blocking I/O).
 */

const express = require('express');
const router = express.Router();
const auth = require('../auth');
const store = require('../store');
const { encryptObject, decryptObject } = require('../crypto');
const { sanitizeObject } = require('../sanitize');

// ── Middleware: require auth ──────────────────────────────────
async function requireAuth(req, res, next) {
  const token = req.cookies?.['larpable_session'];
  const user = await auth.getUserFromToken(token);
  
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  req.user = user;
  next();
}

// ── GET /api/opportunities ───────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { type } = req.query;
    const opportunities = await store.getAllOpportunities(type || null);
    
    const enriched = opportunities.map(opp => enrichOpp(opp));
    
    res.json({ opportunities: enriched });
  } catch (e) {
    console.error('Get opportunities error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/opportunities/mine ──────────────────────────────
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const allOpps = await store.getAllOpportunities(null);
    const mine = allOpps.filter(o => o.created_by === req.user.id);
    
    const enriched = mine.map(opp => enrichOpp(opp));
    
    res.json({ opportunities: enriched });
  } catch (e) {
    console.error('Get mine error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/opportunities/:id ───────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const opp = await store.getOpportunity(req.params.id);
    
    if (!opp) {
      return res.status(404).json({ error: 'Opportunity not found' });
    }
    
    // store.getOpportunity() already decrypts — use fields directly
    const decrypted = opp.encrypted_fields || {};
    
    let issuer = null;
    if (opp.created_by) {
      const user = await store.getUser(opp.created_by);
      if (user) {
        // store.getUser() already decrypts — use encrypted_fields directly
        const userFields = user.encrypted_fields || {};
        issuer = {
          name: [userFields.firstName || userFields.first_name, userFields.lastName || userFields.last_name].filter(Boolean).join(' ')
            || userFields.org_name || userFields.company_name || 'Anonymous',
          email: userFields.email || ''
        };
      }
    }
    
    res.json({
      id: opp.id,
      type: opp.type,
      created_by: opp.created_by || '',
      created_at: opp.created_at,
      fields: decrypted,
      issuer
    });
  } catch (e) {
    console.error('Get opportunity error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/opportunities ──────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const { type, ...fields } = req.body;
    
    if (!type || !['project', 'nonprofit', 'company'].includes(type)) {
      return res.status(400).json({ error: 'Valid type is required (project, nonprofit, company)' });
    }
    
    if (!fields.title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    
    // Sanitize all input fields (prevent XSS)
    const cleanFields = sanitizeObject(fields);

    const oppId = auth.generateOpportunityId(cleanFields.title, Date.now().toString());
    
    // Build issuer info from user profile
    const userFields = decryptObject(req.user.encrypted_fields || {});
    const issuerName = [userFields.firstName || userFields.first_name, userFields.lastName || userFields.last_name].filter(Boolean).join(' ') || 'Student';
    const issuerContext = [userFields.grade, userFields.school].filter(Boolean).join(', ');
    
    const oppData = {
      type,
      created_by: req.user.id,
      created_at: new Date().toISOString(),
      encrypted_fields: {
        title: cleanFields.title,
        description: cleanFields.description || '',
        issuer_name: issuerName,
        issuer_context: issuerContext,
        looking_for: cleanFields.looking_for || '',
        location: cleanFields.location || '',
        remote: cleanFields.remote !== undefined ? cleanFields.remote : true,
        contact: cleanFields.contact || '',
        skills: cleanFields.skills || [],
        details: cleanFields.details || '',
        // Nonprofit-specific
        ...(type === 'nonprofit' && {
          nonprofit_field: cleanFields.nonprofit_field || ''
        }),
        // Company-specific
        ...(type === 'company' && {
          industry: cleanFields.industry || ''
        })
      }
    };
    
    oppData.encrypted_fields = encryptObject(oppData.encrypted_fields);
    
    await store.saveOpportunity(oppId, oppData);
    
    res.json({ id: oppId });
  } catch (e) {
    console.error('Create opportunity error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH /api/opportunities/:id ─────────────────────────────
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const opp = await store.getById('opportunities.json', req.params.id);
    
    if (!opp) {
      return res.status(404).json({ error: 'Opportunity not found' });
    }
    
    if (opp.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    // Get current decrypted fields
    const currentFields = decryptObject(opp.encrypted_fields || {});
    
    // Merge updates — whitelist of safe fields only (Issue #8 fix)
    // 'created_by', 'id', 'created_at' are NEVER overwritable.
    // 'type' is handled separately below.
    const allowedFields = ['title', 'description', 'looking_for', 'location', 'remote', 'contact', 'skills', 'details', 'nonprofit_field', 'industry'];
    const updates = {};
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }
    const updatedFields = { ...currentFields, ...sanitizeObject(updates) };
    
    // Re-encrypt
    opp.encrypted_fields = encryptObject(updatedFields);
    
    // Type can only be changed to valid values
    if (req.body.type && ['project', 'nonprofit', 'company'].includes(req.body.type)) {
      opp.type = req.body.type;
    }
    
    await store.saveOpportunity(req.params.id, opp);
    
    res.json({ ok: true });
  } catch (e) {
    console.error('Update opportunity error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /api/opportunities/:id ────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const opp = await store.getById('opportunities.json', req.params.id);
    
    if (!opp) {
      return res.status(404).json({ error: 'Opportunity not found' });
    }
    
    if (opp.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    await store.deleteOpportunity(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('Delete opportunity error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Helpers ──────────────────────────────────────────────────

function formatPosted(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return `${Math.floor(diffDays / 7)} weeks ago`;
}

function enrichOpp(opp) {
  // store.getAllOpportunities() already decrypts, so use fields directly
  const f = opp.encrypted_fields || opp;
  return {
    id: opp.id,
    type: opp.type,
    title: f.title || '',
    issuer_name: f.issuer_name || '',
    issuer_context: f.issuer_context || '',
    description: f.description || '',
    looking_for: f.looking_for || '',
    location: f.location || '',
    remote: f.remote !== undefined ? f.remote : true,
    contact: f.contact || '',
    skills: f.skills || [],
    details: f.details || '',
    nonprofit_field: f.nonprofit_field || '',
    industry: f.industry || '',
    created_by: opp.created_by || '',
    created_at: opp.created_at || '',
    posted: opp.created_at ? formatPosted(opp.created_at) : 'Recently'
  };
}

module.exports = router;
