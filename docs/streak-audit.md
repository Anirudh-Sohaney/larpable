# Streak architecture audit — 2026-11-14

Result: corrected implementation passes the complete npm test suite and an
independent review. All audit tests use disposable datasets. No real application
data was edited, no live accounts were used, and no changes were pushed.

## Code paths reviewed

- `backend/auth.js`: new users receive streak 0 and no previous publication.
- `backend/regular_posts.js`, `backend/posts.js`, `backend/routes/draft.routes.js`:
  both post types and draft publications use the shared publication guard.
- `backend/publication_limit.js`: serialized per-user publication, server timestamps,
  immutable publication streak, reserved/confirmed claims and caught-error recovery.
- `backend/streak.js`: 604800000 ms window, additive initialization, atomic exclusive
  backup publication, generation-aware recovery, and persisted expiry.
- `backend/larpscore.js`: approved publications earn 5 + 2 × their saved streak;
  existing retention/reversal rules apply to the complete award.
- `backend/store.js`: serialized atomic record updates preserve unrelated fields.
- `backend/startup.js`, `server.js`, `backend/routes/profile.routes.js`: recovery
  before serving requests, immediate effective expiry on reads, and a 60-second
  sweep to persist expiry. The store supports one application writer.

## Verification run

`npm test` completed with exit code 0 after the correction. This includes both
`tests/streak.integration.js` and the new `tests/streak.audit.js`.
`npm run test:streak` reruns these two focused suites.

The independent audit suite kills actual child processes before/after source
persistence, starts fresh processes to execute application startup recovery,
checks continued publication and deletion, and compares an 80-publication sequence
against a separate arithmetic oracle. It checks timestamps, cumulative points,
168 hours minus 1 ms, exactly 168 hours, plus 1 ms, and byte-stable recovery.
The integration suite also covers moderation, concurrent submissions, mixed post
types, published drafts, backup failures/retries, expiry, and account generations.
A separate reviewer inspected the code and independently ran both focused suites.

## Finding corrected

Initialization previously treated any old daily-quota reservation as a successful
publication. A reservation whose post never saved could give the first real post
streak 1 and 7 points. The added orphan-reservation regression failed before the
fix and passes afterward. Initialization now seeds only persisted legacy posts;
modern publications recover from confirmed or source-backed claims. Recovery also
preserves modern streaks when an initialization marker is missing.

## Remaining limits

Pre-feature reservations cannot distinguish a failed publication from a successful
publication that was later deleted. Unverifiable records cannot seed the legacy
baseline; their underlying stored data is preserved. Existing initialized users
are not reset by this correction.

The inherited daily quota can conservatively remain consumed until UTC midnight
if the process crashes after reserving a publication but before saving its source.
This does not advance the streak. JSON writes are individually atomic, not a
transaction across collections; recovery requires the surviving source or a
confirmed claim. These checks do not certify multiple simultaneous app writers
or external file corruption.
