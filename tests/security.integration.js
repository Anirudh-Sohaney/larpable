const clock=require('./helpers/test-clock')();
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'larpable-security-'));
process.env.DATA_DIR = dataDir;
process.env.ENCRYPTION_KEY = 'a'.repeat(64);
process.env.NODE_ENV = 'test';
process.env.RESEND_API_KEY = ''; // Never send real email from this test.

const { app } = require('../server');
const store = require('../backend/store');
const auth = require('../backend/auth');
const { encrypt, encryptObject, decryptObject } = require('../backend/crypto');
const { normalizeSkills, normalizeField } = require('../backend/canonical');
const skills = ['Writing', 'Research', 'Project Planning'];

async function main() {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(method, route, body, cookie = '') {
    const response = await fetch(base + route, {
      method,
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    clock.afterPublication(method,route,response.status);
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie') };
  }
  async function verify(email) {
    const issued = await request('POST', '/api/verify/email', { email });
    assert.equal(issued.status, 200);
    const checked = await request('POST', '/api/verify/code', { email, code: issued.body.devCode });
    assert.equal(checked.status, 200);
    assert.match(checked.cookie || '', /HttpOnly/i);
    return checked.cookie.split(';')[0];
  }
  const signup = (username, email) => ({
    username, email, password: 'test-password', type: 'student', legal_agreed: true,
    age: 17, grade: '11th', skills, interests: ['Writing', 'Nature', 'Technology']
  });

  try {
    // Plaintext resembling ciphertext must survive one encryption/decryption cycle.
    const input = { title: 'enc:broken', nested: [encrypt('literal ciphertext'), { text: 'enc:' }] };
    assert.deepEqual(decryptObject(encryptObject(input)), input);
    await store.saveUser('owner', { type: 'student', encrypted_fields: encryptObject({ first_name: 'enc:Owner', skills }) });
    const owner = `larpable_session=${await auth.createSession('owner')}`;
    const project=await require('../backend/projects').create('owner',{type:'project',name:input.title,elevator_pitch:'Project encryption test',tags:['Research']});
    const company=await require('../backend/projects').create('owner',{type:'company',field:"Science & Research",name:'enc:Draft',elevator_pitch:'Company encryption test',tags:['Research']});
    const created = await request('POST', '/api/opportunities', { project_id:project.id, skills }, owner);
    assert.equal(created.status, 200);
    const id = created.body.id;
    assert.equal((await request('GET', '/api/opportunities')).status, 200);
    assert.equal((await request('GET', `/api/opportunities/${id}`)).body.project.fields.name, input.title);
    assert.ok(!('title' in (await request('GET', `/api/opportunities/${id}`)).body.fields));
    assert.equal((await request('PATCH', `/api/opportunities/${id}`, { details: 'enc:details' }, owner)).status, 200);
    assert.equal((await request('POST', `/api/opportunities/${id}/comments`, { text: 'enc:comment' }, owner)).status, 200);
    assert.equal((await request('GET', `/api/opportunities/${id}`)).body.fields.details, 'enc:details');

    // A different browser cannot consume another browser's verification grant.
    const email = 'verified@example.test';
    const proof = await verify(email);
    assert.equal((await request('POST', '/api/auth/signup', signup('intruder', email))).status, 403);
    assert.equal((await request('PATCH', '/api/users/me', { email }, owner)).status, 403);
    assert.equal((await request('PATCH', '/api/users/me', { email }, owner + '; larpable_email_verification=wrong')).status, 403);
    // Failed signup must leave the browser's grant usable.
    assert.equal((await request('POST', '/api/auth/signup', signup('x', email), proof)).status, 400);
    assert.equal((await request('POST', '/api/auth/signup', signup('verified_user', email), proof)).status, 200);

    const changedEmail = 'changed@example.test';
    const changeProof = await verify(changedEmail);
    const ownerWithProof = owner + '; ' + changeProof;
    assert.equal((await request('PATCH', '/api/users/me', { email: changedEmail }, owner)).status, 403);
    assert.equal((await request('PATCH', '/api/users/me', { email: changedEmail }, ownerWithProof)).status, 200);
    // Consumption remains single-use even if the address is subsequently removed.
    assert.equal((await request('PATCH', '/api/users/me', { email: '' }, owner)).status, 200);
    assert.equal((await request('PATCH', '/api/users/me', { email: changedEmail }, ownerWithProof)).status, 403);

    // Draft publishing must enforce the same rules as direct creation.
    for (const fields of [
      { skills: [] },
      { skills: ['Writing', 'writing', 'Research'] },
      { skills, description: Array(16).fill('word').join(' ') },
      { skills, opportunity_preference: 'invalid' }
    ]) {
      const post = { project_id:project.id, ...fields };
      assert.equal((await request('POST', '/api/opportunities', post, owner)).status, 400);
      const draft = await request('POST', '/api/drafts', post, owner);
      assert.equal(draft.status, 200);
      const published = await request('POST', `/api/drafts/${draft.body.id}/publish`, {}, owner);
      assert.equal(published.status, 400);
      assert.ok(await store.getById('drafts.json', draft.body.id), 'invalid draft must remain editable');
    }
    const draft = await request('POST', '/api/drafts', {
      project_id:company.id, skills: [' writing ', 'Research', 'Project Planning'],
      industry: 'Technology / SaaS', description: Array(15).fill('word').join(' ')
    }, owner);
    const published = await request('POST', `/api/drafts/${draft.body.id}/publish`, {}, owner);
    assert.equal(published.status, 200);
    const fields = (await store.getOpportunity(published.body.id)).encrypted_fields;
    assert.deepEqual(fields.skills, normalizeSkills([' writing ', 'Research', 'Project Planning']));
    assert.ok(!Object.hasOwn(fields,'industry'));
    assert.equal((await store.getOpportunity(published.body.id)).project.fields.field,company.fields.field);
    assert.ok(!('title' in fields));
    assert.equal((await store.getOpportunity(published.body.id)).project_name,'enc:Draft');
    assert.equal(await store.getById('drafts.json', draft.body.id), null);
    assert.equal((await request('GET', '/api/opportunities')).status, 200);
    console.log('Ciphertext input, browser-bound verification, and draft validation checks passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
