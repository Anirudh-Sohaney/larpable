> Historical implementation notes. Completed one-time migrations were retired locally on 2026-10-31. See MIGRATION_RETIREMENT.md for current startup and recovery behavior; migration commands below are no longer available in this checkout.

# Deleted accounts and retrieval efficiency

Username-based moderation checks are case-sensitive in both the API and opportunity UI. Existing exact username/admin-role checks elsewhere are retained. Changing case does not grant the special moderator's privileges.

All three deletion entry points (self-service, admin, staff) call `backend/deleted_users.js`. A persisted `deletion_pending` marker disables account authentication while cleanup runs. Already queued writes finish before cleanup; content creation rechecks that the account is active inside its write queue. Cleanup batches each collection's updates, then removes the user last. A storage failure leaves the marker for startup recovery.

Deleted accounts lose projects, both kinds of posts, drafts, sent/received applications, likes, sessions, feedback state, staff membership and unused registered media. Comments and replies on surviving posts remain, with their text, IDs and dates, but their author becomes `deleted user` and `user_id` becomes null. They have no profile link, and recreating the username cannot reclaim them. Comments on removed posts disappear with those posts. Retained comments/replies continue to credit their surviving recipients; removed activity still follows the existing LarpScore 24-hour rule. Existing point history and daily publication claims remain, preserving their deduplication/quota semantics.

`backend/migrations/deleted-users-v6.js` is appended to the existing migration chain; earlier migrations remain unchanged. It detects absent/deleting authors and interrupted cleanup, repairs surviving comments/replies, and deletes orphaned associated records. Dry runs do not write. Corrected datasets produce no changes and preserve bytes/inodes on rerun. A missing `users.json` is reported in dry runs and blocks application rather than treating every author as deleted. The special system admin ID is not considered an orphan merely because it is outside the users collection.

Before migration changes, existing affected collections receive exclusive `.before-deleted-users-v6.bak` backups. Orphaned registered media binaries receive the same exclusive backup suffix before deletion. Runtime user-requested deletion does not create new personal-data backups. Existing historical backups are retained. Rollback requires stopping writers, preserving newer data, reverting code and selectively restoring the relevant backups and binary assets after reconciling later activity. This remains a single-writer JSON architecture, not a cross-file database transaction; do not run a standalone migration alongside the server.

Run `node backend/migrations/projects.js` for a preview and add `--apply` to apply the retained chain. Startup also runs it before serving requests. Old Oracle data will independently trigger the cleanup after code deployment; this work does not push or deploy remotely.

Efficiency improvements keep the storage format and APIs:

- Encrypted collection snapshots are cached after a filesystem signature check; cached files are limited to 2 MiB each and 32 entries. External edits/replacements invalidate them. Public store reads return isolated copies; record lookups clone only the selected record. No decrypted profile cache is introduced.
- Identical saves/updates and missing-record removals do not replace existing files. Missing empty collections are still created, and parse/I/O errors still abort writes.
- Score hooks identify changed parent IDs first, decrypt only those posts' comment trees and load only the relevant related collection. Full startup reconciliation remains available. Identical sources skip all snapshot reads.
- Owner/project/moderation filtering precedes opportunity decryption. Shared parent projects are decrypted once per batch. Public profile lookups select one user record; owned-project lookups copy only matching records.
- Browser initialization uses one `/api/users/me` request instead of sequential auth/profile requests. Existing API routes remain available.

One read-only local observation found warm mixed-feed construction needed zero JSON disk reads (previous uncached construction read seven files); an identical-source score check read zero bytes instead of approximately 1.24 MB. These are local observations, not production throughput guarantees. Changed collections still require full-file replacement; this deliberately avoids a database migration or new pagination behavior.

`npm test` includes `deleted-users.integration.js` and `store-efficiency.test.js`. Coverage includes case-variant denial, exact moderator access, all deletion entry points, preserved anonymous comments/replies, unclaimable historical comments, removed projects/posts/applications/media, recipient score preservation, backups, interrupted cleanup recovery, concurrent creation/deletion, no-op migration reruns, cache isolation/invalidation, concurrent updates and corruption safety. `npm run test:projects` verifies the retained project migration and startup against disposable legacy data. The browser fixture supports `--profiles --deleted-users`.
