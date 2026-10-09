/**
 * LARPABLE — Password Reset Routes
 *
 * POST /api/password/forgot — email a single-use reset link (valid 3 minutes)
 * POST /api/password/reset  — set a new password using that link
 *
 * The link carries an opaque 256-bit CSPRNG token
 * (`https://larpable.me/reset?token=<43 url-safe chars>`). Only the SHA-256
 * hash of the token is kept, in memory only and never written to disk, so the
 * token cannot be reconstructed or reverse-engineered from anything the server
 * stores. Tokens expire after 3 minutes and are consumed on first use.
 *
 * Nothing in the data store is written until the user themselves saves a new
 * password, and that write touches only the three password fields of that one
 * account (via atomicUpdate, which serializes writes per file).
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const store = require('../store');
const { sendEmail } = require('../mailer');
const { sha256Lookup, decryptObject, hashToken, hashPassword } = require('../crypto');

const TOKEN_TTL_MS = 3 * 60 * 1000; // 3 minutes
// Host is fixed, never derived from the request (prevents Host-header injection).
const BASE_URL = String(process.env.APP_BASE_URL || 'https://larpable.me').replace(/\/+$/, '');

// tokenHash -> { userId, expiresAt }  (in-memory only)
const resetTokens = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [hash, entry] of resetTokens) {
    if (now > entry.expiresAt) resetTokens.delete(hash);
  }
}, 60 * 1000).unref();

function genericReply() {
  return {
    ok: true,
    message: 'If an account matches, a reset link is on its way. It works for 3 minutes.'
  };
}

function invalidLink() {
  return { error: 'This reset link is invalid or has expired.', expired: true };
}

/** Find an account by username (exact) or email (case-insensitive). */
async function findAccount(identifier) {
  const id = String(identifier || '').trim();
  if (!id || id.length > 254) return null;

  const byUsername = await store.findUserByUsernameHash(sha256Lookup(id));
  if (byUsername) return byUsername;

  if (!id.includes('@')) return null;
  const wanted = id.toLowerCase();
  const users = await store.getAll('users.json');
  for (const [userId, record] of Object.entries(users)) {
    const fields = decryptObject(record.encrypted_fields || {});
    if (fields.email && String(fields.email).trim().toLowerCase() === wanted) {
      return { id: userId, record };
    }
  }
  return null;
}

/** Deliver the reset link through the shared Resend mailer. */
function sendResetEmail(to, link) {
  return sendEmail({
    to,
    subject: 'Reset your LARPABLE password',
    html: '<p>Use the link below to set a new password for your LARPABLE account:</p>'
      + '<p><a href="' + link + '">' + link + '</a></p>'
      + '<p>It expires in 3 minutes and can only be used once.</p>'
      + '<p>If you didn\'t request this, you can safely ignore this email.</p>'
  });
}

// ── POST /api/password/forgot ────────────────────────────────
router.post('/forgot', async (req, res) => {
  try {
    const identifier = String(req.body && req.body.identifier || '').trim();
    if (!identifier || identifier.length > 254) {
      return res.status(400).json({ error: 'Enter your username or email' });
    }

    // Same reply whether or not the account exists (no enumeration).
    const found = await findAccount(identifier);
    if (!found) return res.json(genericReply());

    const email = String(decryptObject(found.record.encrypted_fields || {}).email || '').trim();
    if (!email) return res.json(genericReply());

    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = hashToken(token);
    const expiresAt = Date.now() + TOKEN_TTL_MS;

    // Only the newest link stays valid.
    for (const [hash, entry] of resetTokens) {
      if (entry.userId === found.id) resetTokens.delete(hash);
    }
    resetTokens.set(tokenHash, { userId: found.id, expiresAt });

    const link = BASE_URL + '/reset?token=' + token;
    try {
      await sendResetEmail(email, link);
    } catch (e) {
      // Reply identically to every other outcome: a distinct status here
      // would tell a prober the account exists. Drop the token since the
      // email never went out — nothing dangles.
      resetTokens.delete(tokenHash);
      console.error('[reset] delivery failed, no token kept:', e.message);
    }

    res.json(genericReply());
  } catch (e) {
    console.error('Forgot password error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/password/reset ─────────────────────────────────
router.post('/reset', async (req, res) => {
  try {
    const token = String(req.body && req.body.token || '');
    const password = req.body && req.body.password;

    if (!token || typeof password !== 'string' || !password) {
      return res.status(400).json(invalidLink());
    }
    if (password.length < 6 || password.length > 1024) {
      return res.status(400).json({ error: 'Password must be 6-1024 characters' });
    }

    const tokenHash = hashToken(token);
    const entry = resetTokens.get(tokenHash);
    if (!entry || Date.now() > entry.expiresAt) {
      resetTokens.delete(tokenHash);
      return res.status(400).json(invalidLink());
    }

    const record = await store.getById('users.json', entry.userId);
    if (!record) {
      resetTokens.delete(tokenHash);
      return res.status(400).json(invalidLink());
    }

    // Hash the new password before touching the store; scrypt via auth queue.
    const passwordRecord = await hashPassword(password);

    // Password fields only — nothing else on the account is modified.
    await store.atomicUpdate('users.json', users => {
      const user = users[entry.userId];
      if (!user) return users;
      user.password_hash = passwordRecord.hash;
      user.password_salt = passwordRecord.salt;
      user.password_hash_scheme = passwordRecord.scheme;
      return users;
    });

    // Single use: consume only after the write succeeded.
    resetTokens.delete(tokenHash);

    // Sign the account out everywhere after a password change.
    try {
      await store.atomicUpdate('sessions.json', sessions => {
        for (const [hash, session] of Object.entries(sessions)) {
          if (session.user_id === entry.userId) delete sessions[hash];
        }
        return sessions;
      });
    } catch (e) {
      console.error('Reset session cleanup error:', e.message);
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('Reset password error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
