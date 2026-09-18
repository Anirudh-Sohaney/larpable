const express = require('express');
const { randomUUID } = require('crypto');
const auth = require('../auth');
const store = require('../store');
const { sanitizeObject } = require('../sanitize');
const { encryptObject, decryptObject } = require('../crypto');
const {
  FEEDBACK_FILE,
  PROMPT_DELAY_MS,
  normalizeFeedbackData,
  countWords,
  userPromptState,
  hasPostFeedback,
  hasPlatformFeedback,
  userIdentity
} = require('../feedback');

const router = express.Router();

async function requireAuth(req, res, next) {
  const user = await auth.getUserFromToken(req.cookies?.larpable_session);
  if (!user) return res.status(401).json({ error: 'Authentication required' });
  req.user = user;
  next();
}

function feedbackId() {
  return `feedback_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
}

function parseSubmission(body) {
  const rating = Number(body?.rating);
  const text = String(body?.text || '').trim();
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { error: 'Choose a rating from 1 to 5 stars.' };
  }
  if (countWords(text) > 200) return { error: 'Feedback must be 200 words or fewer.' };
  return { rating, text: sanitizeObject({ text }).text };
}

router.get('/post-prompt', requireAuth, async (req, res) => {
  try {
    const opportunities = await store.getAllOpportunities(null);
    const now = Date.now();
    const authored = opportunities
      .filter(opp => !opp.flagged && opp.created_by === req.user.id && Number.isFinite(Date.parse(opp.created_at)))
      .filter(opp => now - Date.parse(opp.created_at) >= PROMPT_DELAY_MS)
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    let selected = null;

    await store.atomicUpdate(FEEDBACK_FILE, raw => {
      const data = normalizeFeedbackData(raw);
      for (const opportunity of authored) {
        if (hasPostFeedback(data, req.user.id, opportunity.id)) continue;
        const state = userPromptState(data, req.user.id, opportunity.id);
        if (state?.submitted_feedback_id) continue;
        if (state?.last_prompted_at && now - Date.parse(state.last_prompted_at) < PROMPT_DELAY_MS) continue;

        const fields = opportunity.encrypted_fields || {};
        selected = {
          opportunity_id: opportunity.id,
          title: fields.title || 'Your opportunity post',
          posted_at: opportunity.created_at
        };
        data.post_prompts[req.user.id] ||= {};
        data.post_prompts[req.user.id][opportunity.id] = {
          ...state,
          last_prompted_at: new Date(now).toISOString(),
          times_prompted: Number(state?.times_prompted || 0) + 1
        };
        break;
      }
      return data;
    });

    res.json({ prompt: selected });
  } catch (error) {
    console.error('Feedback prompt error:', error);
    res.status(500).json({ error: 'Could not load feedback prompt.' });
  }
});

router.post('/post-prompt/:opportunityId/defer', requireAuth, async (req, res) => {
  try {
    const opportunity = await store.getOpportunity(req.params.opportunityId);
    if (!opportunity || opportunity.created_by !== req.user.id) {
      return res.status(404).json({ error: 'Opportunity post not found.' });
    }
    const now = new Date().toISOString();
    let canDefer = false;
    await store.atomicUpdate(FEEDBACK_FILE, raw => {
      const data = normalizeFeedbackData(raw);
      data.post_prompts[req.user.id] ||= {};
      const state = data.post_prompts[req.user.id][opportunity.id] || {};
      if (!state.last_prompted_at || state.submitted_feedback_id) return data;
      canDefer = true;
      data.post_prompts[req.user.id][opportunity.id] = {
        ...state,
        last_prompted_at: state.last_prompted_at || now,
        last_deferred_at: now,
        times_deferred: Number(state.times_deferred || 0) + 1
      };
      return data;
    });
    if (!canDefer) return res.status(409).json({ error: 'This feedback prompt is not active.' });
    res.json({ deferred: true, next_prompt_after: new Date(Date.parse(now) + PROMPT_DELAY_MS).toISOString() });
  } catch (error) {
    console.error('Defer feedback error:', error);
    res.status(500).json({ error: 'Could not save your choice.' });
  }
});

router.post('/post', requireAuth, async (req, res) => {
  try {
    const parsed = parseSubmission(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const outcome = String(req.body?.outcome || '');
    if (!['helped', 'not_yet'].includes(outcome)) {
      return res.status(400).json({ error: 'Choose whether the post helped you.' });
    }
    const opportunityId = String(req.body?.opportunity_id || '');
    const opportunity = await store.getOpportunity(opportunityId);
    if (!opportunity || opportunity.created_by !== req.user.id) {
      return res.status(404).json({ error: 'Opportunity post not found.' });
    }
    if (!Number.isFinite(Date.parse(opportunity.created_at)) || Date.now() - Date.parse(opportunity.created_at) < PROMPT_DELAY_MS) {
      return res.status(400).json({ error: 'Feedback is available two days after posting.' });
    }

    const id = feedbackId();
    const now = new Date().toISOString();
    const identity = userIdentity(req.user);
    let duplicate = false;
    let promptWasShown = false;
    await store.atomicUpdate(FEEDBACK_FILE, raw => {
      const data = normalizeFeedbackData(raw);
      if (hasPostFeedback(data, req.user.id, opportunityId)) {
        duplicate = true;
        return data;
      }
      const promptState = userPromptState(data, req.user.id, opportunityId);
      if (!promptState?.last_prompted_at) return data;
      promptWasShown = true;
      data.records[id] = {
        kind: 'post',
        user_id: req.user.id,
        opportunity_id: opportunityId,
        outcome,
        rating: parsed.rating,
        created_at: now,
        encrypted_fields: encryptObject({
          ...identity,
          opportunity_title: opportunity.encrypted_fields?.title || 'Opportunity post',
          text: parsed.text
        })
      };
      data.post_prompts[req.user.id] ||= {};
      data.post_prompts[req.user.id][opportunityId] = {
        ...(data.post_prompts[req.user.id][opportunityId] || {}),
        submitted_at: now,
        submitted_feedback_id: id
      };
      return data;
    });
    if (duplicate) return res.status(409).json({ error: 'Feedback was already submitted for this post.' });
    if (!promptWasShown) return res.status(409).json({ error: 'This feedback prompt is not active.' });
    res.status(201).json({ submitted: true, id });
  } catch (error) {
    console.error('Submit post feedback error:', error);
    res.status(500).json({ error: 'Could not submit feedback.' });
  }
});

router.get('/platform/status', requireAuth, async (req, res) => {
  try {
    const data = normalizeFeedbackData(await store.read(FEEDBACK_FILE));
    const record = Object.entries(data.records).find(([, item]) => item?.kind === 'platform' && item.user_id === req.user.id);
    if (!record) return res.json({ submitted: false, feedback: null });
    const fields = record[1].encrypted_fields ? decryptObject(record[1].encrypted_fields) : {};
    res.json({
      submitted: true,
      feedback: { id: record[0], outcome: record[1].outcome, rating: record[1].rating, created_at: record[1].created_at, text: fields.text || record[1].text || '' }
    });
  } catch (error) {
    console.error('Platform feedback status error:', error);
    res.status(500).json({ error: 'Could not load feedback status.' });
  }
});

router.post('/platform', requireAuth, async (req, res) => {
  try {
    const parsed = parseSubmission(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const outcome = String(req.body?.outcome || '');
    if (!['found_help', 'found_opportunity_to_help', 'both', 'neither_yet'].includes(outcome)) {
      return res.status(400).json({ error: 'Choose the result that best describes your experience.' });
    }
    const id = feedbackId();
    const now = new Date().toISOString();
    const identity = userIdentity(req.user);
    let duplicate = false;
    await store.atomicUpdate(FEEDBACK_FILE, raw => {
      const data = normalizeFeedbackData(raw);
      if (hasPlatformFeedback(data, req.user.id)) {
        duplicate = true;
        return data;
      }
      data.records[id] = {
        kind: 'platform', user_id: req.user.id,
        outcome, rating: parsed.rating, created_at: now,
        encrypted_fields: encryptObject({ ...identity, text: parsed.text })
      };
      return data;
    });
    if (duplicate) return res.status(409).json({ error: 'You have already submitted platform feedback.' });
    res.status(201).json({ submitted: true, id });
  } catch (error) {
    console.error('Submit platform feedback error:', error);
    res.status(500).json({ error: 'Could not submit feedback.' });
  }
});

module.exports = router;
