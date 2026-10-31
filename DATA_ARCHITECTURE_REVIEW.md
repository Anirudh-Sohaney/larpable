# Data architecture review — 2026-10-29

Follow-up: username case checks, deleted-account cleanup and selected retrieval/write costs were subsequently addressed. See [implementation details](DELETED_USERS_V6.md). The findings below describe the reviewed state before those changes; other recommendations remain separate work.

Read-only review of the local checkout and dataset. No production server, Oracle filesystem, Nginx configuration or remote backups were inspected. No application code or real data was changed. Reproductions used a disposable DATA_DIR, blocked email and removed their temporary data afterward. Credentials are intentionally omitted from this report.

## Current size

| Data | Current size/count |
| --- | --- |
| Live JSON collections, excluding `.bak` files | 1,714,138 bytes, approximately 1.63 MiB |
| Users | 437 records; 1,119,608 bytes |
| Opportunities / regular posts | 50 / 1; 107,217 bytes combined |
| Projects | 47; 44,827 bytes |
| Sessions | 412; 83,636 bytes; 297 already expired |
| LarpScore events | 149; 58,163 bytes |
| Publication claims | 51; 9,586 bytes |
| Media | One file; 3,642,875 bytes |
| Matching vectors, in application code | 3,116,825 bytes |

There is no excessively large dataset today. The concerns are work per operation, retention and future media growth. Vectors are a fixed catalog loaded once per process, rather than an expanding per-user vector database.

## Findings, ranked

### 1. Critical: admin credentials are embedded in source

`backend/admin.js:8–23` contains a plaintext administrative password and compares it directly. `backend/auth.js` checks this before normal user authentication and creates an administrator session on a match. Anyone obtaining those credentials can access the privileged data-management API; ordinary user password hashing does not protect this path.

Move administrator authentication to a properly hashed, explicitly provisioned account or protected configuration. Rotate the exposed credential and revoke existing administrator sessions. Removing the current source literal does not remove it from repository history. This path was verified by reading code; no administrator login was attempted and remote deployment state is unknown.

### 2. High: username-based moderation can be obtained through case variants

`backend/routes/comments.routes.js:9,121,180` grants global comment/reply deletion when a username lowercases to the special moderator name. Username lookup in `backend/auth.js:56` and `backend/crypto.js:58` hashes the original case and has no corresponding canonical-name reservation. A distinct case variant can therefore satisfy the privileged check while being a separate account.

A disposable reproduction confirmed different hashes for case variants and `can_delete: true` for a case-variant non-owner; both DELETE handlers use the same username predicate. Replace this with an explicit server-controlled role or immutable administrator ID. Canonicalize and uniquely constrain usernames independently of authorization.

### 3. High: account deletion leaves data, and recreated usernames reuse ownership

`backend/routes/user.routes.js:204` removes the user, sessions, owned posts, drafts, likes, feedback and applications, but `backend/regular_posts.js:99` does not remove owned projects or comments/replies on other users' posts. Existing backups and score/publication records also retain identifiers.

`backend/auth.js:24` deterministically derives the user ID from the username. Recreating the exact username reuses that ID. As a result, surviving projects become associated with the new account and surviving comments pass ID-based author checks. A disposable DELETE-account/recreate test confirmed retained projects, retained comments and the reused ID. The real dataset currently has one top-level comment whose author ID has no current user record; its cause was not established.

Use random immutable account IDs, separate from username lookups. Define an explicit deletion/anonymization policy for projects, comments, replies, score history and backups. Preserve other users' retained point totals using anonymized awards where appropriate. Run deletion as a transaction or a durable retryable job, and prevent concurrent mutations from recreating references during deletion.

### 4. High as activity grows: scoring causes full-dataset work on every tracked write

`backend/store.js:160,315` clones and rewrites the affected collection, then invokes `backend/larpscore.js:56`. Capture reads all opportunities, regular posts, reactions, applications and users, and builds event maps twice, decrypting all post/comment strings. This happens for text edits and read-state updates too, even when awards cannot change.

A read-only local observation of an unchanged-content capture read five collections totaling **1,235,966 bytes** and took approximately **57 ms**. It did not write a score event. This is a single local observation, not a production throughput benchmark. Concurrent traffic multiplies allocations, parsing and synchronous decryption; file queues then increase latency.

Calculate transitions from the specific changed post, like, application or comment. Store an indexed per-user total alongside event records in one transaction. Keep full reconciliation as a recovery/audit operation. Profile score lookup currently scans the entire global event ledger (`backend/larpscore.js:69`), not just that user's awards.

### 5. High for reliability/scaling: JSON queues provide neither cross-file transactions nor cross-process locking

`backend/store.js:56,315` serializes writes per file within one Node process. Atomic rename prevents partially written JSON from reaching readers, and parse/I/O failures correctly abort instead of overwriting data with an empty object. Those are useful protections.

However, post creation/deletion, quota reservation, score updates, media operations and account cleanup span multiple files. A crash can persist only some of an operation; a source mutation can persist before its score write fails, while the request returns an error. Startup reconciliation cannot reconstruct an exact deletion timestamp lost in that interval. Two application processes or a standalone migration running alongside the server can overwrite each other's changes. The files are not fsynced before success, so atomic replacement is also not a guarantee of power-loss durability.

Keep one writer until storage supports database transactions. Use foreign keys and unique constraints for ownership references, reactions and daily claims. Keep post mutations, score transitions and quota claims in a single database transaction; treat media files as separate resources with retryable cleanup.

### 6. Medium: feeds and individual lookups fetch more than needed

`backend/store.js:95` reads/parses a complete JSON file for every lookup, even `getById`. `backend/store.js:282` decrypts every opportunity before filtering by owner, project or moderation. `backend/routes/feed.routes.js:6` loads both full post collections and slices anonymous output afterward; signed-in users receive everything. Public project feeds also have no pagination. Filtering and sorting mostly happen after retrieval.

The current signed-in feed construction read seven files, including `projects.json` twice, totaling **206,349 bytes**, producing approximately **51,897 bytes** of JSON in **35 ms** in one local observation. Authentication, ranking and geocoding were excluded. Every authenticated request additionally loads sessions and typically the entire users collection. The frontend first calls both `/api/auth/me` and `/api/users/me` (`web_app/js/data.js:40`), then sends all feed candidates back to `/api/match/rank` in sequential batches of 50 (`:125`).

Introduce cursor pagination with explicit selected fields, filter before decryption, share a request-scoped project lookup and combine redundant identity/profile fetching. Rank server-side against stored candidates and return a page. Personalized pagination must preserve global ranking rather than rank only an arbitrary newest page. Avoid global decrypted caches until their access boundaries and invalidation are defined.

### 7. Medium: uploads can dominate memory and disk without an overall budget

`backend/routes/media.routes.js:6` buffers an entire request, up to 64 MiB, before project authorization and media inspection. There is no global upload-concurrency limit or per-user byte budget. Five unattached files is a count limit, not a cap on lifetime published media. Multiple project locks also do not enforce that count atomically across all uploads from one user.

`backend/media.js:60` cleans old unreferenced registry entries only at startup. A process crash between writing bytes and saving metadata can leave an unregistered file, which registry-only cleanup never sees. Images are identified from header bytes rather than fully decoded and dimension-checked; metadata is not stripped. Published media is deliberately public and its bytes are not encrypted at rest.

Authorize before accepting large bodies where possible; stream uploads, bound concurrent inspection, enforce per-user byte budgets and validate image dimensions. Strip unnecessary metadata such as EXIF location. Run periodic filesystem-to-registry reconciliation and orphan cleanup with an age grace period. At the allowed maximum, one new 64-MiB asset daily is roughly 23 GiB per user per year; this is a capacity scenario, not observed usage.

### 8. Medium: several collections grow indefinitely

Expired sessions are removed only when that specific token is presented or its user logs in again (`backend/auth.js:258`); 297 of the current 412 sessions are expired. Add scheduled expiration cleanup.

`publication-days.json` retains every historical publication although daily enforcement needs today's claims, including deleted posts. Prune old days and adjust migration detection so it does not backfill pruned history again. Score events retain inactive and permanent-award history indefinitely; compact into per-user totals while preserving stable deduplication identities and recovery semantics. Do not simply delete retained awards.

Comments and replies are embedded inside post records, have no count cap or pagination, and require decrypting/re-encrypting the containing post plus rewriting its whole collection. Their 200-word limit is not a character/byte limit: one huge token can approach the request-body limit. Use character bounds and separately indexed comments/replies. Saved-post IDs can be arbitrary/nonexistent and grow without a count cap (`backend/routes/user.routes.js:164`); validate references and define a limit. Staff logs and migration backups also need explicit retention.

### 9. Medium: encryption does not cover all stored information, and public responses use inconsistent projections

`backend/crypto.js:186` encrypts strings recursively but leaves numbers and booleans plaintext. Numeric ages and coordinates therefore remain readable at rest, as do root IDs, relationships, timestamps, application/reaction metadata, activity identifiers and media files. This is separate from what anonymous APIs expose. A single environment key protects all encrypted text and there is no key-version/rotation scheme.

Public profiles use a positive whitelist, which is good. Opportunity detail instead spreads the whole decrypted field object and removes two contact fields for anonymous visitors (`backend/routes/opportunity.routes.js:195`); regular detail also returns its full decrypted fields. No password or private-profile leak through these detail responses was demonstrated, but future stored fields can become public accidentally. Use explicit public response schemas, exclude internal read/moderation metadata, and define whether precise opportunity coordinates should be public. Signed-in readers intentionally receive opportunity contacts; that is weak protection against scraping and should be a deliberate policy.

The data directory and the existing decrypted project export are outside the Node static web root. Node serves `web_app` and staff assets, not `larpable_data` (`server.js:351,442`). This is not verification of production Nginx rules. Keep exports, `.env`, backups and private data inaccessible to the web server and apply restrictive filesystem permissions. Historical backups can retain deleted personal information even after live-data cleanup.

### 10. Lower priority: reads can perform writes or external work

`backend/routes/opportunity.routes.js:508` may geocode missing locations during feed retrieval, then asynchronously rewrite the opportunities collection. Both identity/profile endpoints can also geocode on GET. Failed lookups are not negatively cached, concurrent misses are not coalesced, and the timestamp-based 200-ms limiter is not a serialized queue. This creates repeated external requests and unpredictable feed latency, especially after restart.

Geocode on validated create/location edits or a bounded background job. Cache misses briefly and coalesce duplicate in-flight requests. Keep read-state updates small and explicit. The activity buffer already batches writes and retains about 30 days, which is useful; however, it clears before persistence (`backend/activity.js:118`), so a failed flush loses buffered analytics. Its high visitor/page bounds can also allow a large analytics file despite a day-based retention window.

## Suggested order

1. Rotate/remove the hardcoded admin credential; replace username moderation with explicit roles.
2. Fix account identity and deletion semantics, with migration tests for existing references and preserved point totals.
3. Reduce score capture to local event transitions; add feed pagination and narrow response schemas.
4. Add session/claim cleanup, upload concurrency/byte budgets and periodic orphan reconciliation.
5. Move transactional application metadata to SQLite on the current single host, keeping media as files and preserving encryption for private fields. Index posts by creator/project/date, comments by post/date, users by canonical username, and awards by recipient. Enable foreign keys explicitly. Consider a client/server database if the application later needs substantial simultaneous writing or multiple hosts.

SQLite is an architectural recommendation, not a change applied by this review. Its official documentation describes its suitability for low/medium-traffic websites, foreign-key enforcement and the same-host restriction of WAL:

- https://www.sqlite.org/whentouse.html
- https://www.sqlite.org/foreignkeys.html
- https://www.sqlite.org/wal.html

Preserve all existing migrations and use an additive, backed-up, verified transition. Do not replace JSON files with an empty database or introduce dual writers without a defined reconciliation strategy.
