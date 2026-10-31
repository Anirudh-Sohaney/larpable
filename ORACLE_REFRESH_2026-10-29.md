> Historical implementation notes. Completed one-time migrations were retired locally on 2026-10-31. See MIGRATION_RETIREMENT.md for current startup and recovery behavior; migration commands below are no longer available in this checkout.

# Read-only Oracle refresh — October 29, 2026

Connected through `ssh oracle`. Remote operations consisted of directory inspection, Python file reads/hashes and an rsync download from `/var/www/larpable_data/`. No remote application code, datasets, configuration, services or active application processes were changed. No application or migration was run remotely, and no code was pushed.

The source had 439 users, 51 legacy opportunities, 26 drafts and 31 application buckets. It had no project, regular-post, reaction or media collections. Ten source files totaling 1,615,020 bytes were downloaded. SHA-256 hashes matched before/after transfer, the local raw snapshot and a subsequent remote recheck. This was a live read-only capture, not a server-frozen database transaction.

Local archive directory, outside the repository:

`../backups/oracle-readonly-20261029T195907Z/`

- `data/`: untouched encrypted Oracle snapshot.
- `manifest.json` and `remote-recheck.json`: source hashes and verification results.
- `local-before-refresh/`: complete previous local dataset, including local-only regular posts/media and migration backups.
- `preview-data/`: migrated merged rehearsal.
- `fresh-data/`: migrated Oracle-only rehearsal, proving first deployment without existing architecture collections.
- `local-refresh.json`: local replacement/preservation record.

Only the localhost process was stopped while building and replacing the local dataset. Oracle legacy collections replaced their local counterparts. Architecture collections absent on Oracle were preserved locally, including the existing regular post, reactions and media bytes. All changes after copying were made through retained migration code. Localhost was restarted on port 8000.

## Newly reviewed project

`opp_4dbd589ee513c70deb86d14b` is Vellune. Its original post identifies it as a nonprofit and describes thoughtful reading, literary criticism and engagement with literature. The post's selected skills are Operations, Creative Writing, Project Planning and Strategy.

The retained project catalog now supplies this pitch:

> A literary initiative supporting thoughtful reading, literary criticism, and meaningful engagement with literature.

The project ID is `prj_4dbd589ee513c70deb86d14b`. Type is derived from the original post, and tags retain the selected canonical skills. The original summary ends mid-sentence; no missing text or unsupported program details were invented. A web search returned unrelated same-name businesses/apps without a reliable Singapore literary-initiative match, so no external claims were imported.

Adding the entry to `backend/migrations/project-catalog.js` reuses the existing missing-project detection, content revision, linking and title-removal migrations. Old migration files remain intact. On an old server dataset, the missing projects/links trigger migration; corrected records and later user edits remain unchanged on reruns.

## Local result and verification

The refreshed local dataset contains **439 users, 48 projects, 51 opportunities and the preserved local regular post**. All Oracle opportunity creators, dates, summaries, roles, contacts, selected skills, comments and replies were checked against the source. Titles move to project identity; existing canonicalization and deleted-user cleanup rules remain active. The latter anonymized one comment and removed one orphan draft. Twenty-six legacy drafts were classified as opportunities, leaving 25 after that cleanup. No legacy recruiting post was invented or reclassified as a regular update.

The Oracle-only rehearsal created all 48 projects and initialized empty regular-post/reaction/media storage through v4. The merged rehearsal created only the new project and preserved existing regular-post/media files byte for byte. Both rehearsals and the final local result passed byte/inode-stable reruns with zero additional work.

`tests/oracle-refresh.integration.js` uses disposable synthetic users and the public source text. It verifies the new catalog entry, original nonprofit type/skills, preservation of opportunity content, removal of legacy title, encrypted project fields, interrupted migration recovery, backups, empty regular-post setup, preservation of later regular posts/project edits and mixed-feed/detail APIs. It runs under `npm test`. `npm run test:projects` continues to test the older baseline independently.

To restore the prior local dataset, stop localhost, preserve any newer local work and restore `local-before-refresh/` to `../larpable_data/`. The raw Oracle copy remains available separately. Never restore these files to Oracle as part of this local review.

## Deployment verification

A subsequent read-only remote check confirmed `DATA_DIR=/var/www/larpable_data`, the same encryption key as the tested snapshot, Node v18.19.1 and unchanged source JSON hashes. Mediabunny was not yet installed remotely.

The full server startup was then exercised locally under Node v18.19.1 against another disposable, untouched Oracle snapshot. Requests waited for migration completion. All 51 opportunity IDs, authors, timestamps and content survived the defined transformations; 439 users became associated with 48 projects. Users, applications, sessions, feedback, staff, activity and notifications remained byte-identical in this test. The intentional cleanup removed one orphan draft and anonymized one comment; original opportunities/drafts had backups. A second migration pass was byte-stable. The Vellune/mixed-feed integration test also passed under Node v18.19.1.

Deployment must preserve the server's `.env` and data directory, install dependencies from the supplied lockfile (`npm ci`) and restart the application with only one data writer. Copying files into a running code directory alone does not execute migrations or install missing packages. Do not copy local `.env`, `node_modules` or local datasets over production. The existing JSON store does not provide a cross-file transaction, so this verifies the current snapshot's successful migration rather than promising immunity from disk failures or concurrent writers. No deployment was performed during verification.
