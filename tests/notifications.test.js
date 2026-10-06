const assert = require('node:assert/strict');
const test = require('node:test');
const reengagement = require('../backend/reengagement');

const now = Date.parse('2026-10-05T12:00:00.000Z');
const daysAgo = days => new Date(now - days * 864e5).toISOString();

test('re-engagement dates respect idle periods and prior messages', () => {
  assert.equal(reengagement.utcDateString(now), '2026-10-05');
  assert.equal(reengagement.isDueForReengagement(daysAgo(2), '', now), true);
  assert.equal(reengagement.isDueForReengagement(daysAgo(1), '', now), false);
  assert.equal(reengagement.isDueForReengagement(daysAgo(2), daysAgo(0), now), false);
  assert.equal(reengagement.isDueForReengagement(daysAgo(5), daysAgo(3), now), false);
  assert.equal(reengagement.isDueForReengagement(daysAgo(3), daysAgo(5), now), true);
  assert.equal(reengagement.isDueForReengagement('not-a-date', '', now), false);
  assert.equal(reengagement.isDueForReengagement(daysAgo(-1), '', now), false);
});

test('opportunity selection prefers recent matches and falls back to older posts', () => {
  const user = {
    skills: ['JavaScript', 'Design'], interests: ['Education & Learning'],
    opportunity_preference: 'all', latitude: null, longitude: null
  };
  const opportunity = (id, daysOld, skills, field, createdBy = 'other') => ({
    id, type: 'project', created_by: createdBy, created_at: daysAgo(daysOld),
    decrypted: {
      title: `Opportunity ${id}`, skills, nonprofit_field: field,
      opportunity_preference: 'unpaid', remote: true, latitude: null, longitude: null
    }
  });
  const freshMatch = opportunity('fresh-match', 1, ['JavaScript'], 'Education & Learning');
  const freshMiss = opportunity('fresh-miss', 1, ['Welding'], 'Environment, Agriculture & Sports');
  const oldMatch = opportunity('old-match', 10, ['JavaScript'], 'Education & Learning');
  const ownPost = opportunity('own-post', 1, ['JavaScript'], 'Education & Learning', 'me');

  const selected = reengagement.pickTopOpportunities(user, [freshMiss, oldMatch, freshMatch], now - 2 * 864e5, 2);
  assert.equal(selected.length, 2);
  assert.equal(selected[0].opp.id, 'fresh-match');
  assert.equal(reengagement.pickTopOpportunities(user, [oldMatch], now - 0.5 * 864e5, 2)[0].opp.id, 'old-match');
  assert.equal([ownPost, freshMatch].filter(item => item.created_by !== 'me').some(item => item.id === 'own-post'), false);
});

test('notification email builders include opportunity and application details', () => {
  const fresh = {
    id: 'opp_fresh',
    decrypted: { title: 'River Cleanup', nonprofit_field: 'Environment', opportunity_preference: 'volunteer' }
  };
  const old = {
    id: 'opp_old',
    decrypted: { title: 'Tutoring Network', nonprofit_field: '', opportunity_preference: 'unpaid' }
  };
  const message = reengagement.buildReengagementEmail({
    name: 'Test User', picks: [{ opp: fresh, score: 0.9 }, { opp: old, score: 0.8 }]
  });
  assert.match(message.html, /\/opportunity\?id=opp_fresh/);
  assert.match(message.html, /Click here to view more/);
  assert.match(message.html, /Environment/);

  const noField = reengagement.buildReengagementEmail({
    name: 'Test User', picks: [{ opp: old, score: 1 }]
  });
  assert.doesNotMatch(noField.html, /color:#777/);

  const application = reengagement.buildApplicationEmail({
    oppTitle: 'Sample Opportunity', totalCount: 3, applierName: 'Jane Doe',
    appliedUrl: 'https://larpable.me/opportunity?id=opp_sample#applied'
  });
  assert.equal(application.subject, 'New application for Sample Opportunity');
  assert.match(application.html, /<strong>3<\/strong>/);
  assert.match(application.html, /Jane Doe/);
  assert.match(application.html, /#applied/);
});
