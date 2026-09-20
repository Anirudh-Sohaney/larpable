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
 *
 * POSTS & MODERATION: every new post (and edit) is scanned by the profanity
 * filter (`../profanity`). Flagged posts are stored `flagged: true`, hidden
 * from the public feed until a staff member approves them (the author still
 * sees their own post), and listed in the staff Work tab's flagged queue.
 */

const express = require('express');
const router = express.Router();
const auth = require('../auth');
const store = require('../store');
const { encryptObject, decryptObject } = require('../crypto');
const { sanitizeObject } = require('../sanitize');
const { geocode } = require('../geocode');
const { scanFields, applyFlag, flagNotice } = require('../profanity');
const { normalizeOpportunitySkills } = require('../skill-normalization');

const OPPORTUNITY_PREFERENCES = new Set(['volunteering', 'paid', 'unpaid']);
const DEFAULT_OPPORTUNITY_PREFERENCE = { project: 'unpaid', nonprofit: 'volunteering', company: 'paid' };

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

// ── Middleware: optional auth (public feed) ───────────────────
// Logged-in posters still see their own flagged posts in the feed;
// anonymous visitors only ever see approved posts.
async function optionalAuth(req, res, next) {
  const token = req.cookies?.['larpable_session'];
  req.user = token ? await auth.getUserFromToken(token) : null;
  next();
}

// ── GET /api/opportunities ───────────────────────────────────
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { type } = req.query;
    let opportunities = await store.getAllOpportunities(type || null);

    // Flagged posts never reach the public feed — for anyone, including their
    // own author. They only exist in the staff Work tab's queue until a
    // moderator approves (or removes) them.
    opportunities = opportunities.filter(o => !o.flagged);

    const enriched = await Promise.all(opportunities.map(opp => enrichOppWithCoords(opp, req.user)));
    
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
    const mine = allOpps.filter(o => o.created_by === req.user.id && !o.flagged);
    
    const enriched = await Promise.all(mine.map(opp => enrichOppWithCoords(opp, req.user)));
    
    res.json({ opportunities: enriched });
  } catch (e) {
    console.error('Get mine error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/opportunities/:id ───────────────────────────────
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const opp = await store.getOpportunity(req.params.id);
    
    if (!opp) {
      return res.status(404).json({ error: 'Opportunity not found' });
    }
    
    // Held-from-feed posts are only visible to their author (and admins).
    if (opp.flagged && (!req.user || (opp.created_by !== req.user.id && req.user.id !== 'admin_larpable'))) {
      return res.status(404).json({ error: 'Opportunity not found' });
    }
    
    // store.getOpportunity() already decrypts — use fields directly
    const decrypted = opp.encrypted_fields || {};
    
    // Clear read states
    if (req.user && decrypted.comments) {
      let changed = false;
      
      // Clear OP read
      if (req.user.id === opp.created_by) {
        for (const c of decrypted.comments) {
          if (c.read_by_op === false) {
            c.read_by_op = true;
            changed = true;
          }
        }
      }
      
      // Clear comment author read
      for (const c of decrypted.comments) {
        if (c.user_id === req.user.id && Array.isArray(c.replies)) {
          for (const r of c.replies) {
            if (r.read_by_parent_author === false) {
              r.read_by_parent_author = true;
              changed = true;
            }
          }
        }
      }
      
      if (changed) {
        opp.encrypted_fields = require('../crypto').encryptObject(decrypted);
        // Don't block
        store.saveOpportunity(opp.id, opp).catch(() => {});
      }
    }
    
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
      flagged: opp.flagged || false,
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

    const opportunityPreference = cleanFields.opportunity_preference || DEFAULT_OPPORTUNITY_PREFERENCE[type];
    if (!OPPORTUNITY_PREFERENCES.has(opportunityPreference)) {
      return res.status(400).json({ error: 'Invalid opportunity preference' });
    }

    const oppId = auth.generateOpportunityId(cleanFields.title, Date.now().toString());
    
    // Build issuer info from user profile
    const userFields = decryptObject(req.user.encrypted_fields || {});
    const issuerName = [userFields.firstName || userFields.first_name, userFields.lastName || userFields.last_name].filter(Boolean).join(' ') || 'Student';
    const issuerContext = [userFields.grade].filter(Boolean).join(', ');
    
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
        latitude: cleanFields.latitude || null,
        longitude: cleanFields.longitude || null,
        contact_links: Array.isArray(cleanFields.contact_links) ? cleanFields.contact_links.filter(l => l && l.trim()) : (cleanFields.contact ? [cleanFields.contact] : []),
        skills: normalizeOpportunitySkills(cleanFields.skills || []),
        details: cleanFields.details || '',
        opportunity_preference: opportunityPreference,
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

    // Profanity filter: any prohibited word in the new post's input fields
    // flags it — held from the public feed until a staff member acts, and the
    // author is told the post is under review.
    const scan = scanFields(oppData.encrypted_fields);
    applyFlag(oppData, scan, oppData.created_at);
    const flagged = scan.flagged;

    oppData.encrypted_fields = encryptObject(oppData.encrypted_fields);
    
    await store.saveOpportunity(oppId, oppData);
    
    res.json(flagged
      ? { id: oppId, flagged: true, message: flagNotice(scan.terms) }
      : { id: oppId });
  } catch (e) {
    console.error('Create opportunity error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});


// ── POST /api/opportunities/:id/comments ─────────────────────
router.post('/:id/comments', requireAuth, async (req, res) => {
  try {
    const opp = await store.getById('opportunities.json', req.params.id);
    if (!opp) return res.status(404).json({ error: 'Opportunity not found' });
    
    // Held-from-feed posts are only visible to their author (and admins).
    if (opp.flagged && opp.created_by !== req.user.id && req.user.id !== 'admin_larpable') {
      return res.status(404).json({ error: 'Opportunity not found' });
    }

    const text = req.body.text || '';
    if (!text.trim()) {
      return res.status(400).json({ error: 'Comment cannot be empty' });
    }

    const words = text.trim().split(/\s+/);
    if (words.length > 200) {
      return res.status(400).json({ error: 'Comment exceeds 200 words limit' });
    }

    // Apply profanity filter
    const scan = scanFields({ text });
    if (scan.flagged) {
      return res.status(400).json({ error: 'Profanity detected. Comment not accepted.' });
    }

    const currentFields = decryptObject(opp.encrypted_fields || {});
    const comments = currentFields.comments || [];
    
    // Get user details for author name
    const userFields = decryptObject(req.user.encrypted_fields || {});
    const authorName = [userFields.firstName || userFields.first_name, userFields.lastName || userFields.last_name].filter(Boolean).join(' ') || req.user.username || 'Anonymous';

    const newComment = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      user_id: req.user.id,
      user_name: authorName,
      text: sanitizeObject({ text }).text,
      created_at: new Date().toISOString(),
      read_by_op: req.user.id === opp.created_by
    };

    comments.push(newComment);
    currentFields.comments = comments;

    opp.encrypted_fields = encryptObject(currentFields);
    await store.saveOpportunity(req.params.id, opp);

    res.json({ ok: true, comment: newComment });
  } catch (e) {
    console.error('Add comment error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});


// ── POST /api/opportunities/:id/comments/:commentId/replies ──
router.post('/:id/comments/:commentId/replies', requireAuth, async (req, res) => {
  try {
    const opp = await store.getById('opportunities.json', req.params.id);
    if (!opp) return res.status(404).json({ error: 'Opportunity not found' });
    
    if (opp.flagged && opp.created_by !== req.user.id && req.user.id !== 'admin_larpable') {
      return res.status(404).json({ error: 'Opportunity not found' });
    }

    const text = req.body.text || '';
    if (!text.trim()) {
      return res.status(400).json({ error: 'Reply cannot be empty' });
    }

    const words = text.trim().split(/\s+/);
    if (words.length > 200) {
      return res.status(400).json({ error: 'Reply exceeds 200 words limit' });
    }

    const scan = scanFields({ text });
    if (scan.flagged) {
      return res.status(400).json({ error: 'Profanity detected. Reply not accepted.' });
    }

    const currentFields = decryptObject(opp.encrypted_fields || {});
    const comments = currentFields.comments || [];
    
    const comment = comments.find(c => c.id === req.params.commentId);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const userFields = decryptObject(req.user.encrypted_fields || {});
    const authorName = [userFields.firstName || userFields.first_name, userFields.lastName || userFields.last_name].filter(Boolean).join(' ') || req.user.username || 'Anonymous';

    const newReply = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      user_id: req.user.id,
      user_name: authorName,
      text: sanitizeObject({ text }).text,
      created_at: new Date().toISOString(),
      read_by_parent_author: req.user.id === comment.user_id
    };

    if (!comment.replies) comment.replies = [];
    comment.replies.push(newReply);
    
    currentFields.comments = comments;
    opp.encrypted_fields = encryptObject(currentFields);
    await store.saveOpportunity(req.params.id, opp);

    res.json({ ok: true, reply: newReply });
  } catch (e) {
    console.error('Add reply error:', e);
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
    
    if (opp.created_by !== req.user.id && req.user.id !== 'admin_larpable') {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    // Get current decrypted fields
    const currentFields = decryptObject(opp.encrypted_fields || {});
    
    // Merge updates — whitelist of safe fields only (Issue #8 fix)
    // 'created_by', 'id', 'created_at' are NEVER overwritable.
    // 'type' is handled separately below.
    const allowedFields = ['title', 'description', 'looking_for', 'location', 'remote', 'contact_links', 'skills', 'details', 'nonprofit_field', 'industry', 'opportunity_preference'];
    const updates = {};
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }
    if (updates.opportunity_preference !== undefined && !OPPORTUNITY_PREFERENCES.has(updates.opportunity_preference)) {
      return res.status(400).json({ error: 'Invalid opportunity preference' });
    }
    const nextType = req.body.type && ['project', 'nonprofit', 'company'].includes(req.body.type)
      ? req.body.type
      : opp.type;
    const updatedFields = { ...currentFields, ...sanitizeObject(updates) };
    if (updates.skills !== undefined) {
      updatedFields.skills = normalizeOpportunitySkills(updatedFields.skills);
    }
    if (!OPPORTUNITY_PREFERENCES.has(updatedFields.opportunity_preference)) {
      updatedFields.opportunity_preference = DEFAULT_OPPORTUNITY_PREFERENCE[nextType] || 'unpaid';
    }
    
    // Edits are re-scanned too, so profanity can't slip in after approval.
    const scan = scanFields(updatedFields);
    applyFlag(opp, scan, new Date().toISOString());

    // Re-encrypt
    opp.encrypted_fields = encryptObject(updatedFields);
    
    // Type can only be changed to valid values
    opp.type = nextType;
    
    await store.saveOpportunity(req.params.id, opp);
    
    res.json(scan.flagged
      ? { ok: true, flagged: true, message: flagNotice(scan.terms) }
      : { ok: true });
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
    
    if (opp.created_by !== req.user.id && req.user.id !== 'admin_larpable') {
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

function enrichOpp(opp, user) {
  // store.getAllOpportunities() already decrypts, so use fields directly
  const f = opp.encrypted_fields || opp;
  
  let unread_reply_comment_id = null;
  if (user && Array.isArray(f.comments)) {
    for (const c of f.comments) {
      if (c.user_id === user.id) {
        if (Array.isArray(c.replies) && c.replies.some(r => r.read_by_parent_author === false)) {
          unread_reply_comment_id = c.id;
          break;
        }
      }
    }
  }

  return {
    id: opp.id,
    unread_reply_comment_id,
    type: opp.type,
    title: f.title || '',
    issuer_name: f.issuer_name || '',
    issuer_context: f.issuer_context || '',
    description: f.description || '',
    looking_for: f.looking_for || '',
    location: f.location || '',
    remote: f.remote !== undefined ? f.remote : true,
    latitude: f.latitude || null,
    longitude: f.longitude || null,
    contact_links: Array.isArray(f.contact_links) ? f.contact_links : (f.contact ? [f.contact] : []),
    skills: f.skills || [],
    details: f.details || '',
    opportunity_preference: f.opportunity_preference || DEFAULT_OPPORTUNITY_PREFERENCE[opp.type] || 'unpaid',
    nonprofit_field: f.nonprofit_field || '',
    industry: f.industry || '',
    flagged: !!opp.flagged,
    created_by: opp.created_by || '',
    created_at: opp.created_at || '',
    posted: opp.created_at ? formatPosted(opp.created_at) : 'Recently',
    has_unread_comments: !!user && user.id === opp.created_by
      && Array.isArray(f.comments) && f.comments.some(c => c.read_by_op === false)
  };
}

/**
 * Enrich an opportunity with lat/long, deriving from location if missing.
 * Persists derived coordinates back to the store.
 */
async function enrichOppWithCoords(opp, user) {
  const enriched = enrichOpp(opp, user);

  // If lat/long already present, return as-is
  if (enriched.latitude && enriched.longitude) return enriched;

  // Skip remote opportunities with no useful location
  if (!enriched.location || enriched.location.toLowerCase() === 'remote') return enriched;

  // Derive from location string
  try {
    const coords = await geocode(enriched.location);
    if (coords) {
      enriched.latitude = coords.lat;
      enriched.longitude = coords.lon;

      // Persist back to store (fire-and-forget, don't block response)
      store.getById('opportunities.json', opp.id).then(raw => {
        if (!raw) return;
        const currentFields = decryptObject(raw.encrypted_fields || {});
        currentFields.latitude = coords.lat;
        currentFields.longitude = coords.lon;
        raw.encrypted_fields = encryptObject(currentFields);
        return store.saveOpportunity(opp.id, raw);
      }).catch(() => {});
    }
  } catch (e) {
    // Non-fatal — just return without coordinates
  }

  return enriched;
}

module.exports = router;
