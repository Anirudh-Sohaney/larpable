/**
 * LARPABLE — Activity ping (page-load beacon receiver)
 *
 * POST /api/activity/ping { page } — fired once per page load by the tiny
 * `web_app/js/activity.js` beacon included on every page. Public endpoint
 * (anonymous visitors have no session by definition).
 *
 * Cost control: bookkeeping is in-memory only; persistence happens in the
 * 5-minute flush. Invalid bodies are ignored, never errors — the beacon
 * must be silent by design.
 */

const express = require('express');
const router = express.Router();
const { VISITOR_COOKIE, recordPing } = require('../activity');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

router.post('/ping', (req, res) => {
  try {
    const page = req.body && req.body.page;
    const { vid, fresh } = recordPing({
      vid: req.cookies && req.cookies[VISITOR_COOKIE],
      page: typeof page === 'string' ? page : '',
      userAgent: req.headers['user-agent'] || '',
      nowMs: Date.now()
    });
    if (fresh) {
      res.cookie(VISITOR_COOKIE, vid, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 365 * 24 * 60 * 60 * 1000,
        path: '/',
        ...(IS_PRODUCTION && { secure: true })
      });
    }
  } catch {
    // Never fail the beacon.
  }
  res.json({ ok: true });
});

module.exports = router;
