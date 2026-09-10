/**
 * LARPABLE — Verify & Validate Routes
 *
 * POST /api/verify/email          — request a verification code for an email
 * POST /api/verify/code           — check a submitted verification code
 * POST /api/verify/resend         — issue a new verification code
 * GET  /api/validate/username/:username — check username availability
 *
 * Codes are stored in memory only (never written to disk) and expire after
 * 3 minutes. Codes are delivered via Resend when RESEND_API_KEY is set;
 * otherwise they are logged to the server console. In non-production they
 * are also echoed back as `devCode` so the flow can be exercised locally;
 * the field is harmless to clients.
 */

const express = require('express');
const verifyRouter = express.Router();
const validateRouter = express.Router();
const store = require('../store');
const { sha256Lookup, decryptObject } = require('../crypto');

const CODE_TTL_MS = 3 * 60 * 1000;   // 3 minutes
const MAX_ATTEMPTS = 5;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_API_URL = 'https://api.resend.com/emails';
const VERIFY_FROM_EMAIL = process.env.VERIFY_FROM_EMAIL || 'verification@larpable.me';

// email(lowercased) -> { codeHash, expiresAt, attempts }
const verifications = new Map();

// email(lowercased) -> timestamp of successful code verification.
// Consumed by signup / email-change so an address can't be stored
// without proof of ownership (frontend step order alone is bypassable).
const verifiedEmails = new Map();
const VERIFIED_TTL_MS = 30 * 60 * 1000;   // 30 minutes

// Purge expired codes periodically
setInterval(() => {
  const now = Date.now();
  for (const [email, entry] of verifications) {
    if (now > entry.expiresAt) verifications.delete(email);
  }
  for (const [email, at] of verifiedEmails) {
    if (now - at > VERIFIED_TTL_MS) verifiedEmails.delete(email);
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
  // Fire-and-forget delivery; the response never blocks on the provider.
  sendVerificationEmail(email, code).catch(err => {
    console.error(`[verify] delivery failed for ${email}:`, err.message);
  });
  const body = { expiresIn: CODE_TTL_MS / 1000, expiresAt: Date.now() + CODE_TTL_MS };
  if (!IS_PRODUCTION) body.devCode = code;
  return body;
}

/**
 * Check if an email is already associated with a registered account.
 * Emails live inside encrypted fields, so every record is decrypted and
 * compared case-insensitively (same approach as demo/server.js emailExists).
 * Fail-open on read errors so a transient store failure can't lock out signup.
 */
async function emailExists(email) {
  try {
    const wanted = String(email || '').trim().toLowerCase();
    if (!wanted) return false;
    const users = await store.getAll('users.json');
    for (const record of Object.values(users)) {
      const fields = (decryptObject(record).encrypted_fields) || {};
      if (fields.email && String(fields.email).trim().toLowerCase() === wanted) return true;
    }
    return false;
  } catch (e) {
    console.error('[verify] emailExists scan failed:', e.message);
    return false;
  }
}

/**
 * Deliver a verification code via Resend. Falls back to console logging
 * when no RESEND_API_KEY is configured (dev / unconfigured environments).
 */
async function sendVerificationEmail(toEmail, code) {
  if (!RESEND_API_KEY) {
    console.log(`[verify] verification code for ${toEmail}: ${code}`);
    return { delivered: false, reason: 'no-provider' };
  }
  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'LARPABLE <' + VERIFY_FROM_EMAIL + '>',
      to: toEmail,
      subject: 'Your LARPABLE Verification Code',
      html: '<p>Your verification code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px;">' + code + '</p><p>It expires in 3 minutes.</p>'
    })
  });
  if (!res.ok) throw new Error('Resend HTTP ' + res.status);
  console.log(`[verify] verification email sent to ${toEmail}`);
  return { delivered: true };
}

// ── POST /api/verify/email ───────────────────────────────────
verifyRouter.post('/email', async (req, res) => {
  const email = String(req.body && req.body.email || '').trim().toLowerCase();
  if (!email || !/.+@.+\..+/.test(email)) {
    return res.status(400).json({ error: 'A valid email address is required' });
  }

  if (await emailExists(email)) {
    return res.status(409).json({ error: 'Email already associated with an account' });
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
  verifiedEmails.set(email, Date.now());
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

/**
 * Check a successful verification stamp without consuming it.
 */
function isEmailVerified(email) {
  const at = verifiedEmails.get(String(email || '').trim().toLowerCase());
  if (!at) return false;
  if (Date.now() - at > VERIFIED_TTL_MS) {
    verifiedEmails.delete(String(email || '').trim().toLowerCase());
    return false;
  }
  return true;
}

/**
 * Consume a verification stamp (single use — call after a successful write).
 */
function consumeVerifiedEmail(email) {
  const key = String(email || '').trim().toLowerCase();
  const ok = isEmailVerified(key);
  if (ok) verifiedEmails.delete(key);
  return ok;
}

module.exports = { verify: verifyRouter, validate: validateRouter, emailExists, isEmailVerified, consumeVerifiedEmail };