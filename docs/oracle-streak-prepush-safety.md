# Oracle streak deployment safety verification

Verified 2026-11-15 UTC against production release
`2345f8d86351011e24312df9ed6cfacba5db46ff`.

Conclusion: the proposed release is compatible with the inspected production
state. The production-data rehearsal lost no existing records, fields or files.
Production was inspected read-only through `ssh oracle`; no production files were
edited, application/migration code executed there, services restarted, or Git
changes pushed.

## Actual deployment and storage

`/var/www/larpable.me` points to a versioned release. The production `.env` uses
absolute `DATA_DIR=/var/www/larpable_data`, outside the release tree. The deployer
copies the existing `.env` into staging; no local data or local `.env` is uploaded
by the repository archive. Data files and `.env` are not tracked in this repo.

`/var/www/larpable_deploy/auto-deploy.sh` stages code and production dependencies,
checks startup against its own disposable data copy, stops the web writer, saves
a complete `/var/www/larpable_data` snapshot in the deploy directory, switches the
release symlink and restarts the service. Staging explicitly overrides DATA_DIR;
production continues using the external data directory. The observed production
web process is the single application writer, running as ubuntu on Node 18.19.1.
Data is ubuntu-owned, with 72 GB and ample inodes free on the data filesystem.

The 55 captured production backend/package files exactly matched local HEAD.
Consequently the rehearsal assessed the actual transition from deployed code,
including all existing startup migrations, rather than assuming an older format.

## Rehearsal using current production data

A read-only capture downloaded all 36 data/media/backup files (59,327,599 bytes).
The capture checked inode, size and timestamps across the read and recorded SHA-256
hashes. All raw files remain outside the Git repository in a protected archive:
`../backups/oracle-streak-prepush-20261115T052215Z/`.
Only `rehearsal-data/` under that archive was modified by application startup.
The production encryption key was checked by fingerprint against the local key;
no production .env, API secrets or encryption keys were downloaded or committed.

Full proposed `backend/startup.run()` ran on the disposable production-data copy
under Node **18.19.1**, the actual production runtime. Results:

- All **452 users** retained their original account IDs and every original field,
  including encrypted profiles, password records, preferences and unknown fields.
- Only `users.json` changed, adding `streak: 0`, nullable `last_post_at`, and
  `streak_version: 1`. Last publication timestamps matched remaining source posts;
  49 users had a previous publication.
- All original **6 regular posts**, **55 opportunities**, **54 projects**, drafts,
  applications, sessions, staff records, reaction/score/publication ledgers,
  media files, existing backups and other captured files remained byte-identical.
- Historical LarpScore totals were unchanged for every user. Score reconciliation
  reported zero event updates. Existing field/promotion migrations required zero
  changes; no pending account deletion or stale media cleanup was due.
- `users.json.before-streak-v9.bak` exactly matched the original user file.
- No original file was removed. A second complete startup was byte-stable.

The complete repository test command also passed with exit code 0 under Node
18.19.1, including synthetic failures, actual child-process crashes, independent
80-publication arithmetic checks, additive initialization and backup retries.
The separate review found no blocking data-loss defect in the proposed change.

## Final production recheck

After rehearsal, read-only SSH hashing confirmed every captured production data
file and captured code file was unchanged and no file was missing. The web service
was still active with the same PID (137839). GitHub main still pointed to the
inspected commit. No deployment occurred during this verification.

## Scope and limits

This establishes safety for the inspected state and the supported single-writer
JSON store; it is not a guarantee against disk failure or external interference.
The real restart will add the metadata through application startup, after making
its exclusive complete user backup. Existing user fields will be preserved.

The deployer's rollback switches code, not data. This migration is additive and
older code can still read those users; accepting new publications while rolled
back would omit new streak metadata. Staging's live-data copy is not a database
transaction, but its final pre-switch snapshot is taken after stopping the writer.
Neither behavior was changed for this feature.

Unverifiable pre-feature publication reservations do not establish a streak
baseline, because failed reservations and later-deleted successful posts cannot
be distinguished. The reservations themselves are retained. No existing initialized
streaks or production content are reset or deleted by this rollout policy.
