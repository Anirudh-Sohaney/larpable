/** Shared comment/reply behavior for opportunity and regular posts. */
const express=require('express');
const store=require('../store');
const {encryptObject,decryptObject}=require('../crypto');
const {sanitizeObject}=require('../sanitize');
const {scanText}=require('../profanity');
function addCommentPermissions(comments, user) {
  if (!Array.isArray(comments)) return;
  const canModerateAny = user?.encrypted_fields?.username === 'anisohaney';
  for (const comment of comments) {
    if (!comment || typeof comment !== 'object') continue;
    comment.can_edit = !!user && comment.user_id === user.id;
    comment.can_delete = comment.can_edit || canModerateAny;
    for (const reply of Array.isArray(comment.replies) ? comment.replies : []) {
      if (!reply || typeof reply !== 'object') continue;
      reply.can_edit = !!user && reply.user_id === user.id;
      reply.can_delete = reply.can_edit || canModerateAny;
    }
  }
}
function commentsRouter(file,requireAuth){
  const router=express.Router();
  const notFound=file==='posts.json' ? 'Post not found' : 'Opportunity not found';
// ── POST /api/opportunities/:id/comments ─────────────────────
router.post('/:id/comments', requireAuth, async (req, res) => {
  try {
    const opp = await store.getById(file, req.params.id);
    if (!opp) return res.status(404).json({ error: notFound });
    
    // Held-from-feed posts are only visible to their author (and admins).
    if (opp.flagged && opp.created_by !== req.user.id && req.user.id !== 'admin_larpable') {
      return res.status(404).json({ error: notFound });
    }

    const text = req.body?.text;
    if (typeof text !== 'string') return res.status(400).json({ error: 'Comment text is required' });
    const cleanText = sanitizeObject({ text }).text;
    if (!cleanText) {
      return res.status(400).json({ error: 'Comment cannot be empty' });
    }

    const words = cleanText.split(/\s+/);
    if (words.length > 200) {
      return res.status(400).json({ error: 'Comment exceeds 200 words limit' });
    }

    // Apply profanity filter
    if (scanText(cleanText)) {
      return res.status(400).json({ error: 'Profanity detected. Comment not accepted.' });
    }

    // Get user details for author name
    const userFields = req.user.encrypted_fields || {};
    const authorName = [userFields.firstName || userFields.first_name, userFields.lastName || userFields.last_name].filter(Boolean).join(' ') || req.user.username || 'Anonymous';

    const newComment = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      user_id: req.user.id,
      user_name: authorName,
      text: cleanText,
      created_at: new Date().toISOString(),
      read_by_op: req.user.id === opp.created_by
    };

    await store.atomicUpdate(file, async opportunities => {
      await require('../deleted_users').requireActive(req.user.id);
      const latest = opportunities[req.params.id];
      if (!latest || (latest.flagged && latest.created_by !== req.user.id && req.user.id !== 'admin_larpable')) {
        throw Object.assign(new Error(notFound), { status: 404, expectedStoreConflict: true });
      }
      const currentFields = decryptObject(latest.encrypted_fields || {});
      const comments = Array.isArray(currentFields.comments) ? currentFields.comments : [];
      comments.push(newComment);
      currentFields.comments = comments;
      latest.encrypted_fields = encryptObject(currentFields);
      return opportunities;
    });

    res.json({ ok: true, comment: { ...newComment, can_edit: true, can_delete: true } });
  } catch (e) {
    console.error('Add comment error:', e);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Server error' });
  }
});

// Comment authors may edit their own text. The authorization check happens
// inside the write queue so it applies to the current stored comment.
router.patch('/:id/comments/:commentId', requireAuth, async (req, res) => {
  try {
    const text = req.body?.text;
    if (typeof text !== 'string') return res.status(400).json({ error: 'Comment cannot be empty' });
    const cleanText = sanitizeObject({ text }).text;
    if (!cleanText) return res.status(400).json({ error: 'Comment cannot be empty' });
    if (cleanText.split(/\s+/).length > 200) return res.status(400).json({ error: 'Comment exceeds 200 words limit' });
    if (scanText(cleanText)) return res.status(400).json({ error: 'Profanity detected. Comment not accepted.' });

    let updatedComment;
    await store.atomicUpdate(file, opportunities => {
      const opp = opportunities[req.params.id];
      if (!opp) {
        throw Object.assign(new Error(notFound), { status: 404, expectedStoreConflict: true });
      }
      const fields = decryptObject(opp.encrypted_fields || {});
      const comment = (fields.comments || []).find(c => c.id === req.params.commentId);
      if (!comment) throw Object.assign(new Error('Comment not found'), { status: 404, expectedStoreConflict: true });
      if (comment.user_id !== req.user.id) throw Object.assign(new Error('Not authorized'), { status: 403, expectedStoreConflict: true });
      comment.text = cleanText;
      comment.edited_at = new Date().toISOString();
      updatedComment = comment;
      opp.encrypted_fields = encryptObject(fields);
      return opportunities;
    });
    res.json({ ok: true, comment: updatedComment });
  } catch (e) {
    if (!e.status || e.status >= 500) console.error('Edit comment error:', e);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Server error' });
  }
});

router.delete('/:id/comments/:commentId', requireAuth, async (req, res) => {
  try {
    const isAnisohaney = req.user.encrypted_fields?.username === 'anisohaney';
    await store.atomicUpdate(file, opportunities => {
      const opp = opportunities[req.params.id];
      if (!opp) {
        throw Object.assign(new Error(notFound), { status: 404, expectedStoreConflict: true });
      }
      const fields = decryptObject(opp.encrypted_fields || {});
      const comments = Array.isArray(fields.comments) ? fields.comments : [];
      const index = comments.findIndex(c => c.id === req.params.commentId);
      if (index < 0) throw Object.assign(new Error('Comment not found'), { status: 404, expectedStoreConflict: true });
      if (comments[index].user_id !== req.user.id && !isAnisohaney) {
        throw Object.assign(new Error('Not authorized'), { status: 403, expectedStoreConflict: true });
      }
      comments.splice(index, 1);
      fields.comments = comments;
      opp.encrypted_fields = encryptObject(fields);
      return opportunities;
    });
    res.json({ ok: true });
  } catch (e) {
    if (!e.status || e.status >= 500) console.error('Delete comment error:', e);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Server error' });
  }
});

router.patch('/:id/comments/:commentId/replies/:replyId', requireAuth, async (req, res) => {
  try {
    const text = req.body?.text;
    if (typeof text !== 'string') return res.status(400).json({ error: 'Reply cannot be empty' });
    const cleanText = sanitizeObject({ text }).text;
    if (!cleanText) return res.status(400).json({ error: 'Reply cannot be empty' });
    if (cleanText.split(/\s+/).length > 200) return res.status(400).json({ error: 'Reply exceeds 200 words limit' });
    if (scanText(cleanText)) return res.status(400).json({ error: 'Profanity detected. Reply not accepted.' });

    let updatedReply;
    await store.atomicUpdate(file, opportunities => {
      const opp = opportunities[req.params.id];
      if (!opp) throw Object.assign(new Error(notFound), { status: 404, expectedStoreConflict: true });
      const fields = decryptObject(opp.encrypted_fields || {});
      const comment = (fields.comments || []).find(c => c.id === req.params.commentId);
      if (!comment) throw Object.assign(new Error('Comment not found'), { status: 404, expectedStoreConflict: true });
      const reply = (comment.replies || []).find(r => r.id === req.params.replyId);
      if (!reply) throw Object.assign(new Error('Reply not found'), { status: 404, expectedStoreConflict: true });
      if (reply.user_id !== req.user.id) throw Object.assign(new Error('Not authorized'), { status: 403, expectedStoreConflict: true });
      reply.text = cleanText;
      reply.edited_at = new Date().toISOString();
      updatedReply = reply;
      opp.encrypted_fields = encryptObject(fields);
      return opportunities;
    });
    res.json({ ok: true, reply: updatedReply });
  } catch (e) {
    if (!e.status || e.status >= 500) console.error('Edit reply error:', e);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Server error' });
  }
});

router.delete('/:id/comments/:commentId/replies/:replyId', requireAuth, async (req, res) => {
  try {
    const isAnisohaney = req.user.encrypted_fields?.username === 'anisohaney';
    await store.atomicUpdate(file, opportunities => {
      const opp = opportunities[req.params.id];
      if (!opp) throw Object.assign(new Error(notFound), { status: 404, expectedStoreConflict: true });
      const fields = decryptObject(opp.encrypted_fields || {});
      const comment = (fields.comments || []).find(c => c.id === req.params.commentId);
      if (!comment) throw Object.assign(new Error('Comment not found'), { status: 404, expectedStoreConflict: true });
      const replies = Array.isArray(comment.replies) ? comment.replies : [];
      const index = replies.findIndex(r => r.id === req.params.replyId);
      if (index < 0) throw Object.assign(new Error('Reply not found'), { status: 404, expectedStoreConflict: true });
      if (replies[index].user_id !== req.user.id && !isAnisohaney) {
        throw Object.assign(new Error('Not authorized'), { status: 403, expectedStoreConflict: true });
      }
      replies.splice(index, 1);
      comment.replies = replies;
      opp.encrypted_fields = encryptObject(fields);
      return opportunities;
    });
    res.json({ ok: true });
  } catch (e) {
    if (!e.status || e.status >= 500) console.error('Delete reply error:', e);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Server error' });
  }
});


// ── POST /api/opportunities/:id/comments/:commentId/replies ──
router.post('/:id/comments/:commentId/replies', requireAuth, async (req, res) => {
  try {
    const opp = await store.getById(file, req.params.id);
    if (!opp) return res.status(404).json({ error: notFound });
    
    if (opp.flagged && opp.created_by !== req.user.id && req.user.id !== 'admin_larpable') {
      return res.status(404).json({ error: notFound });
    }

    const text = req.body?.text;
    if (typeof text !== 'string') return res.status(400).json({ error: 'Reply text is required' });
    const cleanText = sanitizeObject({ text }).text;
    if (!cleanText) {
      return res.status(400).json({ error: 'Reply cannot be empty' });
    }

    const words = cleanText.split(/\s+/);
    if (words.length > 200) {
      return res.status(400).json({ error: 'Reply exceeds 200 words limit' });
    }

    if (scanText(cleanText)) {
      return res.status(400).json({ error: 'Profanity detected. Reply not accepted.' });
    }

    const initialFields = decryptObject(opp.encrypted_fields || {});
    const comment = (initialFields.comments || []).find(c => c.id === req.params.commentId);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const userFields = req.user.encrypted_fields || {};
    const authorName = [userFields.firstName || userFields.first_name, userFields.lastName || userFields.last_name].filter(Boolean).join(' ') || req.user.username || 'Anonymous';

    const newReply = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      user_id: req.user.id,
      user_name: authorName,
      text: cleanText,
      created_at: new Date().toISOString(),
      read_by_parent_author: req.user.id === comment.user_id
    };

    await store.atomicUpdate(file, async opportunities => {
      await require('../deleted_users').requireActive(req.user.id);
      const latest = opportunities[req.params.id];
      if (!latest || (latest.flagged && latest.created_by !== req.user.id && req.user.id !== 'admin_larpable')) {
        throw Object.assign(new Error(notFound), { status: 404, expectedStoreConflict: true });
      }
      const currentFields = decryptObject(latest.encrypted_fields || {});
      const comments = Array.isArray(currentFields.comments) ? currentFields.comments : [];
      const latestComment = comments.find(c => c.id === req.params.commentId);
      if (!latestComment) throw Object.assign(new Error('Comment not found'), { status: 404, expectedStoreConflict: true });
      if (!Array.isArray(latestComment.replies)) latestComment.replies = [];
      latestComment.replies.push(newReply);
      currentFields.comments = comments;
      latest.encrypted_fields = encryptObject(currentFields);
      return opportunities;
    });

    res.json({ ok: true, reply: { ...newReply, can_edit: true, can_delete: true } });
  } catch (e) {
    console.error('Add reply error:', e);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Server error' });
  }
});


  return router;
}
module.exports={commentsRouter,addCommentPermissions};
