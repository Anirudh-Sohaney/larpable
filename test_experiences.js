const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

const testDir = fs.mkdtempSync(path.join(__dirname, '.experiences-test-'));
process.env.DATA_DIR = testDir;
process.env.ENCRYPTION_KEY = randomBytes(32).toString('hex');
process.env.COOKIE_SECRET = 'experiences-test-cookie';

const { validateExperiences } = require('./backend/experiences');
const store = require('./backend/store');
const { decryptObject, encryptObject } = require('./backend/crypto');
const { app } = require('./server');

const description = 'I planned the work, built a prototype, coordinated teammates, and presented the final result.';
const project = { type: 'project', title: 'Community Garden', description, skills: ['Project Planning', 'Writing'] };
const job = { type: 'job', title: 'Assistant', company_name: 'Example Company', description, skills: ['Writing'] };

function expectInvalid(value, pattern) {
  assert.throws(() => validateExperiences(value), pattern);
}

async function main() {
  assert.deepEqual(validateExperiences([]), []);
  assert.equal(validateExperiences([project])[0].title, project.title);
  expectInvalid(Array(6).fill(project), /up to 5/);
  expectInvalid([{ ...project, description: 'Too short' }], /10 to 150 words/);
  expectInvalid([{ ...project, description: Array(151).fill('word').join(' ') }], /10 to 150 words/);
  expectInvalid([{ ...job, company_name: '' }], /company name/);
  expectInvalid([{ type: 'internship', title: 'Research Intern', description, skills: ['Research'] }], /company name/);
  expectInvalid([{ ...project, skills: [] }], /1 to 3/);
  expectInvalid([{ ...project, skills: ['One', 'Two', 'Three', 'Four'] }], /1 to 3/);
  expectInvalid([{ ...project, skills: ['Writing', 'writing'] }], /duplicate/);
  expectInvalid([{ ...project, description: description + ' fuck' }], /prohibited language/);
  expectInvalid([{ ...job, company_name: 'Fuck Company' }], /prohibited language/);
  expectInvalid([{ ...project, skills: ['fuck'] }], /prohibited language/);

  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(method, route, body, cookie) {
    const response = await fetch(base + route, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  const signup = experiences => ({
    username: 'experience_test', password: 'test-password', type: 'student', legal_agreed: true,
    first_name: 'Test', last_name: 'Student', age: 17, grade: '11th',
    interests: ['Writing', 'Nature', 'Technology'], skills: ['Writing', 'Research', 'Project Planning'],
    experiences
  });

  try {
    const rejected = await request('POST', '/api/auth/signup', signup([{ ...project, description: description + ' fuck' }]));
    assert.equal(rejected.status, 400);
    assert.deepEqual(await store.read('users.json'), {});
    const created = await request('POST', '/api/auth/signup', signup([project, job]));
    assert.equal(created.status, 200);
    const userId = created.body.userId;
    const cookie = created.cookie;
    assert.ok(cookie);
    const raw = await store.getRawUser(userId);
    assert.ok(raw.encrypted_fields.experiences[0].title.startsWith('enc:'));
    assert.deepEqual(decryptObject(raw.encrypted_fields).experiences, [project, job]);
    assert.equal((await request('GET', '/api/users/me', null, cookie)).body.experiences.length, 2);

    await store.atomicUpdate('users.json', users => {
      const fields = decryptObject(users[userId].encrypted_fields);
      fields.saved_posts = ['opp_preserve'];
      users[userId].encrypted_fields = encryptObject(fields);
      return users;
    });
    const before = fs.readFileSync(store.filePath('users.json'));
    const badPatch = await request('PATCH', '/api/users/me', { first_name: 'Changed', experiences: [{ ...project, title: 'Fuck this' }] }, cookie);
    assert.equal(badPatch.status, 400);
    assert.deepEqual(fs.readFileSync(store.filePath('users.json')), before);
    const patched = await request('PATCH', '/api/users/me', { first_name: 'Changed', experiences: [job] }, cookie);
    assert.equal(patched.status, 200);
    const updated = (await request('GET', '/api/users/me', null, cookie)).body;
    assert.equal(updated.first_name, 'Changed');
    assert.deepEqual(updated.experiences, [job]);
    assert.deepEqual(updated.saved_posts, ['opp_preserve']);
    assert.equal((await request('PATCH', '/api/users/me', { last_name: 'Updated' }, cookie)).status, 200);
    assert.deepEqual((await request('GET', '/api/users/me', null, cookie)).body.experiences, [job]);

    await store.saveUser('legacy', { type: 'student', created_at: new Date().toISOString(), encrypted_fields: encryptObject({ first_name: 'Legacy' }) });
    const auth = require('./backend/auth');
    const legacyCookie = `larpable_session=${await auth.createSession('legacy')}`;
    assert.deepEqual((await request('GET', '/api/users/me', null, legacyCookie)).body.experiences, []);

    await store.atomicUpdate('users.json', users => { users[userId].staff_access = true; return users; });
    await store.atomicUpdate('staff.json', staff => { staff.staff_members = { [userId]: { permissions: ['user_view'] } }; return staff; });
    const staffView = await request('GET', '/api/staff/work/users', null, cookie);
    assert.equal(staffView.status, 200);
    assert.deepEqual(staffView.body.users.find(user => user.id === userId).experiences, [job]);
    console.log('Experience validation, signup, profile, legacy, and staff checks passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); fs.rmSync(testDir, { recursive: true, force: true }); process.exitCode = 1; });
