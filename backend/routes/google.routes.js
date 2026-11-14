const router = require('express').Router();
const { randomBytes } = require('node:crypto');
const { OAuth2Client } = require('google-auth-library');
const store = require('../store');
const auth = require('../auth');
const { decryptObject } = require('../crypto');
const { markEmailVerified, isEmailVerified, requestGoogleEmailCode } = require('./verify.routes');
const client = new OAuth2Client();
const production = process.env.NODE_ENV === 'production';
const cookie = { httpOnly: true, sameSite: 'strict', secure: production, path: '/' };

router.get('/config', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(503).json({ error: 'Google sign-in is not configured yet.' });
  const nonce = randomBytes(32).toString('hex');
  res.cookie('larpable_google_nonce', nonce, { ...cookie, maxAge: 10 * 60 * 1000 });
  res.json({ clientId: process.env.GOOGLE_CLIENT_ID, nonce });
});

router.post('/', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(503).json({ error: 'Google sign-in is not configured yet.' });
  const nonce = req.cookies?.larpable_google_nonce;
  if (!nonce || typeof req.body?.credential !== 'string' || req.body.credential.length > 16000) {
    return res.status(400).json({ error: 'Please restart Google sign-in.' });
  }
  let identity;
  try {
    const ticket = await client.verifyIdToken({ idToken: req.body.credential, audience: process.env.GOOGLE_CLIENT_ID });
    identity = ticket.getPayload();
    if (identity.nonce !== nonce || !identity.email_verified || !identity.email) throw new Error('Invalid identity');
  } catch {
    return res.status(401).json({ error: 'Google authentication failed. Please try again.' });
  }
  const email = identity.email.trim().toLowerCase();
  try {
    // Google is authoritative for Gmail and Workspace; other mailboxes need fresh proof.
    if (!email.endsWith('@gmail.com') && !identity.hd && !isEmailVerified(email, req)) {
      if (req.body.sendCode === true) return res.json({ verifyEmail: email, ...await requestGoogleEmailCode(email) });
      return res.json({ verifyEmail: email });
    }
    const users = await store.read('users.json');
    const matches = Object.entries(users).filter(([, user]) =>
      String(decryptObject(user.encrypted_fields || {}).email || '').trim().toLowerCase() === email);
    if (matches.length > 1 || matches[0]?.[1].deletion_pending) {
      return res.status(409).json({ error: 'This account cannot use Google sign-in. Please use your username and password.' });
    }
    if (matches.length) {
      const [id] = matches[0];
      await require('../deleted_users').requireActive(id);
      await store.atomicUpdate('users.json', data => {
        if (!data[id] || data[id].deletion_pending) throw new Error('Account unavailable');
        data[id].last_login_at = new Date().toISOString();
        return data;
      });
      const token = await auth.createSession(id);
      res.cookie('larpable_session', token, { ...cookie, maxAge: 30 * 24 * 60 * 60 * 1000 });
      res.clearCookie('larpable_guest', { path: '/' });
      res.clearCookie('larpable_google_nonce', cookie);
      return res.json({ login: true });
    }
    res.clearCookie('larpable_google_nonce', cookie);
    markEmailVerified(email, res);
    res.json({ email, firstName: identity.given_name || '', lastName: identity.family_name || '' });
  } catch (error) {
    if (error.status === 429) return res.status(429).json({ error: error.message });
    console.error('Google account lookup failed:', error.message);
    res.status(503).json({ error: 'Google sign-in is temporarily unavailable.' });
  }
});

module.exports = router;
