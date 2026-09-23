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
const { randomInt } = require('crypto');
const fs = require('fs').promises;
const verifyRouter = express.Router();
const validateRouter = express.Router();
const store = require('../store');
const { sha256Lookup, decryptObject } = require('../crypto');

const CODE_TTL_MS = 3 * 60 * 1000;   // 3 minutes
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;
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
const claimedVerifiedEmails = new Set();
let emailIndex = null;
let emailIndexSignature = null;
let emailIndexPromise = null;
const VERIFIED_TTL_MS = 30 * 60 * 1000;   // 30 minutes

// Purge expired codes periodically
const verificationCleanup = setInterval(() => {
  const now = Date.now();
  for (const [email, entry] of verifications) {
    if (now > entry.expiresAt) verifications.delete(email);
  }
  for (const [email, at] of verifiedEmails) {
    if (now - at > VERIFIED_TTL_MS) verifiedEmails.delete(email);
  }
}, 60 * 1000);
verificationCleanup.unref();

function generateCode() {
  return String(randomInt(100000, 1000000));
}

function hashCode(code) {
  return sha256Lookup('verify_code:' + code);
}

function hashesMatch(left, right) {
  const a = Buffer.from(String(left || ''), 'hex');
  const b = Buffer.from(String(right || ''), 'hex');
  return a.length === 32 && b.length === 32 && require('crypto').timingSafeEqual(a, b);
}

function issueCode(email) {
  if (IS_PRODUCTION && !RESEND_API_KEY) {
    throw new Error('Email verification provider is not configured');
  }
  const code = generateCode();
  verifications.set(email, {
    codeHash: hashCode(code),
    createdAt: Date.now(),
    expiresAt: Date.now() + CODE_TTL_MS,
    attempts: 0
  });
  // Fire-and-forget delivery; the response never blocks on the provider.
  sendVerificationEmail(email, code).catch(err => {
    console.error('[verify] delivery failed:', err.message);
  });
  const body = { expiresIn: CODE_TTL_MS / 1000, expiresAt: Date.now() + CODE_TTL_MS };
  if (!IS_PRODUCTION) body.devCode = code;
  return body;
}

/**
 * Check if an email is already associated with a registered account.
 * Emails live inside encrypted fields, so every record is decrypted and
 * compared case-insensitively (same approach as demo/server.js emailExists).
 * Fail closed on read errors: an unreadable user file must never permit a
 * duplicate account email to be registered.
 */
async function emailExists(email) {
  const wanted = String(email || '').trim().toLowerCase();
  if (!wanted) return false;
  const signature = await usersFileSignature();
  if (emailIndex && signature === emailIndexSignature) return emailIndex.has(wanted);

  if (!emailIndexPromise) {
    emailIndexPromise = buildEmailIndex().finally(() => { emailIndexPromise = null; });
  }
  const index = await emailIndexPromise;
  return index.has(wanted);
}

async function usersFileSignature() {
  try {
    const stat = await fs.stat(store.filePath('users.json'), { bigint: true });
    return `${stat.ino}:${stat.size}:${stat.mtimeNs}`;
  } catch (error) {
    if (error.code === 'ENOENT') return 'missing';
    throw error;
  }
}

async function buildEmailIndex() {
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = await usersFileSignature();
    const users = await store.getAll('users.json');
    const emails = new Set();
    for (const record of Object.values(users)) {
      const fields = decryptObject(record.encrypted_fields || {});
      if (fields.email) emails.add(String(fields.email).trim().toLowerCase());
    }
    const after = await usersFileSignature();
    if (before === after) {
      emailIndex = emails;
      emailIndexSignature = after;
      return emails;
    }
  }
  throw new Error('User records changed repeatedly while checking email uniqueness');
}

/**
 * Deliver a verification code via Resend. Falls back to console logging
 * when no RESEND_API_KEY is configured (dev / unconfigured environments).
 */
async function sendVerificationEmail(toEmail, code) {
  if (!RESEND_API_KEY) {
    if (IS_PRODUCTION) throw new Error('Email verification provider is not configured');
    console.log('[verify] development code issued');
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
  console.log('[verify] verification email sent');
  return { delivered: true };
}

// ── POST /api/verify/email ───────────────────────────────────
verifyRouter.post('/email', async (req, res) => {
  try {
    const email = String(req.body && req.body.email || '').trim().toLowerCase();
    if (!email || email.length > 254 || !/.+@.+\..+/.test(email)) {
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
  } catch (e) {
    console.error('[verify] email lookup failed:', e.message);
    res.status(503).json({ error: 'Email verification is temporarily unavailable' });
  }
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
  if (!hashesMatch(hashCode(code), entry.codeHash)) {
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
  if (email.length > 254 || !/.+@.+\..+/.test(email)) {
    return res.status(400).json({ error: 'A valid email address is required' });
  }
  const existing = verifications.get(email);
  if (!existing) return res.status(400).json({ error: 'No verification pending for this email' });
  const retryAfter = Math.ceil((existing.createdAt + RESEND_COOLDOWN_MS - Date.now()) / 1000);
  if (retryAfter > 0) {
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({ error: 'Please wait before requesting another code', retryAfter });
  }
  try {
    res.json(issueCode(email));
  } catch (e) {
    console.error('[verify] resend unavailable:', e.message);
    res.status(503).json({ error: 'Email verification is temporarily unavailable' });
  }
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

function claimVerifiedEmail(email) {
  const key = String(email || '').trim().toLowerCase();
  if (!isEmailVerified(key) || claimedVerifiedEmails.has(key)) return false;
  claimedVerifiedEmails.add(key);
  return true;
}

function releaseVerifiedEmail(email) {
  claimedVerifiedEmails.delete(String(email || '').trim().toLowerCase());
}

/**
 * Consume a verification stamp (single use — call after a successful write).
 */
function consumeVerifiedEmail(email) {
  const key = String(email || '').trim().toLowerCase();
  const ok = isEmailVerified(key);
  if (ok) verifiedEmails.delete(key);
  claimedVerifiedEmails.delete(key);
  return ok;
}

module.exports = { verify: verifyRouter, validate: validateRouter, emailExists, isEmailVerified, claimVerifiedEmail, releaseVerifiedEmail, consumeVerifiedEmail };
