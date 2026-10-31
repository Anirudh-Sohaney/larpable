> Historical implementation notes. Completed one-time migrations were retired locally on 2026-10-31. See MIGRATION_RETIREMENT.md for current startup and recovery behavior; migration commands below are no longer available in this checkout.

# LarpScore and daily publishing (v5)

Public profiles expose a numeric `larpscore`, starting at zero. Existing activity is backfilled by the retained startup migration chain, after v4. No source posts, comments or user profiles are rewritten by v5.

| Activity | Recipient | Points |
| --- | --- | --- |
| Approved regular post or opportunity | Author | 5 |
| Regular post receives a like | Author | 3 |
| Opportunity receives an application | Author | 3 |
| Post receives a top-level comment from another user | Author | 2 |
| Comment on someone else's post receives a reply from another user | Comment author | 2 |
| Top-level comment on someone else's post | Comment author | 1 |

Self interactions earn nothing. Each event counts immediately. Removing it before 24 hours reverses its awards; removing it at or after 24 hours retains them permanently. Deleting a parent also removes its live child events, evaluated against each child's own timestamp. A retained like/application cannot earn a second award by removing and adding it again. Missing legacy event timestamps conservatively start the window when observed. Already-deleted history from before this feature cannot be reconstructed.

`larpscore-events.json` stores stable event identities, timestamps, status and numeric awards, without post/comment text or private profile fields. Awards include the recipient account's creation timestamp, so recreating a deleted username does not inherit its score. Store write hooks capture transitions from normal routes, moderation and account cleanup. Profile reads only sum the ledger and never mutate it. Flagged content earns no points while held.

`publication-days.json` records publication claims across both post types. One successful submission per user per UTC calendar day is allowed, resetting at 00:00 UTC. A held submission consumes the allowance too. Draft saves and edits remain available (the existing five-draft limit remains). Deletion does not refund the day. Per-user queues prevent concurrent cross-project/cross-type submissions from bypassing the limit. Validation failures do not consume it.

## Migration and recovery

Run `node backend/migrations/projects.js` to preview the retained migration chain and add `--apply` to apply it. Startup also runs this chain before serving requests. V5 detects missing collections and missing historical events/claims; corrected datasets produce zero work and byte-identical reruns. Existing ledgers receive exclusive `.before-larpscore-v5.bak` backups before migration updates. Partial migration failure is observable and retryable. Existing migrations remain intact; an old Oracle dataset independently triggers them after code deployment.

Run one application writer, as required by the existing JSON store. Stop the server before a standalone migration. Source mutations and score writes are individually atomic, not a cross-file transaction: a storage error is reported and startup reconciliation repairs missing transitions from remaining activity. If a process crashes between a source deletion and its score write, its exact deletion time cannot be recovered; reconciliation uses observation time. Publication claims are reserved before writes; normal failed writes release the claim when no post persisted. A crash during reservation can conservatively consume the day until the next UTC reset.

Rollback: stop writers, archive both new ledgers, and revert application code. Source datasets require no v5 restoration. Keep the ledgers for forward recovery; do not restore an old full ledger over newer activity. Older code cannot enforce the new quota or record deletion times, so avoid mixed-version writers.

## Verification and farming limits

`npm test` includes scoring weights, self exclusions, historical backfill, interrupted migration retry, byte-stable reruns, early/mature removals, exact 24-hour retention, re-like deduplication, parent deletion, account generations, concurrent publishing, blocked drafts, editing, deletion bypass prevention, UTC midnight and failed-write recovery. Existing integration fixtures advance a test-only clock between legitimate publications; production enforcement has no test bypass.

Alternate accounts and coordinated engagement can still farm points. Comments, replies and applications have no scoring cap. Waiting 24 hours before deletion preserves points intentionally. Self exclusions and stable like/application identities reduce simple farming but do not detect coordinated accounts. The daily publishing limit does not cap engagement.
