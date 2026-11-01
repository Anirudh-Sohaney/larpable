# Post promotion

Both post collections store top-level boolean `promoted`, default false. The retained startup migration `promoted-v8.js` adds only absent flags through atomic updates, backs up affected collections exclusively, and preserves all existing fields and explicit values. It re-detects data on each server; corrected datasets produce no writes. Partial failure is retryable. No local data is copied onto Oracle.

Only the exact stored account username `anisohaney` can explicitly set this flag, only on posts it owns. Backend checks load the account independently of request profile/roles, reject inactive accounts, require strict booleans and reject admin/case-variant/non-owner attempts. Other users omit the field; new posts default false. Existing owner/admin content-edit permissions do not grant promotion rights. Draft autosaves validate the flag and publishing rechecks it.

The editor displays PROMOTE only to the exact account; this is convenience, not authorization. Create, edit and draft restoration support both post kinds. Feed responses expose a strict boolean. For you applies normal filters/search first, then promotes eligible posts ahead of ranking and unread replies. Within each promotion group the previous sorting remains; Newest/Oldest are unchanged. Gold borders distinguish promoted cards. Held/flagged content remains subject to existing visibility gates.

`tests/promotion.integration.js` covers authorization, malformed inputs, ownership, both APIs, creation, draft publishing, migration dry-run/backups/interruption/no-op, preserved true flags, response flags and filter-aware sorting. The feature has not been pushed or deployed as part of this work.
