const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'larpable-google-'));
  Object.assign(process.env, { DATA_DIR: dir, NODE_ENV: 'test', ENCRYPTION_KEY: 'a'.repeat(64), GOOGLE_CLIENT_ID: 'test-client', RESEND_API_KEY: '' });
  const { OAuth2Client } = require('google-auth-library');
  let identity;
  // Stub only Google's remote cryptographic verification; exercise real app/storage/session code.
  OAuth2Client.prototype.verifyIdToken = async options => {
    assert.equal(options.audience, 'test-client');
    if (options.idToken === 'invalid') throw new Error('Bad signature');
    return { getPayload: () => identity };
  };
  const { app } = require('../server');
  const auth = require('../backend/auth');
  const store = require('../backend/store');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  let cookies = {};
  async function request(url, body) {
    const response = await fetch(base + url, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', Cookie: Object.entries(cookies).map(([k,v]) => k + '=' + v).join('; ') },
      ...(body && { body: JSON.stringify(body) })
    });
    for (const value of response.headers.getSetCookie()) {
      const [key, val] = value.split(';')[0].split('='); cookies[key] = val;
    }
    return { status: response.status, body: await response.json() };
  }
  async function begin(email, extra = {}) {
    const config = await request('/api/auth/google/config');
    identity = { email, email_verified: true, given_name: 'First', family_name: 'Last', nonce: config.body.nonce, ...extra };
  }
  try {
    const original = await auth.signup({ username: 'existing', password: 'password123', type: 'student', profile: { email: 'Existing@gmail.com' } });
    await begin('existing@gmail.com');
    assert.equal((await request('/api/auth/google', { credential: 'invalid' })).status, 401);
    const savedNonce = identity.nonce; identity.nonce = 'wrong';
    assert.equal((await request('/api/auth/google', { credential: 'valid' })).status, 401);
    identity.nonce = savedNonce;
    assert.equal((await request('/api/auth/google', { credential: 'valid' })).body.login, true);
    assert.equal((await auth.getUserFromToken(cookies.larpable_session)).id, original.userId);
    assert.equal((await auth.login('existing', 'password123')).userId, original.userId);
    assert.equal((await request('/api/auth/google', { credential: 'valid' })).status, 400);
    await begin('new@gmail.com');
    const fresh = await request('/api/auth/google', { credential: 'valid' });
    assert.deepEqual(fresh.body, { email: 'new@gmail.com', firstName: 'First', lastName: 'Last' });
    const verification = require('../backend/routes/verify.routes');
    assert(verification.isEmailVerified('new@gmail.com', { cookies }));
    assert(!verification.isEmailVerified('new@gmail.com', { cookies: {} }));
    const created = await request('/api/auth/signup', {
      username: 'google-new', password: 'password123', type: 'student', legal_agreed: true,
      email: fresh.body.email, first_name: 'Changed', last_name: 'Name', age: 17,
      grade: '11th', skills: ['Writing', 'Research', 'Programming'],
      interests: ['Writing', 'Nature', 'Technology']
    });
    assert.equal(created.status, 200);
    assert.equal((await auth.login('google-new', 'password123')).userId, created.body.userId);
    const profile = await store.getUser(created.body.userId);
    assert.equal(profile.encrypted_fields.first_name, 'Changed');
    assert.equal(profile.encrypted_fields.last_name, 'Name');
    await begin('new@gmail.com');
    assert.equal((await request('/api/auth/google', { credential: 'valid' })).body.login, true);
    assert.equal((await auth.getUserFromToken(cookies.larpable_session)).id, created.body.userId);
    await begin('unverified@gmail.com', { email_verified: false });
    assert.equal((await request('/api/auth/google', { credential: 'valid' })).status, 401);
    await begin('student@school.edu', { hd: 'school.edu' });
    assert.equal((await request('/api/auth/google', { credential: 'valid' })).body.email, 'student@school.edu');
    await begin('thirdparty@example.com');
    assert.equal((await request('/api/auth/google', { credential: 'valid' })).body.verifyEmail, 'thirdparty@example.com');
    const challenge = await request('/api/auth/google', { credential: 'valid', sendCode: true });
    assert.equal((await request('/api/verify/code', { email: identity.email, code: challenge.body.devCode })).status, 200);
    assert.equal((await request('/api/auth/google', { credential: 'valid' })).body.email, identity.email);
    await store.atomicUpdate('users.json', users => { users[original.userId].deletion_pending = true; return users; });
    await begin('existing@gmail.com');
    assert.equal((await request('/api/auth/google', { credential: 'valid' })).status, 409);
    console.log('Google account matching, password compatibility, nonce/signature rejection, signup proof, mailbox challenge and deletion checks passed.');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await fs.rm(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
