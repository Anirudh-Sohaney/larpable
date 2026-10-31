# Database and codebase audit

Reviewed 2026-10-27. Scope: the current `larpable.me/` worktree, its configured local data directory, backend routes and storage, matching, staff portal, public frontend, and outreach agent. The three previously requested security fixes are included in the reviewed worktree. No application source or existing database records were changed during this audit.

## Assessment

The current database is small. The primary risks are uncontrolled record growth, whole-collection reads and rewrites, and incomplete transaction boundaries. The likely failure modes are slow responses, event-loop stalls, memory/disk exhaustion, and lost updates; ordinary numeric overflow is not the main concern.

The highest-value sequence is to enforce persistent data limits, fix the migration race and retention gaps, and then replace the JSON persistence layer with indexed transactional storage. Deleting unused frontend code is useful maintenance, but will not solve the database bottleneck.

## Local snapshot

These are local configured data, not verified production metrics. Only counts and sizes are included; no personal values are reproduced.

| Collection | Bytes on disk | Observed contents |
|---|---:|---|
| users.json | 1,082,235 | 426 users |
| opportunities.json | 97,509 | 46 posts, 24 comments, 4 replies |
| sessions.json | 82,420 | 406 sessions; 295 expired |
| drafts.json | 13,468 | 23 drafts; 1 references a missing user |
| applications.json | 6,515 | 24 post buckets; no missing-post or missing-user references found |
| feedback.json | 14,731 | 15 feedback records, prompt state for 17 users |
| staff.json | 27,149 | 5 members, 54 logs, 8 team goals, 2 tasks |
| activity.json | 109,903 | 9 days, 306 visitor-day records, 702 page entries |
| notifications.json | 44 | Small nightly-run guard |

Total application JSON is approximately 1.43 MB. Separately, `backend/matching/vectors.json` is 3,116,825 bytes for 149 vectors of 1,024 dimensions. It is static matching data, not growing user data.

## Measurements

Benchmarks ran against temporary directories and a local ephemeral HTTP listener, with synthetic encrypted records. Existing data were read only for aggregate inspection. External email was disabled; geocoding was stubbed. Timings depend on this machine and fixture shape and are not production capacity estimates.

| Operation | Synthetic data | Result |
|---|---|---|
| Read one profile | 426 users / 0.75 MB users file | 13 ms median of 3 |
| Read one profile | 5,000 users / 8.81 MB | 88 ms median of 3 |
| Read one profile | 20,000 users / 35.25 MB | 304 ms median of 3 |
| Change one name | 20,000 users | 1,232 ms; 3 full users reads totaling 105,746,676 bytes, plus a 35,248,892-byte rewrite |
| Anonymous six-card feed | 100 posts, no comments | 17 ms median; 89,392 bytes read |
| Same six-card feed | 100 posts, 100 comments each | 491 ms median; 5,489,992 bytes read; identical 3,583-byte response |
| Update skills | 20,000 duplicate one-character skills; 80,012-byte JSON request | Accepted; users file became 1,240,146 bytes for one user |
| Create post | 200,000-character title | Accepted; one-post file became 267,781 bytes |
| Create drafts concurrently | 10 simultaneous requests for one user | All accepted; 10 drafts stored despite the five-draft limit |
| Track distinct pages | 1,500 pages, flush, then 1,500 new pages, flush | 3,000 persisted pages for one visitor despite the 2,000-page limit |
| Geocode ten different locations concurrently | Stubbed network | First started at 0 ms; the other nine started at 200–201 ms, rather than 200 ms apart |

Additional deterministic proof: a migration write was interleaved with a successful post creation after the migration took its snapshot. The newly created post disappeared when that stale snapshot was written. A VM comparison of 300 matching inputs also produced identical feed match scores with all vectors removed from the vector lookup.

## Findings, ranked by impact

### 1. High: small edits read and rewrite entire collections

Evidence: `backend/store.js:93`, `:136`, `:158`, `:295`; `backend/routes/user.routes.js:120`, `:139`.

`getById()` reads and parses the entire file. `save()`, `remove()` and `atomicUpdate()` read and stringify the entire collection. A profile update adds an authenticated-user lookup, a separate raw-user lookup, and the update's own read: three full users reads. All writes to each file wait on one promise chain. That queue has no pending-work bound or cancellation, so sustained writes can retain request closures and payloads while latency grows. JSON parsing/stringifying and field encryption are synchronous even though disk I/O is asynchronous.

At 20,000 synthetic users, a name change moved about 141 MB through the read/write layer. This is the central scaling problem. In addition, an atomic rewrite needs space for both the existing file and its temporary replacement.

Small immediate improvement: eliminate the extra pre-update profile read when it can be folded into the atomic callback. Structural fix: indexed row-level storage rather than expanding the custom JSON store into a database implementation.

### 2. High: persisted input limits are inconsistent and insufficient

Evidence: `backend/routes/user.routes.js:101`, `:146`; `backend/routes/opportunity.routes.js:340`, `:434`; `backend/post_content.js:6`; `backend/routes/auth.routes.js:47`.

Profile PATCH accepts unbounded skills/interests arrays and mostly unrestricted values for its allowed fields. It does not apply signup's 100-item and 120-character limits. Post creation has a minimum skill count and description word limit, but no comparable maximum skill count or title/details/contact size limits. Comments/replies have word limits, which do not constrain a single very long word. Signup also persists arbitrary additional profile keys through its rest object.

The 1 MB request-body limit is useful but applies per request, not per account, post, collection, or retained total. Encrypting every small string separately can enlarge an accepted array substantially, as the 80 KB skills request demonstrates.

Fix: use small explicit schemas with types, character limits, list lengths, duplicate removal, and whitelisted keys at every write boundary. Reuse the same rules for signup/profile edits and create/edit/publish. The existing experience validator (`backend/experiences.js:17`) already demonstrates this approach without a large validation framework.

### 3. High: the startup migration can overwrite acknowledged writes

Evidence: `server.js:438`; `backend/migrations/normalize-values.js:36`, `:53`, `:79`.

The server begins listening before running the migration. Each migration reads a snapshot outside the write queue, transforms it, and later calls `store.write()`. Serializing only that final write does not make the preceding read-modify-write atomic. A post/profile/draft mutation that commits between those steps can be overwritten. Confirmed with deterministic interleaving.

Fix: finish migration before accepting traffic, and perform each collection transformation inside `atomicUpdate()` rather than writing a stale snapshot. Prefer a versioned migration over rescanning all records at every restart once the normalization is complete.

Related architectural constraint: the store's queues exist only in one Node process. They do not coordinate multiple app workers or outside writers. A rename avoids partial-file reads, but does not prevent two processes from reading the same old version and replacing one another's updates.

### 4. High: feed work includes all posts and their complete comment histories

Evidence: `backend/store.js:271`; `backend/routes/opportunity.routes.js:73`, `:93`; `web_app/js/data.js:111`; `web_app/js/feed.js:26`, `:159`.

All opportunity fields, including nested comments and replies, are decrypted before public/owner/type filtering finishes. Even the anonymous six-card cap is applied after all records have been decrypted. Signed-in readers receive the entire card list and then send it back in batches of 50 for ranking. The browser renders the whole list again on each search input.

Adding 10,000 comments across 100 synthetic posts increased a six-card response from 17 ms to 491 ms without changing the response body. Comments are embedded in the same file, so adding one also rewrites every other post.

Fix: separate comments/replies from post records, maintain only counts/latest unread timestamps for card summaries, and paginate the server response before loading detail content. Rank/filter the page candidates on the server instead of returning all cards and uploading them again. Preserve the intended global ranking when defining candidate selection; simply ranking arbitrary pages would change behavior.

### 5. High during taxonomy edits: Python embedding blocks the HTTP process

Evidence: `staff/routes/staff.routes.js:1602`, `:1683`.

`spawnSync()` runs model loading and embedding in the request handler with a 300,000 ms timeout and a 100 MB output limit. While it waits, the Node event loop cannot serve other users. The taxonomy lock does not solve that blocking.

Fix: invoke the same script asynchronously with bounded output/concurrency. A separate worker service is not required to remove this stall. The smaller synchronous git-history and directory-size operations are lower-priority examples of the same pattern (`:989`, `:1511`).

### 6. Medium: analytics limits reset at each flush

Evidence: `backend/activity.js:75`, `:88`, `:109`, `:119`; `backend/routes/activity.routes.js:19`.

The visitor and page limits apply only to the in-memory buffer. `flushActivity()` clears it, then merges into persistent records without checking the accumulated day's counts. Distinct arbitrary paths are accepted, including non-existent pages. The file can therefore exceed the advertised daily limits. A 30-day retention window bounds age, not daily volume.

Every flush reads and rewrites the whole retained history; dashboard summaries read it again. The buffer is cleared before persistence succeeds, so a failed write also loses the pending counts.

Fix: whitelist tracked routes, store only the visitor/funnel facts the dashboard actually needs, enforce limits on merged data, and keep a global buffer budget. Restore the snapshot after a failed flush. Compact daily counters plus small visitor flags are substantially smaller than an arbitrary per-visitor page dictionary.

### 7. Medium: expired sessions and deleted-account data accumulate

Evidence: `backend/auth.js:234`, `:258`; `backend/routes/user.routes.js:203`; `backend/routes/admin.routes.js:76`; `staff/routes/staff.routes.js:1842`.

Session creation removes sessions only for the same user. Expired sessions are deleted only when their exact token is presented again. Users who never return leave stale sessions behind. The local snapshot contains 295 expired sessions, about 73% of the session file.

Self-service account deletion and the admin deletion route omit drafts. The separate staff deletion route does remove them. One orphan draft exists locally, and an isolated account-deletion test left drafts after returning success. Comments/replies and saved-post references also need an explicit deletion/retention policy; their current lifecycle is separate from the account/post lifecycle.

Fix: prune expired sessions in one periodic batch, and share one account-deletion routine across all three routes. Batch removal of the user's posts/applications rather than rewriting those collections once per post. Define whether public comments should be deleted or anonymized instead of leaving that behavior accidental.

### 8. Medium: draft quotas and saved-post storage can grow beyond intended bounds

Evidence: `backend/routes/draft.routes.js:104`; `backend/routes/user.routes.js:164`.

Draft counting and eviction occur before entering the write queue, so concurrent requests all act on the same stale count. Ten simultaneous creates stored ten drafts. The two create branches also duplicate the inserted record.

Saved-post writes accept any identifier without checking whether the post exists, have no list maximum, and re-encrypt the whole user profile. Posting a nonexistent identifier succeeds.

Fix: count, evict, and insert drafts in one atomic callback; this also removes the duplicate branches. Validate saved-post targets, set a reasonable cap, and remove stale links when posts are deleted. An indexed `(user_id, opportunity_id)` relation avoids growing an encrypted array in every profile rewrite.

### 9. Medium: geocoding sits on the feed's request path and its limiter does not serialize starts

Evidence: `backend/geocode.js:27`; `backend/routes/opportunity.routes.js:842`.

The feed starts lookups with `Promise.all()`. Calls calculate their delay from the same `lastCall` value, so they wake together. Nine of ten test calls started within one millisecond of each other after the first delay. Failed lookups are not cached, concurrent requests for the same location are not shared, and the success cache has no capacity or expiry. Successful first-time enrichments each enqueue another full opportunities rewrite.

Fix: geocode on location changes, persist the result there, and remove that external dependency from normal feed reads. If a repair path remains, use one bounded queue, share in-flight lookups, briefly cache failures, and batch coordinate persistence.

### 10. Medium: nominal reads and archive operations still create avoidable writes/work

Evidence: `backend/routes/feedback.routes.js:41`; `backend/feedback.js:40`; `staff/routes/staff.routes.js:1319`, `:1424`, `:1447`.

The feedback-prompt GET decrypts all opportunities and always enters an atomic feedback rewrite, including when it returns no prompt. Its duplicate checks scan every feedback record for each candidate post. Staff overview scans users again for every day since launch, even though the UI renders a short growth chart. A `count` map is calculated there and never used. The goal archive moves data into another collection inside the same `staff.json`, so it does not reduce the file that all staff operations read. Generic staff collection creation also bypasses the older team-goal route's 15-goal limit. Goal-completion histories and other staff collections have no comparable retention cap.

Fix: skip writes when no state changed, build feedback membership sets once, count registrations by day in one pass, remove the unused map, and move archives out of the actively loaded document. Put retention/quota rules in the single write path used by the live UI.

### 11. Medium: outreach has a separate unbounded/non-transactional persistence path

Evidence: `outreach_agent/index.js:43`; `outreach_agent/agent_core.js:19`; `staff/routes/staff.routes.js:2053`, `:2070`, `:2094`; `staff/components/outreach.js:40`.

The agent and staff UI both read/replace `outreached.json` without a shared lock or atomic rename, so completion edits and newly generated records can overwrite each other. The file lives under the checkout rather than the main data directory; verify deployment preservation. The avoid list grows with every prior organization and is copied into model prompts. Tool history is resent on every iteration, although each agent run has a ten-iteration bound.

Pipeline stdout/stderr are retained in an unbounded in-memory array and joined into the complete status response every two seconds. Polling continues even when a finished pipeline is idle until the tab changes. This becomes expensive as logs grow and competes for the same per-IP API rate limit.

Fix: store outreach records through one durable persistence path; cap/rotate logs and return only data after a cursor; poll only while running. Deduplicate organizations by a stable key, and pass a bounded relevant avoid set rather than all historical records.

## Simplifications worth making

1. **Remove the unused legacy staff controller.** `staff/staff.js` is 1,090 lines / 41,039 bytes. The current `staff/staff.html` loads `staff_app.js`, `staff_data.js`, utilities, and components instead. Repository searches found no active script include for `staff.js`. It does not currently cost page-load time, but is a strong deletion candidate after confirming no external consumer deliberately includes that public asset.

2. **Replace the loaded staff demo fixtures with a small empty live state.** `staff/staff_data.js:19` defines roughly 240 lines of example users, tasks, goals, resources, statistics, and storage sizes before live hydration. Its bottom-of-file resolver falls back to a demo administrator. The real app separately authenticates correctly, so this is redundant UI state rather than evidence of a backend authorization bypass. Some fields are never hydrated: `getDataInfo()` at line 410 still returns the hardcoded sizes at line 230, which the Admin panel renders. Thus the storage screen does not report actual database growth. Remove fictitious values and wire the existing live endpoint or omit unavailable metrics.

3. **Unify staff goal APIs and schema.** Both specialized goal routes and `/data/:collection` implement overlapping mutations with different validation, audit logging, completion tracking, permission handling, and field naming. The UI currently calls the generic path. The backend's `user_goals` buckets are objects, but `hydrateLive()` calls `.map()` on each bucket (`staff/staff_data.js:285`), so a legitimate nonempty bucket can break portal initialization. Choose one stored shape and one mutation implementation, retaining old URLs as thin delegates only if required.

4. **Simplify the feed matching story before expanding vectors.** In `backend/matching/similarity.js:42`, a non-exact, non-neighborhood target with a vector returns zero immediately. If it has no vector, `bestAgainst()` also returns zero because its target vector is missing. Therefore its semantic fallback cannot affect feed matching. Removing the vector lookup produced the same scores for 300 sample inputs; the branch logic explains why. The 3.1 MB file is still used by the separate similarity diagnostic API, so deleting it outright would change that endpoint. Either make semantic ranking an intentional feature with tests or keep the simpler exact/neighborhood ranking and load diagnostic vectors only when needed. Staff embedding also needs a deliberate decision about its ranking purpose.

5. **Keep one canonical field mapping.** `backend/canonical.js` and `backend/matching/similarity.js` duplicate legacy mappings and disagree on values such as `Food & Beverage` and `Non-profit / Social Enterprise`. Reuse the canonical helper to reduce both code and inconsistent results.

6. **Remove unused direct dependencies and tiny dead branches.** The root `uuid` dependency has no code references; the project already uses Node crypto identifiers. The outreach workspace declares `zod` directly without importing it; it may remain transitively required by its SDKs. `bestAgainst()` is ineffective in the feed path; the staff overview's `count`/`countValues` is unused. These are small, low-risk cleanup candidates, not a large performance project.

7. **Consolidate duplicated post presentation cautiously.** The three older `opportunity_student.html`, `opportunity_nonprofit.html`, and `opportunity_company.html` pages total 1,240 lines. The active feed uses the shared `opportunity.html`. Preserve old inbound links with redirects if consolidating them. Design/demo pages (`elements.html`, `font_and_theme.html`, `logo.html`, `test_matches.html`) should live outside the production public surface if they are only developer references; absence of internal links alone is insufficient evidence to delete externally used URLs.

8. **Retire compatibility adapters after an explicit migration.** CamelCase/snake_case fallbacks, array/object collection adapters, and duplicated account-deletion/auth checks recur across routes. Adopt one schema and shared authorization/deletion functions. Avoid introducing a generic framework solely to remove a few lines; extract only behavior that actually has multiple callers.

## Storage design that removes the recurring problems

For the current single-host architecture, a single SQLite database is a reasonable next candidate rather than adding multiple services. SQLite's own guidance lists low/medium traffic websites and replacement of custom application files as suitable uses: [appropriate uses](https://www.sqlite.org/whentouse.html). Reassess against actual concurrent writes and deployment topology before choosing it.

Suggested tables: users, sessions, opportunities, comments (with an optional parent comment), applications, saved_posts, drafts, feedback, feedback_prompt_state, staff_members, staff_permissions, goals, tasks, events, resources, staff_logs, daily_activity, and outreach organizations. These are logical collections; they do not require separate services.

Start with indexes/constraints that match existing requests: unique username lookup; session token hash and expiry; posts by author/date/moderation status; comments by post/date; unique applications and saves by `(opportunity_id, user_id)`; drafts by owner/update time; and unique feedback ownership keys. Use transactions for publish-and-remove-draft and account deletion. Explicitly enable foreign-key enforcement and choose cascade/anonymization rules; SQLite documents that enforcement must be enabled per connection: [foreign-key support](https://www.sqlite.org/foreignkeys.html).

Keep sensitive data encrypted. The local profile inspection counted 8,931 encrypted strings, with 596 KB of ciphertext string values; decrypted profile JSON was about 238 KB. Encrypting one bounded profile payload per user could reduce envelope overhead and crypto calls while retaining protection, but leave indexed identifiers, relationships, dates and deliberately queryable fields separate. This is a schema design option, not a reason to drop encryption or an emergency migration requirement. Minifying all current application JSON would save approximately 228 KB; that is a small optimization compared with eliminating whole-file rewrites.

Perform any migration with a backup, validated record counts and relationships, a rollback path, and a controlled cutover. Do not add dual writes casually: the current code already demonstrates why cross-store consistency is difficult.

## Existing protections to preserve

- The store already serializes writes within one process, uses temporary files plus rename, and propagates persistence failures. Preserve these protections while JSON remains.
- Request bodies have a 1 MB cap. Rate-limit buckets have a 50,000-entry bound and cleanup.
- Password hashing has a three-job concurrency cap and 250 pending-job limit; it is not an unbounded queue.
- Experience validation already limits counts, field lengths, and skill duplication.
- Activity has a retention window, and `addLog()` trims staff logs above 5,000 entries. These are useful controls even though other growth paths remain.
- The public feed no longer polls all data continuously. Do not reintroduce that behavior as a freshness fix.
- `notifications.json` is a tiny guard; it is not a meaningful storage risk. The static vector asset is also not the primary exhaustion risk.

## Verification and limitations

`RESEND_API_KEY= npm test` passed, including the three earlier security regressions. `npm --workspace outreach_agent test` passed its syntax checks. These tests do not cover the new quota, retention, performance, or migration interleaving findings; passing them does not disprove those findings.

The audit additionally executed the temporary-data reproductions and measurements described above. The migration test deliberately controlled interleaving; it proves the unsafe ordering can lose a write, not how frequently production triggers it. The current source proves the multi-process coordination gap; a production worker configuration was not inspected. No model calls, real geocoding requests, or production load tests were performed. Deployment backup/restore guarantees and external access to old static URLs remain operational questions outside the evidence available here.

All previous source changes remain uncommitted. This audit added only this report; no cleanup, migration, dependency removal, or data pruning was applied, and nothing was pushed.

## Follow-up: unused-code cleanup

The subsequent requested cleanup removed a net 1,622 lines from application source: the unused legacy staff controller, overwritten demo fixtures and demo session resolver, unreferenced staff accessors/utilities, the ineffective matching fallback and unused ranking wrapper, an unused geocoding helper, and unused variables/imports. The root UUID dependency and outreach's direct Zod declaration were removed; Zod remains installed as an SDK peer. Both lockfiles were updated without changing the versions of remaining packages.

Active API routes, vector similarity diagnostics and their data, older public opportunity pages, and currently consumed Admin storage-summary values were retained. Replacing the inaccurate storage-summary values is still separate work. Database architecture/retention findings above are not fixed by this cleanup.

Verification compared the pre-cleanup and post-cleanup results for 54,756 skill pairs and similarity results, 1,152 ranking scenarios, staff tab rendering (administrator, permission-limited staff, and empty data), filters, and mutation requests. HTML inline scripts compiled and all local script references resolved. Forty-seven temporary-data HTTP checks covered staff collection CRUD, staff membership/permissions, page access, and matching APIs. The full application suite passed both in the working tree and after a fresh dependency install in an isolated copy; outreach syntax checks and `git diff --check` also passed. Browser rendering was exercised through a VM/DOM stub, not a visual browser session. No production data, model calls, or real email delivery were used. No commit or push was made.
