const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

async function run() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'larpable-feedback-'));
  process.env.DATA_DIR = dataDir;
  process.env.ENCRYPTION_KEY = '11'.repeat(32);
  process.env.COOKIE_SECRET = 'feedback-test-secret';
  process.env.HOST = '127.0.0.1';

  const auth = require('./backend/auth');
  const store = require('./backend/store');
  const { encryptObject } = require('./backend/crypto');
  const { normalizeFeedbackData, countWords } = require('./backend/feedback');
  const { startServer } = require('./server');

  assert.equal(countWords(' one   two\nthree '), 3);
  assert.deepEqual(normalizeFeedbackData(null).records, {});

  const signup = await auth.signup({
    username: 'feedbacktester', password: 'secure-password', type: 'student',
    profile: { first_name: 'Feedback', last_name: 'Tester', interests: ['a', 'b', 'c'], skills: ['a', 'b', 'c'] }
  });
  const rawUser = await store.getRawUser(signup.userId);
  rawUser.staff_access = true;
  await store.saveUser(signup.userId, rawUser);
  const secondSignup = await auth.signup({
    username: 'feedbacktester2', password: 'secure-password', type: 'student',
    profile: { first_name: 'Second', last_name: 'Tester', interests: ['a', 'b', 'c'], skills: ['a', 'b', 'c'] }
  });

  const opportunityId = 'opp_feedback_test';
  await store.saveOpportunity(opportunityId, {
    type: 'project', created_by: signup.userId,
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    encrypted_fields: encryptObject({ title: 'Test feedback post', description: 'A test' })
  });

  const server = startServer(0);
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { Cookie: `larpable_session=${signup.token}` };
  const json = async (url, options = {}) => {
    const response = await fetch(base + url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
    return { response, data: await response.json() };
  };

  try {
    const portalOpen = await json('/api/staff/portal-open', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
    });
    assert.equal(portalOpen.response.status, 200);
    await new Promise(resolve => setTimeout(resolve, 5));

    const firstPrompt = await json('/api/feedback/post-prompt');
    assert.equal(firstPrompt.response.status, 200);
    assert.equal(firstPrompt.data.prompt.opportunity_id, opportunityId);

    const repeatedPrompt = await json('/api/feedback/post-prompt');
    assert.equal(repeatedPrompt.data.prompt, null, 'prompt waits two days after being shown');

    const deferred = await json(`/api/feedback/post-prompt/${opportunityId}/defer`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
    });
    assert.equal(deferred.response.status, 200);
    const afterDefer = normalizeFeedbackData(await store.read('feedback.json'));
    assert.equal(afterDefer.post_prompts[signup.userId][opportunityId].times_deferred, 1);
    await store.atomicUpdate('feedback.json', raw => {
      const data = normalizeFeedbackData(raw);
      const old = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      data.post_prompts[signup.userId][opportunityId].last_prompted_at = old;
      data.post_prompts[signup.userId][opportunityId].last_deferred_at = old;
      return data;
    });
    const returnedPrompt = await json('/api/feedback/post-prompt');
    assert.equal(returnedPrompt.data.prompt.opportunity_id, opportunityId, 'deferred prompt returns after two days');

    const submitted = await json('/api/feedback/post', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opportunity_id: opportunityId, outcome: 'helped', rating: 5, text: 'It connected me with someone helpful.' })
    });
    assert.equal(submitted.response.status, 201);
    const storedFeedback = JSON.stringify(await store.read('feedback.json'));
    assert.equal(storedFeedback.includes('It connected me with someone helpful.'), false, 'written feedback is encrypted at rest');
    const promptAfterSubmission = await json('/api/feedback/post-prompt');
    assert.equal(promptAfterSubmission.data.prompt, null, 'submitted posts are never prompted again');

    const duplicate = await json('/api/feedback/post', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opportunity_id: opportunityId, outcome: 'helped', rating: 5, text: '' })
    });
    assert.equal(duplicate.response.status, 409);

    const platform = await json('/api/feedback/platform', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome: 'both', rating: 4, text: 'I found help and a way to help.' })
    });
    assert.equal(platform.response.status, 201);

    const tooLongResponse = await fetch(base + '/api/feedback/platform', {
      method: 'POST',
      headers: {
        Cookie: `larpable_session=${secondSignup.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ outcome: 'found_help', rating: 3, text: Array(201).fill('word').join(' ') })
    });
    assert.equal(tooLongResponse.status, 400);

    const secondPlatformResponse = await fetch(base + '/api/feedback/platform', {
      method: 'POST',
      headers: {
        Cookie: `larpable_session=${secondSignup.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ outcome: 'found_help', rating: 3, text: '' })
    });
    assert.equal(secondPlatformResponse.status, 201);

    const status = await json('/api/feedback/platform/status');
    assert.equal(status.data.submitted, true);

    const staffFeedback = await json('/api/staff/work/feedback');
    assert.equal(staffFeedback.response.status, 200, 'all staff can read feedback without a control permission');
    assert.equal(staffFeedback.data.feedback.length, 3);
    assert.equal(staffFeedback.data.feedback[0].kind, 'platform');

    const inbox = await json('/api/staff/inbox');
    assert.equal(inbox.data.newFeedback, 3);
    assert.equal(inbox.data.items[0].message, '2+ new feedbacks');

    const deleteSecondUser = await fetch(base + '/api/users/me', {
      method: 'DELETE', headers: { Cookie: `larpable_session=${secondSignup.token}` }
    });
    assert.equal(deleteSecondUser.status, 200);
    const afterAccountDeletion = normalizeFeedbackData(await store.read('feedback.json'));
    assert.equal(Object.values(afterAccountDeletion.records).some(item => item.user_id === secondSignup.userId), false);

    const page = await fetch(base + '/feedback');
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Share feedback/);

    console.log('Feedback integration checks passed.');
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
