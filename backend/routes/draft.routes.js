/**
 * LARPABLE — Draft Routes
 *
 * GET    /api/drafts          — list all drafts for current user
 * POST   /api/drafts          — create or update a draft (auto-save)
 * DELETE /api/drafts/:id      — delete a draft
 * POST   /api/drafts/:id/publish — convert draft to a real opportunity
 *
 * Max 5 drafts per user. When a 6th is created, the oldest (least recently
 * updated) draft is automatically deleted.
 *
 * Drafts are stored in data/drafts.json (plaintext fields — private to user).
 */

const express = require('express');
const router = express.Router();
const auth = require('../auth');
const store = require('../store');
const { encryptObject } = require('../crypto');
const { sanitizeObject } = require('../sanitize');

const DRAFTS_FILE = 'drafts.json';
const MAX_DRAFTS = 5;

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

// ── GET /api/drafts ──────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const allDrafts = await store.getAll(DRAFTS_FILE);
    const userDrafts = Object.entries(allDrafts)
      .filter(([, d]) => d.user_id === req.user.id)
      .map(([id, d]) => ({
        id,
        user_id: d.user_id,
        type: d.type,
        fields: d.fields || {},
        created_at: d.created_at,
        updated_at: d.updated_at
      }))
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

    res.json({ drafts: userDrafts });
  } catch (e) {
    console.error('Get drafts error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/drafts ─────────────────────────────────────────
// If body contains `id`, update existing draft. Otherwise, create new.
router.post('/', requireAuth, async (req, res) => {
  try {
    const { id: existingId, type, ...fields } = req.body;

    if (!type || !['project', 'nonprofit', 'company'].includes(type)) {
      return res.status(400).json({ error: 'Valid type is required (project, nonprofit, company)' });
    }

    const now = new Date().toISOString();

    if (existingId) {
      // ── UPDATE existing draft ──
      const draft = await store.getById(DRAFTS_FILE, existingId);
      if (!draft) {
        return res.status(404).json({ error: 'Draft not found' });
      }
      if (draft.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      draft.fields = sanitizeObject(fields);
      draft.type = type;
      draft.updated_at = now;

      await store.atomicUpdate(DRAFTS_FILE, (data) => {
        data[existingId] = draft;
        return data;
      });

      return res.json({ id: existingId, updated: true });
    }

    // ── CREATE new draft ──
    const draftId = 'draft_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);

    // Enforce max 5 drafts per user — delete oldest first
    const allDrafts = await store.getAll(DRAFTS_FILE);
    const userDrafts = Object.entries(allDrafts)
      .filter(([, d]) => d.user_id === req.user.id)
      .sort((a, b) => new Date(a[1].updated_at || a[1].created_at) - new Date(b[1].updated_at || b[1].created_at));

    if (userDrafts.length >= MAX_DRAFTS) {
      // Delete the oldest draft(s) to make room
      const toDelete = userDrafts.slice(0, userDrafts.length - MAX_DRAFTS + 1);
      await store.atomicUpdate(DRAFTS_FILE, (data) => {
        for (const [deleteId] of toDelete) {
          delete data[deleteId];
        }
        data[draftId] = {
          user_id: req.user.id,
          type,
          fields: sanitizeObject(fields),
          created_at: now,
          updated_at: now
        };
        return data;
      });
    } else {
      await store.atomicUpdate(DRAFTS_FILE, (data) => {
        data[draftId] = {
          user_id: req.user.id,
          type,
          fields: sanitizeObject(fields),
          created_at: now,
          updated_at: now
        };
        return data;
      });
    }

    res.json({ id: draftId, created: true });
  } catch (e) {
    console.error('Create/update draft error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /api/drafts/:id ───────────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const draft = await store.getById(DRAFTS_FILE, req.params.id);
    if (!draft) {
      return res.status(404).json({ error: 'Draft not found' });
    }
    if (draft.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await store.atomicUpdate(DRAFTS_FILE, (data) => {
      delete data[req.params.id];
      return data;
    });

    res.json({ ok: true });
  } catch (e) {
    console.error('Delete draft error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/drafts/:id/publish ─────────────────────────────
// Convert a draft into a real opportunity, then delete the draft.
router.post('/:id/publish', requireAuth, async (req, res) => {
  try {
    const draft = await store.getById(DRAFTS_FILE, req.params.id);
    if (!draft) {
      return res.status(404).json({ error: 'Draft not found' });
    }
    if (draft.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const fields = draft.fields || {};
    const type = draft.type;

    if (!fields.title) {
      return res.status(400).json({ error: 'Draft must have a title to publish' });
    }

    // Build opportunity data (same structure as opportunity.routes.js POST)
    const oppId = auth.generateOpportunityId(fields.title, Date.now().toString());

    // Build issuer info from user profile
    const userRaw = await store.getRawUser(req.user.id);
    const userDecrypted = userRaw
      ? require('../crypto').decryptObject(userRaw.encrypted_fields || {})
      : {};
    const issuerName = [userDecrypted.firstName || userDecrypted.first_name, userDecrypted.lastName || userDecrypted.last_name].filter(Boolean).join(' ') || 'Student';
    const issuerContext = [userDecrypted.grade, userDecrypted.school].filter(Boolean).join(', ');

    const oppData = {
      type,
      created_by: req.user.id,
      created_at: new Date().toISOString(),
      encrypted_fields: encryptObject({
        title: fields.title || '',
        description: fields.description || '',
        issuer_name: issuerName,
        issuer_context: issuerContext,
        looking_for: fields.looking_for || '',
        location: fields.location || '',
        remote: fields.remote !== undefined ? fields.remote : true,
        contact_links: Array.isArray(fields.contact_links) ? fields.contact_links.filter(l => l && l.trim()) : (fields.contact ? [fields.contact] : []),
        skills: fields.skills || [],
        details: fields.details || '',
        ...(type === 'nonprofit' && { nonprofit_field: fields.nonprofit_field || '' }),
        ...(type === 'company' && { industry: fields.industry || '' })
      })
    };

    // Save opportunity and delete draft atomically
    await store.saveOpportunity(oppId, oppData);
    await store.atomicUpdate(DRAFTS_FILE, (data) => {
      delete data[req.params.id];
      return data;
    });

    res.json({ id: oppId, published: true });
  } catch (e) {
    console.error('Publish draft error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
