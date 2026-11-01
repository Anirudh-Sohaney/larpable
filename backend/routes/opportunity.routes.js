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
const { scanFields, scanText, applyFlag, flagNotice } = require('../profanity');
const applicationsStore = require('../applications');
const { notifyPosterOfApplication } = require('../reengagement');
const { normalizeSkills, normalizeField } = require('../canonical');
const { validatePostContent } = require('../post_content');

const OPPORTUNITY_PREFERENCES = new Set(['volunteering', 'paid', 'unpaid']);
const DEFAULT_OPPORTUNITY_PREFERENCE = { project: 'unpaid', nonprofit: 'volunteering', company: 'paid' };

const {addCommentPermissions} = require('./comments.routes');

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

    // Anonymous visitors (including guests who entered via "Get started") only
    // ever receive the newest six posts. This cap lives on the server so it
    // cannot be bypassed by hitting the API directly.
    const total = opportunities.length;
    if (!req.user) {
      opportunities = [...opportunities]
        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
        .slice(0, 6);
    }

    const enriched = await Promise.all(opportunities.map(opp => enrichOppWithCoords(opp, req.user)));
    const applications = req.user ? await applicationsStore.read() : {};
    enriched.forEach(opp => addApplicationSummary(opp, req.user, applications));
    
    res.json({ opportunities: enriched, total });
  } catch (e) {
    console.error('Get opportunities error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/opportunities/mine ──────────────────────────────
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const mine = await store.getAllOpportunities(null,{createdBy:req.user.id});
    
    const enriched = await Promise.all(mine.map(opp => enrichOppWithCoords(opp, req.user)));
    const applications = await applicationsStore.read();
    enriched.forEach(opp => addApplicationSummary(opp, req.user, applications));
    
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
    const applications = req.user ? await applicationsStore.read() : {};
    const applicants = applications[opp.id] || {};
    
    // Clear read states
    if (req.user && req.query.view !== 'applications' && decrypted.comments) {
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
        const seenCommentIds = new Set(decrypted.comments.map(comment => comment.id));
        const seenReplyIds = new Map(decrypted.comments.map(comment => [comment.id, new Set((comment.replies || []).map(reply => reply.id))]));
        await store.atomicUpdate('opportunities.json', opportunities => {
          const latest = opportunities[opp.id];
          if (!latest) return opportunities;
          const latestFields = decryptObject(latest.encrypted_fields || {});
          for (const comment of latestFields.comments || []) {
            if (req.user.id === latest.created_by && seenCommentIds.has(comment.id)) comment.read_by_op = true;
            if (comment.user_id === req.user.id) {
              for (const reply of comment.replies || []) {
                if (seenReplyIds.get(comment.id)?.has(reply.id)) reply.read_by_parent_author = true;
              }
            }
          }
          latest.encrypted_fields = encryptObject(latestFields);
          return opportunities;
        });
      }
    }
    
    addCommentPermissions(decrypted.comments, req.user);

    let issuer = null;
    if (opp.created_by) {
      const user = await store.getUser(opp.created_by);
      if (user) {
        // store.getUser() already decrypts — use encrypted_fields directly
        const userFields = user.encrypted_fields || {};
        issuer = {
          name: [userFields.firstName || userFields.first_name, userFields.lastName || userFields.last_name].filter(Boolean).join(' ')
            || userFields.org_name || userFields.company_name || 'Anonymous',
          // Contact details are withheld from anonymous readers; the client
          // shows a blurred lock instead of a link.
          email: req.user ? (userFields.email || '') : ''
        };
      }
    }

    // Never send contact channels to anonymous readers. This is the real
    // guarantee behind the blurred "Contact / sign-up" panel — there is
    // nothing in the payload to reveal via dev tools.
    const publicFields = { ...decrypted };
    if (!req.user) {
      delete publicFields.contact_links;
      delete publicFields.contact;
    }
    
    res.json({
      id: opp.id,
      promoted:opp.promoted===true,
      type: opp.type,
      project_id: opp.project_id,
      project: opp.project,
      created_by: opp.created_by || '',
      created_at: opp.created_at,
      flagged: opp.flagged || false,
      fields: publicFields,
      issuer,
      application: req.user ? {
        applied: !!applicants[req.user.id],
        count: req.user.id === opp.created_by ? Object.keys(applicants).length : undefined,
        has_unread: req.user.id === opp.created_by && Object.values(applicants).some(entry => !entry.read_at)
      } : null
    });
  } catch (e) {
    console.error('Get opportunity error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Applications are private to the post owner. Store identifiers and timestamps;
// fetch current profile fields only when the owner opens the applicant list.
router.post('/:id/applications', requireAuth, async (req, res) => {
  try {
    const opportunity = await store.getById('opportunities.json', req.params.id);
    if (!opportunity || opportunity.flagged) return res.status(404).json({ error: 'Opportunity not found' });
    if (opportunity.created_by === req.user.id) return res.status(403).json({ error: 'You cannot apply to your own post' });
    let created = false;
    await store.atomicUpdate(applicationsStore.FILE, async applications => {
      await require('../deleted_users').requireActive(req.user.id);
      const applicants = applications[req.params.id] ||= {};
      if (!applicants[req.user.id]) {
        applicants[req.user.id] = { applied_at: new Date().toISOString(), read_at: null };
        created = true;
      }
      return applications;
    });
    res.status(created ? 201 : 200).json({ applied: true, already_applied: !created });
    // Notify the poster of genuinely new applications. Fire-and-forget after
    // the response so email delivery can never fail or slow down the apply.
    if (created) notifyPosterOfApplication(req.params.id).catch(() => {});
  } catch (error) {
    console.error('Apply error:', error);
    res.status(500).json({ error: 'Could not save application' });
  }
});

router.get('/:id/applications', requireAuth, async (req, res) => {
  try {
    const opportunity = await store.getById('opportunities.json', req.params.id);
    if (!opportunity) return res.status(404).json({ error: 'Opportunity not found' });
    if (opportunity.created_by !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
    const applications = await applicationsStore.read();
    const entries = Object.entries(applications[req.params.id] || {});
    const users = await store.read('users.json');
    const opportunityFields = decryptObject(opportunity.encrypted_fields || {});
    const skillKey = value => String(value || '').trim().toLowerCase();
    const requiredSkills = new Set((Array.isArray(opportunityFields.skills) ? opportunityFields.skills : []).map(skillKey).filter(Boolean));
    const applicants = entries.map(([userId, entry]) => {
      const user = users[userId];
      if (!user) return null;
      const fields = decryptObject(user.encrypted_fields || {});
      const experiences = (Array.isArray(fields.experiences) ? fields.experiences : []).flatMap(experience => {
        if (!experience || typeof experience !== 'object' || !Array.isArray(experience.skills)) return [];
        const matchingSkills = experience.skills.filter(skill => typeof skill === 'string' && requiredSkills.has(skillKey(skill)));
        if (!matchingSkills.length) return [];
        return [{
          type: experience.type || '',
          title: experience.title || '',
          company_name: experience.company_name || '',
          description: experience.description || '',
          skills: experience.skills,
          matching_skills: matchingSkills
        }];
      });
      return {
        id: userId,
        name: [fields.first_name || fields.firstName, fields.last_name || fields.lastName].filter(Boolean).join(' ') || fields.username || 'Student',
        grade: fields.grade || '',
        skills: Array.isArray(fields.skills) ? fields.skills : [],
        experiences,
        email: fields.email || '',
        applied_at: entry.applied_at,
        unread: !entry.read_at
      };
    }).filter(Boolean).sort((a, b) => Date.parse(b.applied_at) - Date.parse(a.applied_at));
    res.json({ applicants });
  } catch (error) {
    console.error('List applications error:', error);
    res.status(500).json({ error: 'Could not load applicants' });
  }
});

router.post('/:id/applications/seen', requireAuth, async (req, res) => {
  try {
    const opportunity = await store.getById('opportunities.json', req.params.id);
    if (!opportunity) return res.status(404).json({ error: 'Opportunity not found' });
    if (opportunity.created_by !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
    const applicantIds = req.body?.applicant_ids;
    if (!Array.isArray(applicantIds) || applicantIds.length > 10000 || applicantIds.some(id => typeof id !== 'string')) {
      return res.status(400).json({ error: 'Applicant IDs are required' });
    }
    await store.atomicUpdate(applicationsStore.FILE, async applications => {
      await require('../deleted_users').requireActive(req.user.id);
      const applicants = applications[req.params.id] || {};
      for (const id of applicantIds) {
        const entry = applicants[id];
        if (!entry) continue;
        if (!entry.read_at) entry.read_at = new Date().toISOString();
      }
      return applications;
    });
    res.json({ ok: true });
  } catch (error) {
    console.error('Mark applications seen error:', error);
    res.status(500).json({ error: 'Could not mark applicants seen' });
  }
});

// ── POST /api/opportunities ──────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const {id,scan} = await require('../posts').create(req.user,req.body);
    res.json(scan.flagged ? {id,flagged:true,message:flagNotice(scan.terms)} : {id});
  } catch (e) {
    if(!e.status)console.error('Create opportunity error:', e);
    res.status(e.status || 500).json({error:e.status ? e.message : 'Server error'});
  }
});


router.use(require('./comments.routes').commentsRouter('opportunities.json',requireAuth));

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
    
    // Merge updates — whitelist of safe fields only (Issue #8 fix)
    // 'created_by', 'id', 'created_at' are NEVER overwritable.
    // 'type' is handled separately below.
    const allowedFields = [ 'description', 'looking_for', 'location', 'remote', 'contact_links', 'skills', 'details', 'opportunity_preference'];
    const updates = {};
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }
    if (updates.opportunity_preference !== undefined && !OPPORTUNITY_PREFERENCES.has(updates.opportunity_preference)) {
      return res.status(400).json({ error: 'Invalid opportunity preference' });
    }
    // Enforce the same content rules when skills/description are actually edited,
    // then store canonical values.
    const currentSkills = normalizeSkills(decryptObject(opp.encrypted_fields || {}).skills);
    const patchError = validatePostContent({
      skills: updates.skills,
      description: updates.description,
      requireSkills: updates.skills !== undefined && JSON.stringify(normalizeSkills(updates.skills)) !== JSON.stringify(currentSkills)
    });
    if (patchError) return res.status(400).json({ error: patchError });
    if (updates.skills !== undefined) updates.skills = normalizeSkills(updates.skills);
    let scan;
    await store.atomicUpdate('opportunities.json', async opportunities => {
      const latest = opportunities[req.params.id];
      if (!latest) throw Object.assign(new Error('Opportunity not found'), { status: 404, expectedStoreConflict: true });
      if (latest.created_by !== req.user.id && req.user.id !== 'admin_larpable') {
        throw Object.assign(new Error('Not authorized'), { status: 403, expectedStoreConflict: true });
      }
      latest.promoted=await require('../promotion').value(req.body.promoted,req.user.id,latest.created_by,latest.promoted);
      const currentFields = decryptObject(latest.encrypted_fields || {});
      const nextType = (await require('../projects').get(latest.project_id))?.type || latest.type;
      const updatedFields = { ...currentFields, ...sanitizeObject(updates) };
      delete updatedFields.title;
      if (!OPPORTUNITY_PREFERENCES.has(updatedFields.opportunity_preference)) {
        updatedFields.opportunity_preference = DEFAULT_OPPORTUNITY_PREFERENCE[nextType] || 'unpaid';
      }
      scan = scanFields(updatedFields);
      applyFlag(latest, scan, new Date().toISOString());
      latest.encrypted_fields = encryptObject(updatedFields);
      latest.type = nextType;
      return opportunities;
    });
    
    res.json(scan.flagged
      ? { ok: true, flagged: true, message: flagNotice(scan.terms) }
      : { ok: true });
  } catch (e) {
    console.error('Update opportunity error:', e);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Server error' });
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
    await applicationsStore.removeOpportunity(req.params.id);
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
  const weeks = Math.floor(diffDays / 7);
  return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
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
    promoted:opp.promoted===true,
    kind: 'opportunity',
    unread_reply_comment_id,
    type: opp.type,
    project_id: opp.project_id,
    project_name: opp.project_name,
    issuer_name: f.issuer_name || '',
    issuer_context: f.issuer_context || '',
    description: f.description || '',
    looking_for: f.looking_for || '',
    location: f.location || '',
    remote: f.remote !== undefined ? f.remote : true,
    latitude: f.latitude || null,
    longitude: f.longitude || null,
    // Contact links are private to signed-in readers.
    contact_links: user ? (Array.isArray(f.contact_links) ? f.contact_links : (f.contact ? [f.contact] : [])) : [],
    skills: f.skills || [],
    details: f.details || '',
    opportunity_preference: f.opportunity_preference || DEFAULT_OPPORTUNITY_PREFERENCE[opp.type] || 'unpaid',
    field: opp.project?.fields.field || '',
    nonprofit_field: opp.type==='nonprofit' ? (opp.project?.fields.field || '') : '',
    industry: opp.type==='company' ? (opp.project?.fields.field || '') : '',
    flagged: !!opp.flagged,
    created_by: opp.created_by || '',
    created_at: opp.created_at || '',
    posted: opp.created_at ? formatPosted(opp.created_at) : 'Recently',
    has_unread_comments: !!user && user.id === opp.created_by
      && Array.isArray(f.comments) && f.comments.some(c => c.read_by_op === false),
    latest_unread_comment_at: !!user && user.id === opp.created_by && Array.isArray(f.comments)
      ? f.comments.reduce((latest, comment) => comment.read_by_op === false && comment.created_at > latest ? comment.created_at : latest, '')
      : ''
  };
}

function addApplicationSummary(opp, user, applications) {
  if (!user || opp.created_by !== user.id) return;
  const entries = Object.values(applications[opp.id] || {});
  opp.application_count = entries.length;
  const unread = entries.filter(entry => !entry.read_at);
  opp.has_unread_applications = unread.length > 0;
  opp.latest_unread_application_at = unread.reduce((latest, entry) =>
    entry.applied_at > latest ? entry.applied_at : latest, '');
  opp.latest_notification_at = [opp.latest_unread_application_at, opp.latest_unread_comment_at].sort().pop() || '';
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

      // Merge inside the write queue so a concurrent comment or edit survives.
      store.atomicUpdate('opportunities.json', opportunities => {
        const raw = opportunities[opp.id];
        if (!raw) return opportunities;
        const currentFields = decryptObject(raw.encrypted_fields || {});
        if (currentFields.location !== enriched.location) return opportunities;
        currentFields.latitude = coords.lat;
        currentFields.longitude = coords.lon;
        raw.encrypted_fields = encryptObject(currentFields);
        return opportunities;
      }).catch(() => {});
    }
  } catch (e) {
    // Non-fatal — just return without coordinates
  }

  return enriched;
}

router.listForFeed=async(user,mine=false,projectId=null)=>{
  const posts=await store.getAllOpportunities(null,{projectId,createdBy:mine ? user.id : null,approvedOnly:!mine});
  const applications=user ? await applicationsStore.read() : {};
  const rows=await Promise.all(posts.map(p=>enrichOppWithCoords(p,user)));
  rows.forEach(p=>addApplicationSummary(p,user,applications));
  return rows;
};
module.exports = router;
