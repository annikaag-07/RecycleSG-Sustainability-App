# RecycleSG backend implementation and frontend handoff

All ten backend batches are implemented on `feature/lab5-backend`, based on GitHub main `b25a0b4`. The SQL endpoints run locally. The shared Supabase deployment is pending.

| Frontend owner | Handoff |
|---|---|
| UI-1, account and finder | [Account deletion and passwords](Lab3/backend/ACCOUNT_API.md), [finder, reports and admin statistics](Lab3/backend/FINDER_API.md) |
| UI-1, admin screens | [Milestone review and gamification rules](Lab3/backend/PROGRESS_API.md), [moderation](Lab3/backend/SOCIAL_API.md) |
| UI-2, community and progress | [Posts, feeds, profiles, followers and leaderboard](Lab3/backend/SOCIAL_API.md), [streaks, badges and notifications](Lab3/backend/PROGRESS_API.md) |

## Implementation checklist

| Order | Requirements | Backend work and frontend handoff | Acceptance case |
|---|---|---|---|
| 1 | 3.8, 12.2 | Submit text point reports, list pending reports and resolve or dismiss them. See the three RPCs below. | Retry returns the same ID. Two reviewers cannot both close the report. |
| 2 | 13.9, 13.11 | Reuse admin_list_milestones_for_review. Add admin_decide_milestone with verify, reject and request_evidence. Store decision, actor and evidence. Record one notification per distinct contributor on verification. | Two admins read the same pending item. Only the first terminal decision succeeds. |
| 3 | 3.5, 12.1 | Admin point create/update/deactivate/remove including accepted materials and weekly opening intervals. Extend finder results with open, closed or unknown in Singapore time. Deactivate points with historical references. | Known overnight hours and unknown hours produce different filter results. Removed points disappear from search. |
| 4 | 1.2, 1.7 | Enforce eight characters with a letter and digit at Auth signup/password change. Keep deleteMyAccount as the client entry point. Use a trusted, retryable workflow for private media cleanup, session invalidation and Auth deletion. Detach contributor identity while preserving milestone totals. | Delete a contributor with photos, retry after a simulated cleanup failure, then verify totals, storage and access. |
| 5 | 2.3, 7.1, 9.4, 9.5, 11.2 | Follow/unfollow, counts, block/unblock, public profile and following leaderboard for weekly/all-time. Public accounts accept immediate follows and followers-only accounts require approval. Enforce visibility on reads and private photos. | Owner, accepted follower, stranger and blocked account receive the expected profile, board and media results. |
| 6 | 8.1–8.4, 9.1–9.3, 9.5–9.6 | Create/edit/delete photo posts with caption, tags and optional recycling point. Paginate Discover, Following, profile posts and comments. Like/unlike, comment/edit/delete, search by hashtag or point. Reuse the access rules from step 5. | A second account can see and interact only with permitted posts. Retries preserve counts. |
| 7 | 11.3–11.4 | Report posts/comments. Implement existing admin_moderation_queue and admin_moderate_content signatures. Support ranked queue, dismiss/hide/delete, warn/suspend/ban and an audit log. | Hidden material disappears from feeds, search and direct reads. Suspended accounts cannot post. |
| 8 | 2.5, 6.2–6.4, 12.3 | Derive streaks by distinct verified activity days in Singapore. Backfill history. Extend badge catalogue and earned/locked progress for streaks and regions. Add admin configuration for material points, level thresholds, quests, badge rules and seasonal events. | Two drops on one day count once. A missed day resets the streak. New rules preserve historical awards. |
| 9 | 5.2, 10.1–10.3, 13.11 | Add inbox, read state and server-side category preferences. Generate social, level, badge, quest, streak-at-risk and milestone events. Delivery is in-app. A closed-app reminder needs push delivery. | A disabled category stays silent. A retried event produces one inbox entry. |
| 10 | 12.4 | Admin-only, date-filtered statistics for active users, verified actions, busiest points and material quantities. Publish metric definitions alongside results. | Totals match a seeded dataset and a regular user is denied. |

Home location and favourites stay on device (2.2, 3.7). Optional future home sync uses an owner-only address/pin. Keep existing terms acceptance (1.3), omit Singpass (1.1), and retain the agreed routing, seed refresh, report-photo and email demo scope. The existing admin gate uses is_app_admin. The existing badge collection already shows locked badges.

## Point report endpoints

Implemented on this branch. All calls use POST /rest/v1/rpc/<name> with the signed-in user's access token. Hosted verification is pending.

| RPC | JSON request example | Success |
|---|---|---|
| submit_point_report | {"p_recycling_point_id":1,"p_category":"full","p_description":"Lid will not close","p_client_request_id":"22222222-2222-4222-8222-222222222222"} | Numeric report ID. Confirmed account required. Categories are full, missing_or_damaged, wrong_info and contaminated. Description may be null. |
| admin_list_point_reports | {"p_before_id":null,"p_limit":20} | Pending items ordered by descending ID. Each has id, recycling_point_id, category, description and created_at. Use the last ID as the next cursor. |
| admin_review_point_report | {"p_report_id":1,"p_resolution":"Resolved","p_note":"Bin emptied"} | Returns Resolved or Dismissed. The point itself is updated separately. |

For submission, 42501 means verification required, 22023 means invalid input or a reused key with a different payload, and 23503 means unknown point. Admin calls require app_admins membership. A missing/already-closed report returns P0002. UI-1 can reuse submitPointReport. The device wrapper uses submit_owned_point_report and partitions queued reports by account. Legacy entries with unknown owners stay quarantined. Generate the request ID once per report.

## Local verification results

| Surface | Result |
|---|---|
| Database and deletion workflow | 27 backend tests passed. All 39 migrations applied. An upgrade from the previous schema preserved balances and backfilled a seven-day streak badge. Deletion tests covered storage failure, retry, owner isolation and contribution retention. |
| PostgreSQL 18.6 and PostgREST 16.5 | Eight concurrent report submissions returned one ID. Two report reviews and two competing milestone decisions each produced one winner. Verification produced one contributor notification. Social feeds, blocks, likes, admin statistics and rules passed HTTP checks. |
| Frontend | 14 tests and TypeScript passed. The matching Expo ESLint preset found five existing issues in the edited screens and zero new findings compared to main. |
| Edge Function | Deno typechecking passed. The HTTP entry point passed preflight, missing-session and successful cleanup checks using the pinned SDK with simulated Auth and Storage services. |

The hosted Auth password policy, real private media removal, hosted ban enforcement and scheduled reminder execution still need an integration deployment.

## Reproduce verification

- From `Lab3/backend/tests`, run `npm ci && npm test`. This applies the migrations in order and exercises roles, retries, legacy calls, progress, moderation and account cleanup.
- With PostgREST installed and on PATH, run `npm ci && npm test` from `Lab3/backend/tests/native` after installing the parent tests. Set `POSTGREST_BIN` for a standalone binary. On macOS, set `POSTGREST_LIB_DIR` if the binary requires a separate libpq directory. The suite starts an ephemeral PostgreSQL database and PostgREST on loopback, signs synthetic test tokens, and checks the RPCs over HTTP with concurrent clients. Ports default to 55469 and 55470 and can be overridden with `TEST_DB_PORT` and `TEST_HTTP_PORT`. The Auth and Storage schemas are fixtures.
- From `Lab3/frontend`, run `npm ci`, `npm run typecheck` and `npm test`. Tests exercise existing client calls and account isolation during offline replay.
- Typecheck the Deno Edge Function with `deno check Lab3/backend/supabase/functions/delete-my-account/index.ts` from the repository root.

## Release to the team

1. Publish the feature branch and review the migrations together. Apply them in timestamp order on the integration project. Deploy the `delete-my-account` Edge Function and set the Auth password policy to eight characters with letters and digits.
2. Use separate disposable member and admin accounts to exercise the actual Auth, private Storage, deletion function and moderation ban. Confirm the cron job or external scheduler runs at 20:00 Singapore. The SQL reminder itself is covered locally. An optional [demo seed](Lab3/backend/supabase/demo/cash_for_trash.sql) supplies a published collection schedule for the open-now filter.
3. Give the team the integration base URL, publishable key, tested commit, and role-specific test accounts through the team's normal credential channel. UI-1 can wire administration and finder screens. UI-2 can wire posts, relationships, rewards and the inbox. Use [API_ENDPOINTS.md](API_ENDPOINTS.md) as the contract index.
