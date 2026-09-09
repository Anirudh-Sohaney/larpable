/**
 * LARPABLE — Verify & Validate Routes
 *
 * POST /api/verify/email          — request a verification code for an email
 * POST /api/verify/code           — check a submitted verification code
 * POST /api/verify/resend         — issue a new verification code
 * GET  /api/validate/username/:username — check username availability
 *
 * Codes are stored in memory only (never written to disk) and expire after
 * 3 minutes. No email provider is configured, so codes are logged to the
 * server console. In non-production they are also echoed back as `devCode`
 * so the flow can be exercised locally; the field is harmless to clients.
 */

const express = require('express');
const verifyRouter = express.Router();
const validateRouter = express.Router();
const store = require('../store');
const { sha256Lookup } = require('../crypto');

const CODE_TTL_MS = 3 * 60 * 1000;   // 3 minutes
const MAX_ATTEMPTS = 5;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// email(lowercased) -> { codeHash, expiresAt, attempts }
const verifications = new Map();

// Purge expired codes periodically
setInterval(() => {
  const now = Date.now();
  for (const [email, entry] of verifications) {
    if (now > entry.expiresAt) verifications.delete(email);
  }
}, 60 * 1000);

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashCode(code) {
  return sha256Lookup('verify_code:' + code);
}

function issueCode(email) {
  const code = generateCode();
  verifications.set(email, {
    codeHash: hashCode(code),
    expiresAt: Date.now() + CODE_TTL_MS,
    attempts: 0
  });
  console.log(`[verify] verification code for ${email}: ${code}`);
  const body = { expiresIn: CODE_TTL_MS / 1000, expiresAt: Date.now() + CODE_TTL_MS };
  if (!IS_PRODUCTION) body.devCode = code;
  return body;
}

// ── POST /api/verify/email ───────────────────────────────────
verifyRouter.post('/email', (req, res) => {
  const email = String(req.body && req.body.email || '').trim().toLowerCase();
  if (!email || !/.+@.+\..+/.test(email)) {
    return res.status(400).json({ error: 'A valid email address is required' });
  }

  const existing = verifications.get(email);
  if (existing && existing.expiresAt > Date.now()) {
    return res.status(400).json({ error: 'Verification already pending', expiresAt: existing.expiresAt });
  }

  res.json(issueCode(email));
});

// ── POST /api/verify/code ────────────────────────────────────
verifyRouter.post('/code', (req, res) => {
  const email = String(req.body && req.body.email || '').trim().toLowerCase();
  const code = String(req.body && req.body.code || '').trim();
  const entry = verifications.get(email);

  if (!entry) {
    return res.status(400).json({ error: 'No verification pending for this email' });
  }
  if (Date.now() > entry.expiresAt) {
    verifications.delete(email);
    return res.status(400).json({ error: 'code_expired' });
  }
  if (hashCode(code) !== entry.codeHash) {
    entry.attempts++;
    if (entry.attempts >= MAX_ATTEMPTS) {
      verifications.delete(email);
      return res.status(400).json({ error: 'Too many failed attempts. Please request a new code.', attemptsLeft: 0 });
    }
    return res.status(400).json({ error: 'Invalid code', attemptsLeft: MAX_ATTEMPTS - entry.attempts });
  }

  verifications.delete(email);
  res.json({ ok: true });
});

// ── POST /api/verify/resend ──────────────────────────────────
verifyRouter.post('/resend', (req, res) => {
  const email = String(req.body && req.body.email || '').trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  res.json(issueCode(email));
});

// ── GET /api/validate/username/:username ─────────────────────
validateRouter.get('/username/:username', async (req, res) => {
  try {
    const username = String(req.params.username || '').trim();
    if (username.length < 3 || username.length > 30) {
      return res.json({ available: false, valid: false, error: 'Username must be 3-30 characters' });
    }
    const hash = sha256Lookup(username);
    const existing = await store.findUserByUsernameHash(hash);
    res.json({ available: !existing, valid: true });
  } catch (e) {
    console.error('Validate username error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = { verify: verifyRouter, validate: validateRouter };