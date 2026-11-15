# Posting streaks

## Behavior

Both regular posts and opportunities count, including posts published from drafts.
The first successful publication starts at streak 0. A later publication strictly
less than 168 hours after the previous publication increments the streak by one
and restarts the window. At or beyond 168 hours, the streak is 0; the next post
starts another window at 0. Time is elapsed server time, independent of time zones.
The existing one-post-per-UTC-day limit remains in effect.

Each new approved post earns its existing 5 points plus twice its resulting
streak: 5, 7, 9, and so on. Expiration never takes away previously earned bonuses.
Existing score retention and reversal rules also apply to the bonus. Editing,
saving drafts, moderation changes, and deleting content never increment a streak.
Deleting a published post does not undo the publication history or restart its
deadline. A successfully stored held submission counts as a publication, matching
the existing daily quota; it earns no points until approved.

## Rollout

Use each existing user's latest remaining persisted legacy publication as the
starting timestamp at streak 0. Unverifiable pre-feature reservations do not count:
they cannot distinguish a failed write from a successfully published, later deleted
post. Already-versioned publications recover from confirmed or source-backed claims.
Do not retroactively increase streaks or change historical rewards. Users with no
verifiable publication start at streak 0 with no deadline.

## Approaches

Recommended: extend the shared publication pipeline and its durable history,
with a small streak module for calculation, recovery, and user-field updates.
This reuses serialization across projects and post types and covers drafts.
A separate streak-event ledger would duplicate publication history and introduce
another collection to reconcile. Recomputing from surviving posts on every read
would lose history after deletion and would make bonuses change over time.
This implementation extends the existing publication pipeline.

## Storage and recovery

Add only streak metadata to user records: numeric `streak`, nullable
`last_post_at`, and a version marker for idempotent initialization. Store the
publication's resulting streak with its post/claim so LarpScore can award an
immutable bonus without consulting the user's current streak. Preserve all
existing profile, content, password, and scoring fields.

Initialize existing users through application startup code using exclusive
backups before changing existing collections. Reruns must preserve initialized
values and produce no changes when nothing is due. Initialize new accounts in
signup. All writes use the existing atomic update API; never edit larpable_data
directly. Deployment of larpable.me must run the same initialization on production.

Reserve publication metadata before the source write, then advance user streak
only for a persisted publication. Failed writes that did not persist must leave
streak and last_post_at unchanged. Retain enough confirmed publication metadata
to recover an interrupted user-field update at startup or before the next post.
An unconfirmed claim must not advance a streak. Reconciliation must be idempotent
and account-generation-aware, so recreated accounts cannot inherit old streaks.
Do not introduce nested store locks that can deadlock the scoring hooks.

Read-time expiry must return 0 immediately at the deadline; a lightweight periodic
sweep also persists expired values for inactive users. Startup performs expiry
and recovery before serving requests. Persist only changed metadata, preserving
unrelated concurrent profile edits. A storage error must remain observable.

## Interface

Expose the current streak and expiry timestamp with the existing profile API.
Show the streak immediately below LarpScore in the right-hand feed profile box,
including 0, with a small animated flame. Use existing colors and typography,
plain text for accessibility, and respect reduced-motion settings. An open feed
must show 0 once its deadline passes and refresh on return to the tab. Explain
the 168-hour rule and bonus in the existing score explanation.

## Verification

Use only temporary datasets. Test first/second/third posts; just before, exactly
at, and after 168 hours; expired restart; both publication types and drafts;
concurrent submissions; failed writes before and after source persistence;
restart recovery; unchanged edits/deletions; held/approved posts; immutable
bonuses and existing score reversal rules; signup and existing-user rollout;
repeat initialization, backup preservation, and account recreation. Assert that
unrelated user/content fields survive byte-for-byte where no change is required.
Check the rendered feed at 0 and positive streaks, reduced motion, and expiry.
Run the existing regression suite and regenerate content-based asset versions.

## Scope

Keep changes small and within existing modules, extracting only shared streak
logic. No new dependencies, database replacement, daily-limit changes, unrelated
refactoring, or retroactive score changes. Implement and verify locally; local deployment is included. Do not push changes.
