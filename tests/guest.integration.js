const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Keep this test entirely separate from the application's configured data.
const testDataDir = fs.mkdtempSync(path.join(__dirname, '.guest-test-'));
process.env.DATA_DIR = testDataDir;
process.env.ENCRYPTION_KEY = 'a'.repeat(64);
process.env.COOKIE_SECRET = 'guest-test-secret';

const { app } = require('../server');
const store = require('../backend/store');
const auth = require('../backend/auth');
const { encryptObject } = require('../backend/crypto');

const CONTACT = 'https://example.test/contact';

async function main() {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const request = async (method, url, { token, cookie, body, redirect } = {}) => {
    const response = await fetch(base + url, {
      method,
      redirect: redirect || 'follow',
      headers: {
        ...(token ? { Cookie: `larpable_session=${token}` } : cookie ? { Cookie: cookie } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const text = await response.text();
    let parsed = {};
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    const setCookies = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie') || ''];
    return { status: response.status, body: parsed, headers: response.headers, location: response.headers.get('location'), setCookies };
  };

  try {
    await store.saveUser('owner', {
      type: 'student',
      created_at: new Date().toISOString(),
      encrypted_fields: encryptObject({ first_name: 'Post', last_name: 'Owner', email: 'owner@example.test' })
    });

    // Eight posts so the anonymous six-item cap is observable.
    const baseTime = Date.parse('2026-01-01T00:00:00.000Z');
    for (let i = 1; i <= 8; i += 1) {
      await store.saveOpportunity(`opp_${i}`, {
        type: 'project',
        created_by: 'owner',
        created_at: new Date(baseTime + i * 60_000).toISOString(),
        encrypted_fields: encryptObject({ title: `Opportunity ${i}`, location: '', skills: ['Design'], contact_links: [CONTACT], comments: [] })
      });
    }

    const owner = await auth.createSession('owner');

    // ── Anonymous feed: capped to the six newest, no contact links ──
    const anonFeed = await request('GET', '/api/opportunities');
    assert.equal(anonFeed.status, 200);
    assert.equal(anonFeed.body.total, 8);
    assert.equal(anonFeed.body.opportunities.length, 6);
    assert.equal(anonFeed.body.opportunities[0].id, 'opp_8');
    assert.equal(anonFeed.body.opportunities[5].id, 'opp_3');
    for (const opp of anonFeed.body.opportunities) {
      assert.deepEqual(opp.contact_links, [], 'anonymous feed must not leak contact links');
    }

    // ── Anonymous detail: no contact channels at all ──
    const anonDetail = await request('GET', '/api/opportunities/opp_1');
    assert.equal(anonDetail.status, 200);
    assert.equal(Object.prototype.hasOwnProperty.call(anonDetail.body.fields, 'contact_links'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(anonDetail.body.fields, 'contact'), false);
    assert.equal(anonDetail.body.issuer.email, '');
    assert.equal(anonDetail.body.application, null);

    // ── Authenticated readers keep full access ──
    const authFeed = await request('GET', '/api/opportunities', { token: owner });
    assert.equal(authFeed.body.opportunities.length, 8);
    assert.deepEqual(authFeed.body.opportunities.find(o => o.id === 'opp_1').contact_links, [CONTACT]);

    const authDetail = await request('GET', '/api/opportunities/opp_1', { token: owner });
    assert.deepEqual(authDetail.body.fields.contact_links, [CONTACT]);
    assert.equal(authDetail.body.issuer.email, 'owner@example.test');

    // ── Server issues the guest pass ──
    const pass = await request('GET', '/get-started', { redirect: 'manual' });
    assert.equal(pass.status, 302);
    assert.equal(pass.location, '/feed');
    assert.ok(pass.setCookies.some(c => c.startsWith('larpable_guest=1')), 'guest cookie must be issued');

    // ── A successful signup clears the guest pass ──
    const signup = await request('POST', '/api/auth/signup', {
      cookie: 'larpable_guest=1',
      body: {
        username: 'newguest', password: 'secret123', type: 'student', legal_agreed: true,
        age: 16, grade: '11th',
        interests: ['Design', 'Writing', 'Research'], skills: ['Design', 'Writing', 'Research']
      }
    });
    assert.equal(signup.status, 200);
    assert.ok(signup.setCookies.some(c => c.startsWith('larpable_guest=') && /larpable_guest=;|larpable_guest=$|Expires=Thu, 01 Jan 1970/.test(c)),
      'signup must clear the guest cookie');

    console.log('Guest access checks passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(testDataDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  fs.rmSync(testDataDir, { recursive: true, force: true });
  process.exitCode = 1;
});
