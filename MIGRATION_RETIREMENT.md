# Local migration retirement ? 2026-10-31

Completed project backfill, curated content corrections, opportunity title removal/linking, draft classification, canonical-value conversion, historical score/quota backfill and orphan repair were removed from the application. `backend/migrations/` and migration-only tests are archived outside this checkout.

Current startup (`backend/startup.js`) checks project ownership/type, required project content, parent links, absence of stored opportunity titles and classified draft kinds before writing. Unsupported old architecture returns startup failure/503; it is not automatically converted. Private classified opportunity drafts can still await an owner-selected project. Startup creates missing empty collections/media directory, resumes pending account deletion, reconciles interrupted score transitions and cleans unused uploads. Project validation now lives in `backend/project_fields.js`.

Runtime deletion, score event identity/24-hour retention, publication quotas, media handling, canonical input normalization, legacy password upgrades and admin coordinate repair remain. Coordinate repair is still useful for users without coordinates. Project field/industry collection remains unchanged and is a separate issue.

## Evidence

Read-only Oracle download: 439 users, 48 projects and 52 opportunities in the final snapshot. Local data contains 51 opportunities and one regular post and was not replaced. Earlier complete migration rehearsal on an isolated Oracle copy produced zero data changes, including no canonicalization, project additions/revisions/links, score/quota backfill or orphan repair.

New startup ran twice against isolated local/Oracle copies with zero changed file hashes. The final live Oracle snapshot also started with zero changed data files and zero score changes. Fresh initialization, stable reruns, refusal of legacy architecture before writes, pending-deletion recovery and runtime API tests pass. `npm test` passed after removal. No remaining executable imports refer to retired migrations.

Oracle continued receiving normal live activity during the review; those changes are not overwritten. All remote commands in this cleanup were read-only SSH file reads/hashes. No remote source, data, configuration, service or process was changed by this work. Local live dataset hashes match the pre-cleanup manifest.

## Rollback and old snapshots

Archive: `../backups/migration-retirement-20261031T160958Z/`. `source-before-cleanup.tar.gz` preserves the complete pre-cleanup local source, including preexisting uncommitted work; `retired/` contains removed migration files/tests. Audit JSON files and isolated dataset copies are alongside it. Existing data backups and migration metadata are preserved.

To handle an unmigrated historical dataset, use the archived release in an isolated directory with an explicit scratch DATA_DIR and the matching encryption environment. Review its migration output before adopting that dataset. Do not extract old source or overwrite data in a running deployment. This local cleanup has not been deployed to Oracle. Continue using one application writer; cross-file crash atomicity remains limited by the JSON store.
