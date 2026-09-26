const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Keep this test entirely separate from the application's configured data.
const testDataDir = fs.mkdtempSync(path.join(__dirname, '.applications-test-'));
process.env.DATA_DIR = testDataDir;
process.env.ENCRYPTION_KEY = 'a'.repeat(64);
process.env.COOKIE_SECRET = 'application-test-secret';

const { app } = require('./server');
const store = require('./backend/store');
const auth = require('./backend/auth');
const { encryptObject } = require('./backend/crypto');

async function main() {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (method, url, token, body) => {
    const response = await fetch(base + url, {
      method,
      headers: { ...(token ? { Cookie: `larpable_session=${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    return { status: response.status, body: await response.json() };
  };

  try {
    await store.saveUser('owner', { type: 'student', created_at: new Date().toISOString(), encrypted_fields: encryptObject({ first_name: 'Post', last_name: 'Owner', email: 'owner@example.test' }) });
    await store.saveUser('applicant', { type: 'student', created_at: new Date().toISOString(), encrypted_fields: encryptObject({
      first_name: 'Alex', last_name: 'Student', grade: '11th', skills: ['Design'], email: 'alex@example.test',
      experiences: [
        { type: 'project', title: 'Design portfolio', description: 'I designed and built a portfolio with accessible pages and clear navigation.', skills: ['design', 'Python'] },
        { type: 'internship', title: 'Poster internship', company_name: 'Studio', description: 'I created campaign posters and worked with the team to review designs.', skills: ['Design'] },
        { type: 'project', title: 'Unrelated app', description: 'I built a web application and tested its behavior with several users.', skills: ['JavaScript'] }
      ]
    }) });
    await store.saveUser('other', { type: 'student', created_at: new Date().toISOString(), encrypted_fields: encryptObject({ first_name: 'Other', last_name: 'Student' }) });
    await store.saveOpportunity('opp_test', { type: 'project', created_by: 'owner', created_at: new Date().toISOString(), encrypted_fields: encryptObject({ title: 'Test opportunity', location: '', skills: ['Design'], comments: [] }) });
    const owner = await auth.createSession('owner');
    const applicant = await auth.createSession('applicant');
    const other = await auth.createSession('other');

    assert.equal((await request('POST', '/api/opportunities/opp_test/applications', owner)).status, 403);
    const simultaneous = await Promise.all([
      request('POST', '/api/opportunities/opp_test/applications', applicant),
      request('POST', '/api/opportunities/opp_test/applications', applicant)
    ]);
    assert.deepEqual(simultaneous.map(result => result.status).sort(), [200, 201]);
    assert.equal((await request('POST', '/api/opportunities/opp_test/applications', applicant)).body.already_applied, true);
    assert.equal((await request('GET', '/api/opportunities/opp_test', applicant)).body.application.applied, true);
    assert.equal((await request('GET', '/api/opportunities/opp_test/applications', other)).status, 403);
    const ownerFeed = await request('GET', '/api/opportunities/mine', owner);
    assert.equal(ownerFeed.body.opportunities[0].application_count, 1);
    assert.equal(ownerFeed.body.opportunities[0].has_unread_applications, true);
    const publicFeed = await request('GET', '/api/opportunities', other);
    assert.equal(publicFeed.body.opportunities[0].application_count, undefined);
    const list = await request('GET', '/api/opportunities/opp_test/applications', owner);
    assert.deepEqual(list.body.applicants.map(({ name, grade, email }) => ({ name, grade, email })), [{ name: 'Alex Student', grade: '11th', email: 'alex@example.test' }]);
    assert.deepEqual(list.body.applicants[0].experiences.map(experience => experience.title), ['Design portfolio', 'Poster internship']);
    assert.deepEqual(list.body.applicants[0].experiences.map(experience => experience.matching_skills), [['design'], ['Design']]);
    assert.equal(list.body.applicants[0].experiences[1].company_name, 'Studio');
    assert.equal((await request('POST', '/api/opportunities/opp_test/applications', other)).status, 201);
    assert.deepEqual((await request('GET', '/api/opportunities/opp_test/applications', owner)).body.applicants.find(person => person.id === 'other').experiences, []);
    assert.equal((await request('POST', '/api/opportunities/opp_test/applications/seen', other, { applicant_ids: ['applicant'] })).status, 403);
    assert.equal((await request('POST', '/api/opportunities/opp_test/applications/seen', owner, { applicant_ids: ['applicant'] })).status, 200);
    assert.equal((await request('GET', '/api/opportunities/mine', owner)).body.opportunities[0].has_unread_applications, true);
    assert.equal((await request('POST', '/api/opportunities/opp_test/applications/seen', owner, { applicant_ids: ['other'] })).status, 200);
    assert.equal((await request('GET', '/api/opportunities/mine', owner)).body.opportunities[0].has_unread_applications, false);
    await store.atomicUpdate('opportunities.json', opportunities => {
      opportunities.opp_test.encrypted_fields = encryptObject({ title: 'Test opportunity', location: '', comments: [{ id: 'comment_1', text: 'Question', user_id: 'applicant', created_at: new Date().toISOString(), read_by_op: false }] });
      return opportunities;
    });
    assert.deepEqual((await request('GET', '/api/opportunities/opp_test/applications', owner)).body.applicants.find(person => person.id === 'applicant').experiences, []);
    assert.equal((await request('GET', '/api/opportunities/mine', owner)).body.opportunities[0].has_unread_comments, true);
    await request('GET', '/api/opportunities/opp_test?view=applications', owner);
    assert.equal((await request('GET', '/api/opportunities/mine', owner)).body.opportunities[0].has_unread_comments, true);
    await request('GET', '/api/opportunities/opp_test', owner);
    assert.equal((await request('GET', '/api/opportunities/mine', owner)).body.opportunities[0].has_unread_comments, false);
    assert.equal((await request('DELETE', '/api/users/me', applicant)).status, 200);
    assert.equal((await request('GET', '/api/opportunities/opp_test/applications', owner)).body.applicants.length, 1);
    assert.equal((await request('DELETE', '/api/opportunities/opp_test', owner)).status, 200);
    assert.equal((await store.read('applications.json')).opp_test, undefined);
    console.log('Application API checks passed');
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
