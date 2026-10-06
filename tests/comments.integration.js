const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'larpable-comments-'));
process.env.DATA_DIR = testDataDir;
process.env.ENCRYPTION_KEY = randomBytes(32).toString('hex');
process.env.COOKIE_SECRET = 'comments-test-cookie';

const { app } = require('../server');
const auth = require('../backend/auth');
const store = require('../backend/store');
const { encryptObject, decryptObject } = require('../backend/crypto');
const { scanText } = require('../backend/profanity');

async function main() {
  assert.equal(scanText('nig' + 'ger'), true);
  assert.equal(scanText('classic assistance'), false);

  await store.saveUser('alice', {
    type: 'student', created_at: new Date().toISOString(),
    encrypted_fields: encryptObject({ username: 'alice', first_name: 'Alice' })
  });
  await store.saveUser('bob', {
    type: 'student', created_at: new Date().toISOString(),
    encrypted_fields: encryptObject({ username: 'bob', first_name: 'Bob' })
  });
  await store.saveUser('moderator', {
    type: 'student', created_at: new Date().toISOString(),
    encrypted_fields: encryptObject({ username: 'anisohaney', first_name: 'Moderator' })
  });
  await store.saveOpportunity('opp_comments_test', {
    type: 'project', created_by: 'bob', created_at: new Date().toISOString(),
    encrypted_fields: encryptObject({
      title: 'Comment test opportunity',
      comments: [
        {
          id: 'comment_bob', user_id: 'bob', user_name: 'Bob', text: 'Bob comment',
          created_at: new Date().toISOString(), replies: [
            { id: 'reply_alice', user_id: 'alice', user_name: 'Alice', text: 'Alice reply', created_at: new Date().toISOString() }
          ]
        },
        { id: 'comment_alice', user_id: 'alice', user_name: 'Alice', text: 'Alice comment', created_at: new Date().toISOString(), replies: [] }
      ]
    })
  });

  const sessions = {
    alice: await auth.createSession('alice'),
    bob: await auth.createSession('bob'),
    moderator: await auth.createSession('moderator')
  };
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function request(method, route, user, body) {
    const response = await fetch(base + route, {
      method,
      headers: {
        ...(user ? { Cookie: `larpable_session=${sessions[user]}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    return { status: response.status, body: await response.json() };
  }

  try {
    const commentUrl = '/api/opportunities/opp_comments_test/comments';
    const rejected = await request('POST', commentUrl, 'alice', { text: 'nig' + 'ger' });
    assert.equal(rejected.status, 400, 'prohibited language is rejected in comments');
    const benignComment = (await request('POST', commentUrl, 'alice', { text: 'classic assistance' })).body.comment;
    assert.ok(benignComment.id, 'benign words are not blocked as false positives');

    const ownComment = (await request('POST', commentUrl, 'alice', { text: 'My original comment' })).body.comment;
    const filteredEdit = await request('PATCH', `${commentUrl}/${ownComment.id}`, 'alice', { text: 'nig' + 'ger' });
    assert.equal(filteredEdit.status, 400, 'prohibited language is rejected when editing a comment');
    const edited = await request('PATCH', `${commentUrl}/${ownComment.id}`, 'alice', { text: 'My edited comment' });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.comment.text, 'My edited comment');
    assert.ok(edited.body.comment.edited_at);

    assert.equal((await request('PATCH', `${commentUrl}/comment_bob`, 'alice', { text: 'Unauthorized edit' })).status, 403);
    assert.equal((await request('DELETE', `${commentUrl}/comment_bob`, 'alice')).status, 403);
    assert.equal((await request('DELETE', `${commentUrl}/${ownComment.id}`, 'bob')).status, 403);
    assert.equal((await request('DELETE', `${commentUrl}/${ownComment.id}`, 'alice')).status, 200);
    assert.equal((await request('DELETE', `${commentUrl}/${benignComment.id}`, 'alice')).status, 200);

    const replyUrl = `${commentUrl}/comment_bob/replies`;
    const reply = (await request('POST', replyUrl, 'alice', { text: 'My reply' })).body.reply;
    assert.equal((await request('PATCH', `${replyUrl}/${reply.id}`, 'alice', { text: 'Edited reply' })).body.reply.text, 'Edited reply');
    assert.equal((await request('PATCH', `${replyUrl}/${reply.id}`, 'bob', { text: 'Unauthorized edit' })).status, 403);
    assert.equal((await request('DELETE', `${replyUrl}/${reply.id}`, 'bob')).status, 403);
    assert.equal((await request('DELETE', `${replyUrl}/${reply.id}`, 'alice')).status, 200);

    assert.equal((await request('DELETE', `${commentUrl}/comment_bob/replies/reply_alice`, 'bob')).status, 403);
    assert.equal((await request('DELETE', `${commentUrl}/comment_bob/replies/reply_alice`, 'moderator')).status, 200);
    assert.equal((await request('DELETE', `${commentUrl}/comment_bob`, 'moderator')).status, 200);
    assert.equal((await request('DELETE', `${commentUrl}/comment_alice`, 'moderator')).status, 200);

    const storedOpportunity = await store.getOpportunity('opp_comments_test');
    assert.deepEqual(decryptObject(storedOpportunity.encrypted_fields).comments, []);
    console.log('Comment and reply moderation checks passed');
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
