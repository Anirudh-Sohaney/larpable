const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const testDataDir = fs.mkdtempSync(path.join(__dirname, '.seo-test-'));
Object.assign(process.env, { DATA_DIR: testDataDir, ENCRYPTION_KEY: 'e'.repeat(64), COOKIE_SECRET: 'seo-test-secret', GOOGLE_INDEXING_KEY_FILE: 'stub.json' });

// Stub Google auth before indexing loads it; record every notification instead of sending it.
const sent = [];
require('google-auth-library');
const googleAuth = require.cache[require.resolve('google-auth-library')];
googleAuth.exports = { ...googleAuth.exports, GoogleAuth: class { async getClient() { return { request: async ({ data }) => sent.push(data) }; } } };

const { app } = require('../server');
const store = require('../backend/store');
const { encryptObject } = require('../backend/crypto');
const seo = require('../backend/seo');
const indexing = require('../backend/indexing');

const project = (type, name) => ({ type, created_by: 'owner', encrypted_fields: encryptObject({ name, elevator_pitch: 'A pitch', tags: ['Design'] }) });
const opp = (type, fields, extra = {}) => ({ type, project_id: 'prj_' + type, created_by: 'owner', created_at: '2026-11-01T00:00:00.000Z', ...extra,
  encrypted_fields: encryptObject({ description: 'Help us build things.', location: 'Remote', remote: true, skills: ['Design'], contact_links: ['https://secret.example/apply'], ...fields }) });

async function main() {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = url => fetch(base + url, { redirect: 'manual' });
  try {
    await store.write('users.json', { owner: { type: 'student', created_at: '2026-01-01T00:00:00.000Z', encrypted_fields: encryptObject({ first_name: 'Ann', email: 'ann@example.test', country: 'India' }) } });
    await store.write('projects.json', { prj_company: project('company', 'Acme Labs'), prj_nonprofit: project('nonprofit', 'Food Drive'), prj_project: project('project', 'Café App') });
    await store.write('opportunities.json', {
      opp_aa01: opp('company', { looking_for: 'Marketing interns', location: 'Austin, Texas, United States', remote: false }),
      opp_aa02: opp('nonprofit', { looking_for: 'Volunteers', description: 'Earn a $500 stipend.' }),
      opp_aa03: opp('project', { looking_for: 'Designer', description: 'This role is unpaid.' }),
      opp_aa04: opp('project', { looking_for: 'Held post' }, { flagged: true })
    });
    const all = Object.fromEntries((await store.getAllOpportunities()).map(o => [o.id, o]));

    // Descriptive URLs: type segment, project, role, location, then the id.
    assert.equal(seo.oppPath(all.opp_aa01), '/internship/acme-labs-marketing-interns-austin-texas-opp_aa01');
    assert.equal(seo.oppPath(all.opp_aa02), '/volunteering/food-drive-volunteers-remote-opp_aa02');
    assert.equal(seo.oppPath(all.opp_aa03), '/job/cafe-app-designer-remote-opp_aa03');

    // Keyword detection with type defaults; pay is never published.
    assert.equal(seo.employmentType(all.opp_aa01), 'INTERN');
    assert.equal(seo.employmentType(all.opp_aa02), 'VOLUNTEER');
    assert.equal(seo.employmentType(all.opp_aa03), 'FULL_TIME');
    assert.ok(!/paid|stipend|salary|$500/i.test(JSON.stringify(await seo.jobPosting(all.opp_aa03)).replace('This role is unpaid.', '')));

    // Old links and stale slugs redirect permanently; the feed's embedded pane keeps working.
    let response = await get('/opportunity?id=opp_aa01');
    assert.equal(response.status, 301);
    assert.equal(response.headers.get('location'), seo.oppPath(all.opp_aa01));
    assert.equal((await get('/opportunity?id=opp_aa01&embed=1')).status, 200);
    response = await get('/job/old-name-opp_aa01?ref=x');
    assert.equal(response.headers.get('location'), seo.oppPath(all.opp_aa01) + '?ref=x');
    assert.equal((await get('/job/missing-opp_ffff')).status, 404);

    // Server-rendered content and JobPosting markup; contact details stay behind login.
    const html = await (await get(seo.oppPath(all.opp_aa01))).text();
    const posting = JSON.parse(html.match(/<script type="application\/ld\+json">([^<]*)/)[1]);
    assert.equal(posting.title, 'Marketing interns');
    assert.equal(posting.employmentType, 'INTERN');
    assert.equal(posting.jobLocation.address.addressLocality, 'Austin');
    assert.equal(posting.jobLocation.address.addressCountry, 'United States');
    assert.match(html, /<h1 class="d-detail-title">Acme Labs<\/h1>/);
    assert.match(html, /Log in to view contact details/);
    assert.match(html, /Log in to apply and comment/);
    assert.ok(!html.includes('secret.example') && !html.includes('ann@example.test'));
    const remote = JSON.parse((await (await get(seo.oppPath(all.opp_aa02))).text()).match(/<script type="application\/ld\+json">([^<]*)/)[1]);
    assert.equal(remote.jobLocationType, 'TELECOMMUTE');
    assert.equal(remote.applicantLocationRequirements.name, 'India');
    assert.match(remote.description, /100% remote/);

    // Held posts render for their author but are never indexed.
    const held = await (await get(seo.oppPath(all.opp_aa04))).text();
    assert.match(held, /noindex/);
    assert.ok(!held.includes('application/ld+json'));

    // Indexing: announce public posts once, re-announce edits, delete removed posts.
    await indexing.sync();
    assert.deepEqual(sent.map(n => n.type + ' ' + n.url).sort(), ['opp_aa01', 'opp_aa02', 'opp_aa03'].map(id => 'URL_UPDATED https://larpable.me' + seo.oppPath(all[id])).sort());
    sent.length = 0;
    await indexing.sync();
    assert.equal(sent.length, 0);
    await store.atomicUpdate('opportunities.json', data => { delete data.opp_aa03; data.opp_aa02.encrypted_fields = encryptObject({ ...all.opp_aa02.encrypted_fields, looking_for: 'Organizers' }); return data; });
    await indexing.sync();
    assert.deepEqual(sent.map(n => n.type).sort(), ['URL_DELETED', 'URL_UPDATED']);
    assert.deepEqual(Object.keys(await store.read(indexing.FILE)).sort(), ['opp_aa01', 'opp_aa02']);
    console.log('SEO integration test passed');
  } finally {
    server.close();
    fs.rmSync(testDataDir, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
