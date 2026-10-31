# Project classification field

Nonprofit and company project records store encrypted `field`, validated against the canonical taxonomy. Ordinary projects never save this attribute. Create/edit forms show the canonical field selector for nonprofit/company and hide/disable it for project. Changing to project removes the field; changing to nonprofit/company requires one.

`backend/migrations/project-field-v7.js` remains in the app and runs at startup after architecture checks. It detects missing project fields and legacy opportunity `nonprofit_field`/`industry` values, creates exclusive backups, writes parent projects first, then removes classification from opportunity storage. Conflicting or missing source values require review rather than guessing. Existing project fields are preserved, including later owner edits. Retry after partial writes completes remaining work; corrected data produces zero updates and no file writes. No machine-local completion flag is used.

Read APIs resolve classification from the current parent. Legacy response names remain projections for existing consumers; they are not stored on opportunities. Post create/edit cannot set project classification. Project detail includes the parent field.

Local application: 25 projects updated (20 nonprofits, 5 companies), 26 opportunities cleaned; 23 ordinary projects have no field. Immediate rerun returned zero updates with identical project/opportunity hashes. Exclusive `.before-project-field-v7.bak` backups remain alongside data. Oracle has not been changed or deployed. Its old post-level classifications will trigger this retained migration when the code is deployed and restarted with its existing DATA_DIR/encryption key.

Verification: full npm test plus focused project-field dry-run, backup, interruption retry, content preservation and byte-stable rerun tests. Run one application writer during migration. Rollback requires stopping writers and selectively restoring backups after accounting for newer activity; do not overwrite live data with local datasets.
