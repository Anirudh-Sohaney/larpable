> Historical implementation notes. Completed one-time migrations were retired locally on 2026-10-31. See MIGRATION_RETIREMENT.md for current startup and recovery behavior; migration commands below are no longer available in this checkout.

# Project data migration

Project records and project-first posting are implemented locally. No deployment has been performed. The backfill has been applied locally through migration code.

## Data contract

`projects.json` is keyed by stable `prj_*` IDs. Each project has `id`, `schema_version: 1`, `created_by` (original post creator), `source_opportunity_ids`, `migration: projects-v1`, `type`, `content_revision`, and `encrypted_fields`. Decrypted fields are `name`, `elevator_pitch` (2–30 words), `tags` (at least one), and optional `description`.

Existing posts remain in `opportunities.json` with a top-level `project_id` foreign key. The post’s legacy title is removed by the data-detected v3 migration. Positions (`looking_for`), summaries, additional details, comments, applications, and all other content remain intact. Feed/detail views resolve names from parent projects. Post edits do not change project identity.

The manually authored `backend/migrations/project-catalog.js` contains 47 projects covering all 50 snapshot posts. T FOR T has two associated posts; Weston McCullough’s debut album has three. Other records remain separate unless their text establishes identity. Original skill labels seed project tags (a union for shared projects), with user-requested additions and removals in the revision-2 curation. Thirteen projects without skills use inferred tags, as authorized. Original post skills are preserved. Tag-source metadata is removed from project records.

## Automatic migration and local testing

At server startup, canonical value normalization completes first, then `backend/migrations/projects.js` runs. Requests wait for completion; failures return 503 and are logged. Atomic writes create projects before linking posts. The migration refuses conflicting links/IDs, preserves project edits, detects concurrent post edits, and can be retried after interruption. Run one application writer during migration; cross-process JSON transactions are not supported by the existing store.

Commands from `larpable.me`:

- `node backend/migrations/projects.js`: read-only dry run against the configured DATA_DIR.
- `node tests/projects-migration.test.js`: copies the local snapshot to an OS temporary directory, tests migration and real server startup there, then removes the temporary directory. Verifies the source opportunity file hash is unchanged.
- `DATA_DIR=/absolute/path/to/an/existing/scratch-directory node backend/migrations/projects.js --apply`: optional application against an explicit scratch directory. Populate that directory with a copy of the desired input first. Never omit DATA_DIR when experimenting with --apply.

On eventual deployment, startup applies the migration to the server’s configured DATA_DIR automatically. Do not deploy until the curated values have been reviewed. New production posts whose IDs are absent from the catalog are reported as `unreviewed_post`, never guessed or silently discarded. Deleted posts are not recreated. The report `project-migration-report.json` records source-information limitations. Research and match decisions are in PROJECT_RESEARCH.md. A wrong encryption key or invalid required fields fails before writes.

## Review gaps

All snapshot posts can receive valid, conservatively described projects, but these need more information for a fuller profile:

- Global Solutions Network: mission and actual activities.
- KiptonAI: SaaS product functionality.
- Wisdom Media: media output and mission.
- PULSE Karachi chapter: broader mission; no evidence of a connection to the pharmaceutical app named PULSE.
- CorpPulse: platform purpose and features.
- FutureCraft: actual site functionality beyond its name and testing request.
- Anime Art: official anime name and whether it relates to The Aegis Initiative (not merged).
- Weston McCullough’s debut album: official title; the catalog uses a descriptive working name.
- Verdure: the body names Verdure and finance recruiting; the event finder function comes from the post title.

No optional description is fabricated to fill these gaps. The sparse elevator pitches intentionally reflect only what is stated.

## Preservation and rollback

Before the first mutation, code exclusively creates `opportunities.json.before-projects-v1.bak` and, if it already exists, `projects.json.before-projects-v1.bak`. Retries never replace those snapshots. Legacy post content remains intact; projects and links are additive. Encryption follows the existing AES-GCM object format.

For rollback, stop all application writers and deploy the previous code version so startup will not reapply this migration. Restore the opportunity backup; restore the projects backup if present, otherwise archive the newly created projects file. Archive the migration report. Do not restore an old full opportunity backup after newer live activity without reconciling those subsequent edits; in that case remove only migration-added project links through a reviewed repair script instead. Keep backups until the architecture is accepted.


## Content revision 2

`projects-content-v2.js` runs from the backfill entrypoint (including startup). It adds original-post types and applies the revised catalog pitches/descriptions and explicit skill-label adjustments to existing v1 records. The original `projects.json` is backed up exclusively to `projects.json.before-projects-content-v2.bak`. Each curated project is marked `content_revision: 2`, so subsequent user edits are preserved on reruns. Top-level tag-source properties are removed. Existing project IDs, names, ownership and source-post associations are preserved. Empty or conflicting source types fail before mutation. Backups intentionally retain the previous state for recovery.

Verification: `node tests/projects-content-v2.test.js` and `node tests/projects-migration.test.js` use temporary datasets. The first checks exact requested content, real taxonomy tags, metadata removal, original types/conflicts, backup, retries, and stable reruns. The second checks complete backfill and real startup integration.

`node backend/scripts/review-projects.js` prints decrypted records without changing the dataset. Add `--export` to regenerate the separate `../projects-decrypted-review.json` review copy, including project types. This file is outside the application repository and is not an application data source.

For content-revision rollback, stop writers, disable the revision in code, then restore `projects.json.before-projects-content-v2.bak` only if no newer project edits need reconciling. Original posts and user records are not mutated by the content revision.


## Project-first posts (v3)

All earlier migrations remain and run in order: canonical normalization, curated project backfill, content revision 2, then `post-projects-v3.js`. The v3 migration checks actual data for missing links, missing project creators, legacy stored titles, or stale inherited types. Once corrected, it returns zero changes and does not write backups or data again. Deploying the same code to an old dataset detects and fixes that dataset independently; no local-only flag controls it.

Before mutation, original opportunity and project files receive exclusive `*.before-post-projects-v3.bak` backups. Projects are persisted before post links/titles change; retries after interruption safely complete remaining work. Creator conflicts and invalid projects stop migration before post-title removal. When an uncatalogued legacy post exists, its existing title/owner/type identify a stable parent project; no staffing description is imported into its project pitch. The minimal project remains listed as unreviewed. This covers new old-format production records without deleting their content. Grouping uses exact name, creator and type; ambiguous matches fail.

`backend/projects.js` resolves project ownership and presentation; `backend/posts.js` is shared by direct posting and draft publishing. Project creation accepts type (project/nonprofit/company), name, 2–30 word pitch, optional description, and 1–15 canonical skill tags. `GET /api/projects/mine` returns only the authenticated creator’s projects; `POST /api/projects` creates a project owned by that user. Neither endpoint accepts client-supplied ownership. Projects keep their original author; each post references its parent through top-level `project_id` and inherits its type. Posts cannot be created or published under someone else’s project. Post edits retain their existing parent and ignore attempts to reintroduce title/type/ownership fields.

`/create_student` first asks for an owned project, or offers inline project creation with its classification. The post form then collects role, skills, collaboration preference, summary, additional details, location, and contacts. New drafts also store project_id. Legacy drafts retain their content and require selecting a project; an exact existing owned-project name match preselects it. The frontend no longer asks for a post title or project classification when composing a post. The redundant Details heading and empty Field/Industry fact are removed; location/posted facts and Additional details remain.

Public feed and detail APIs expose project identity separately (`project_name` on feed rows, `project_id` and `project` on detail). Staff views, feedback prompts, outreach context and re-engagement emails resolve parent-project names too. Project records remain encrypted at rest. No real server was contacted.

Validation: `npm test` includes the self-contained content revision and post/project integration checks. `npm run test:projects` additionally verifies the current local 50-post snapshot and real server startup against a temporary copy. A disposable browser fixture (`node tests/manual-project-ui.cjs`) was used to verify project creation, auto-saved drafts, posting, feed/detail display, and editing. Its synthetic user/data were removed after testing. Screenshot: `../project-post-preview.png`.

Rollback of v3 requires stopping writers and reverting the application code together with the relevant backups; the old frontend/API expects titles. Preserve/reconcile newer posts and edits before restoring any old full file.


## Yours: projects, posts, and drafts

Yours (`/feed?mine=1`) replaces feed search and filters with Projects and Posts tabs. Projects shows owned projects, their pitches/tags, associated post/draft counts, and Create post / Edit project / Delete project actions. Posts (`/feed?mine=1&view=posts`) shows all the user’s published and held-for-review posts, plus a separate drafts section with editing and deletion. Public feed filtering and saved posts remain separate from Yours.

Project editing reuses `/create_student?edit_project=<id>` and its searchable tag chips. `PATCH /api/projects/:id` validates and encrypts name, pitch, description and tags, and permits classification edits while preserving creator/migration metadata. Read paths resolve the current parent name/type, including for existing posts and drafts. Later startup migrations continue to preserve edited project fields.

`DELETE /api/projects/:id` is creator-only and rejects projects with linked posts or drafts (409). The UI explains this and enables deletion when the project is empty. Child creation and project mutations are serialized per project within the running app to prevent deletion racing a new post/draft. Empty projects can be deleted without resurrecting their old migration records, because their source posts have already been removed. Cross-process transactions remain outside the JSON store’s design; run one application writer.

Draft deletion uses the existing authenticated DELETE endpoint. Draft updates recheck existence inside the write queue so a concurrent deletion is not undone by an already-started update. The project management integration test covers creator authorization, field validation, encryption, current parent display names/types, post/draft deletion prerequisites, draft removal, concurrent post creation/project deletion, and migration behavior after deletion. The feed unit test verifies that Yours bypasses filters and retains unread-notification ordering under Posts.

## Regular project posts (v4)

The composer defaults to a regular post after project selection. Its Opportunity switch changes the visible inputs immediately and retains typed values. Published posts keep their kind and project. Regular posts require a 1–10 word title (at most 130 characters) and 1–300 characters of content. A single optional image or video can be attached. Drafts retain their kind and media reference; legacy drafts are classified as opportunities. Drafts of each kind remain separate when switching the composer.

Storage in `DATA_DIR`:

| Collection | Contents |
| --- | --- |
| `opportunities.json` | Existing recruitment posts, unchanged by v4 |
| `posts.json` | Regular posts: ID, kind, schema version, parent project, creator, timestamps, optional media ID; title, content, issuer display text and comments encrypted with the existing key |
| `post-reactions.json` | Post ID → user ID → first-like timestamp; repeated likes/unlikes are idempotent; public responses expose only count and the current user's liked state |
| `media.json` | Media ID, owner/project, MIME type, byte size, kind, verified video duration and creation time |
| `media/<random ID>` | Binary media outside the web root; served through the media access route |
| `drafts.json` | Existing private draft collection with `kind` and optional `media_id`; regular draft fields are title/content |

Images support PNG, JPEG, GIF and WebP. Videos support MP4, MOV and WebM, with duration independently parsed by Mediabunny on the server; 60-second files pass and longer videos fail. Maximum upload size is 64 MiB. Media bytes are not encrypted; project/post text and comments use the existing encryption. Unpublished assets are visible only to their owner; published assets have range support for playback. Media belongs to the uploader and selected project. Removing/replacing media, deleting posts/drafts (including evicted drafts), deleting an empty project, and deleting an account release unused assets. Startup removes unused uploads older than 24 hours. At most five unattached uploads per user are accepted. Files referenced by posts/drafts are retained. Run one application writer, as required by the JSON store's per-process queues.

`/api/posts` handles regular post CRUD, likes and the shared comment/reply router. `/post?id=…` uses the same detail template and comment controls as opportunities, both standalone and in the feed split pane. `/api/feed` and `/api/feed/mine` combine both kinds; the anonymous response contains six newest posts total. Existing opportunity endpoints remain available. Regular feed rows derive tags and project classification from the current parent project, rather than storing duplicate tags. For You retains the 70/20/10 skill/interest/field blend and 86/14 match/distance blend. Regular posts use parent tags for field/interest overlap and omit collaboration-preference weighting. Likes do not alter rank.

`regular-posts-v4.js` runs after all retained migrations. It detects missing collections/media directory and drafts without a kind, creates only missing structures and backs up drafts exclusively to `drafts.json.before-regular-posts-v4.bak` before classifying them. Dry runs do not write. Corrected datasets produce zero work and remain byte-stable; an old server dataset independently triggers the migration after deployment. No remote deployment is performed here.

Validation: `npm test` includes `tests/regular-posts.integration.js`, covering migration preservation/reruns, field boundaries, ownership, encrypted text, idempotent likes, shared comments/replies, drafts, actual 60/61-second MP4 fixtures, media access/ranges/cleanup, mixed feed caps and tag-based ranking. The fixtures can be read without FFmpeg at runtime. The browser fixture uses only disposable data on port 9197.

Rollback: stop writers and preserve the new posts, reactions, media and drafts before reverting application code. Restore the exclusive draft backup only after reconciling newer drafts. Earlier application versions cannot render regular posts, so keep new collections/media archived for forward recovery; never overwrite them with empty files. Existing opportunity/project data does not need a v4 rollback.

Feed video playback is coordinated by `web_app/js/feed-videos.js`. Videos default to sound on and start inline when fully visible, accounting for scroll containers and the floating navigation. The most recent video to enter full view wins in either scroll direction; batched entries use the leading edge of the scroll. All other videos pause, including media in the same-origin split detail pane. Leaving full view, hiding the tab, or leaving the page stops playback. Manual pause persists while the same video retains focus. Playback promise races and native play events are guarded against restarting a displaced video. Fullscreen playback retains exclusive ownership. Browsers may require interaction before allowing autoplay with sound; a blocked focused video retries on a real click or keypress, without silently muting it or undoing manual pause. `tests/feed-videos.test.js` covers selection, direction, manual pause, visibility and delayed-play races; the disposable browser fixture supports `--autoplay` for multiple-video scrolling checks.

## Public user profiles

`/profile?id=<user ID>` is public; `/profile` resolves the signed-in user's own ID. The former profile editor is retained at `/edit_profile`, linked beside the owner's handle. The public view shows the name, skill/interest counts with named native-dialog popups, optional Experiences (omitted when empty), and a project list. Selecting a project replaces that section with its scrollable mixed post feed and an All projects return action.

`GET /api/profiles/:id` projects existing user data onto explicit public fields: ID, display name, username, skills, interests and experience title/type/company/description/skills, plus owned projects. It supports legacy camelCase and current snake_case names. It does not expose email, age, location, authentication fields, saved posts, or arbitrary experience metadata. `GET /api/profiles/:id/projects/:projectId/posts` validates the ownership association and returns all approved project posts, with existing contact/authentication and moderation rules. The public discovery feed still retains its six-post guest limit.

These views need no new collection or data rewrite. Existing migrations remain intact and continue to detect and fix old data at startup, then stop writing once corrected. Profile reads are tested for byte preservation of existing collections.

`web_app/js/panes.js` owns content navigation for feed, profile and editor surfaces. On screens at least 1040px wide, content links open on the right while the main screen remains on the left. Links inside an embedded detail/profile replace that right pane rather than opening nested splits or replacing the main page. The navigation bar retains normal main-screen navigation. Narrow screens use full-page navigation; modified clicks/new-tab links keep native browser behavior. Feed cards use separate author/title links rather than nested anchors, and author names in posts, comments, replies and applicants link to public profiles with hover/focus underlines only.

Validation includes `tests/profiles.integration.js` (anonymous access, public-field privacy, association, complete project feeds, moderation/contact restrictions and read-only behavior) and `tests/panes.test.js` (main-page preservation, nested navigation, navigation/modifier exceptions and narrow screens). The disposable `node tests/manual-project-ui.cjs --profiles` fixture adds a second user, comment, reply and application for visual checks. No remote server or production dataset is used by those tests.

## Feed filters

The discovery/saved feed uses four controls: For you / Newest / Oldest; All / Unpaid / Paid; All / Opportunities; All / In person / Remote. Filters combine with AND and retain text search. Pay and location apply to opportunities, since regular posts have neither a collaboration payment nor an actual recruiting location. Volunteer roles are included under Unpaid. Explicit remote flags take precedence over legacy location text; unknown locations are excluded from both specific location filters. Regular posts remain visible under All.

Newest and Oldest use strict chronological ordering. For you preserves existing personalized scores and unread-reply priority. Clear filters resets all controls, search and the active sort together. Yours continues to ignore discovery filters; project profile feeds keep their own complete chronological lists. Guest access rules and the six-post preview cap remain unchanged. `tests/feed-filters.test.js` exercises all 54 combinations, legacy values, reset/events and source preservation; the disposable browser fixture supports `--filters` for mixed pay/location examples. No stored data or migrations change for these controls.
