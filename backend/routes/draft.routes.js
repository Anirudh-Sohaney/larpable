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
 *
 * Publishing a draft goes through the same profanity gate as creating a post:
 * if any field contains prohibited language the new post is stored flagged and
 * held from the public feed until a staff member approves it.
 */

const express = require('express');
const router = express.Router();
const auth = require('../auth');
const store = require('../store');
const {flagNotice} = require('../profanity');
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
    const assets = await store.read('media.json');
    const projects = Object.fromEntries((await require('../projects').mine(req.user.id)).map(p=>[p.id,p]));
    const userDrafts = Object.entries(allDrafts)
      .filter(([, d]) => d.user_id === req.user.id)
      .map(([id, d]) => ({
        id,
        user_id: d.user_id,
        type: projects[d.project_id]?.type || d.type,
        project_id: d.project_id,
        kind: d.kind || 'opportunity',
        media_id: d.media_id || null,
        media: require('../media').publicMedia(assets[d.media_id]),
        project_name: projects[d.project_id]?.fields.name || '',
        fields: d.fields || {},
        created_at: d.created_at,
        updated_at: d.updated_at
      }))
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

    res.json({ drafts: userDrafts });
  } catch (e) {
    console.error('Get drafts error:', e);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Server error' });
  }
});

// ── POST /api/drafts ─────────────────────────────────────────
// If body contains `id`, update existing draft. Otherwise, create new.
router.post('/', requireAuth, async (req, res) => {
  try {
    const { id: existingId, project_id, kind='opportunity', media_id=null, type: ignoredType, ...inputFields } = req.body;
    if(!['post','opportunity'].includes(kind))throw require('../projects').fail('Invalid post kind');
    const fields=kind==='post' ? {title:inputFields.title || '',content:inputFields.content || ''} : inputFields;
    if(kind==='opportunity')delete fields.title;
    return await require('../projects').withOwned(project_id,req.user.id,async project=>{
    const type = project.type;
    const asset=kind==='post' ? await require('../media').validateRef(media_id,req.user.id,project.id) : null;

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

      const oldMedia=draft.media_id;
      draft.kind=kind;draft.media_id=asset?.id || null;
      draft.fields = sanitizeObject(fields);
      draft.type = type;
      draft.project_id = project.id;
      draft.updated_at = now;

      await store.atomicUpdate(DRAFTS_FILE, async (data) => {
        await require('../deleted_users').requireActive(req.user.id);
        if(!data[existingId])throw require('../projects').fail('Draft not found',404);
        if(data[existingId].user_id!==req.user.id)throw require('../projects').fail('Not authorized',403);
        data[existingId] = draft;
        return data;
      });

      if(oldMedia!==draft.media_id)await require('../media').releaseIfUnused(oldMedia);
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
      await store.atomicUpdate(DRAFTS_FILE, async (data) => {
        await require('../deleted_users').requireActive(req.user.id);
        for (const [deleteId] of toDelete) {
          delete data[deleteId];
        }
        data[draftId] = {
          user_id: req.user.id,
          project_id: project.id,
          kind,media_id:asset?.id || null,
          type,
          fields: sanitizeObject(fields),
          created_at: now,
          updated_at: now
        };
        return data;
      });
      for(const [,draft] of toDelete)await require('../media').releaseIfUnused(draft.media_id);
    } else {
      await store.atomicUpdate(DRAFTS_FILE, async (data) => {
        await require('../deleted_users').requireActive(req.user.id);
        data[draftId] = {
          user_id: req.user.id,
          project_id: project.id,
          kind,media_id:asset?.id || null,
          type,
          fields: sanitizeObject(fields),
          created_at: now,
          updated_at: now
        };
        return data;
      });
    }

    res.json({ id: draftId, created: true });
    });
  } catch (e) {
    if(!e.status)console.error('Create/update draft error:', e);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Server error' });
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

    const remove=async()=>{
      await store.atomicUpdate(DRAFTS_FILE,data=>{delete data[req.params.id];return data;});
      await require('../media').releaseIfUnused(draft.media_id);
    };
    if(draft.project_id)await require('../projects').withOwned(draft.project_id,req.user.id,remove);
    else await remove();

    res.json({ ok: true });
  } catch (e) {
    console.error('Delete draft error:', e);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Server error' });
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

    const result = draft.kind==='post'
      ? await require('../regular_posts').create(req.user,{...draft.fields,project_id:draft.project_id,media_id:draft.media_id})
      : await require('../posts').create(req.user,{...draft.fields,project_id:draft.project_id});
    const {id:oppId,scan}=result;
    const flagged=!!scan?.flagged;

    // The post is persisted before removing its draft.
    await store.atomicUpdate(DRAFTS_FILE, async (data) => {
        await require('../deleted_users').requireActive(req.user.id);
      delete data[req.params.id];
      return data;
    });

    res.json(flagged
      ? { id: oppId, published: true, flagged: true, message: flagNotice(scan.terms) }
      : { id: oppId, kind:draft.kind || 'opportunity', published: true });
  } catch (e) {
    if(!e.status)console.error('Publish draft error:', e);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Server error' });
  }
});

module.exports = router;
