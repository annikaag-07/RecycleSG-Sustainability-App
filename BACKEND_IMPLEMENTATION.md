# RecycleSG backend implementation and frontend handoff

Baseline: GitHub main b25a0b4. UI-1 owns account, finder and admin screens. UI-2 owns progress and community screens. The delivery unit is one user workflow with its migration, API contract, access rules, fixtures and test evidence. Each numbered item below can be reviewed and released separately.

| Order | Requirements | Backend work and frontend handoff | Acceptance case |
|---|---|---|---|
| 1 | 3.8, 12.2 | Submit text point reports, list pending reports and resolve or dismiss them. See the three RPCs below. | Retry returns the same ID. Two reviewers cannot both close the report. |
| 2 | 13.9, 13.11 | Reuse admin_list_milestones_for_review. Add admin_decide_milestone with verify, reject and request_evidence. Store decision, actor and evidence. Record one notification per distinct contributor on verification. | Two admins read the same pending item. Only the first terminal decision succeeds. |
| 3 | 3.5, 12.1 | Admin point create/update/deactivate/remove including accepted materials and weekly opening intervals. Extend finder results with open, closed or unknown in Singapore time. Deactivate points with historical references. | Known overnight hours and unknown hours produce different filter results. Removed points disappear from search. |
| 4 | 1.2, 1.7 | Enforce eight characters with a letter and digit at Auth signup/password change. Keep deleteMyAccount as the client entry point. Use a trusted, retryable workflow for private media cleanup, session invalidation and Auth deletion. Detach contributor identity while preserving milestone totals. | Delete a contributor with photos, retry after a simulated cleanup failure, then verify totals, storage and access. |
| 5 | 2.3, 7.1, 9.4, 9.5, 11.2 | Follow/unfollow, counts, block/unblock, public profile and following leaderboard for weekly/all-time. Proposed default: immediate follows for public accounts, approval for followers-only accounts. Enforce visibility on reads and private photos. | Owner, accepted follower, stranger and blocked account receive the expected profile, board and media results. |
| 6 | 8.1–8.4, 9.1–9.3, 9.5–9.6 | Create/edit/delete photo posts with caption, tags and optional recycling point. Paginate Discover, Following, profile posts and comments. Like/unlike, comment/edit/delete, search by hashtag or point. Reuse the access rules from step 5. | A second account can see and interact only with permitted posts. Retries preserve counts. |
| 7 | 11.3–11.4 | Report posts/comments. Implement existing admin_moderation_queue and admin_moderate_content signatures. Support ranked queue, dismiss/hide/delete, warn/suspend/ban and an audit log. | Hidden material disappears from feeds, search and direct reads. Suspended accounts cannot post. |
| 8 | 2.5, 6.2–6.4, 12.3 | Derive streaks by distinct verified activity days in Singapore. Backfill history. Extend badge catalogue and earned/locked progress for streaks and regions. Add admin configuration for material points, level thresholds, quests, badge rules and seasonal events. | Two drops on one day count once. A missed day resets the streak. New rules preserve historical awards. |
| 9 | 5.2, 10.1–10.3, 13.11 | Add inbox, read state and server-side category preferences. Generate social, level, badge, quest, streak-at-risk and milestone events. Proposed MVP delivery is in-app. A closed-app reminder needs push delivery. | A disabled category stays silent. A retried event produces one inbox entry. |
| 10 | 12.4 | Admin-only, date-filtered statistics for active users, verified actions, busiest points and material quantities. Publish metric definitions alongside results. | Totals match a seeded dataset and a regular user is denied. |

Home location and favourites stay on device (2.2, 3.7). Optional future home sync uses an owner-only address/pin. Keep existing terms acceptance (1.3), omit Singpass (1.1), and retain the agreed routing, seed refresh, report-photo and email demo scope. The existing admin gate uses is_app_admin. The existing badge collection already shows locked badges.

## Point report endpoints

Implemented on this branch. All calls use POST /rest/v1/rpc/<name> with the signed-in user's access token. Hosted verification is pending.

| RPC | JSON request example | Success |
|---|---|---|
| submit_point_report | {"p_recycling_point_id":1,"p_category":"full","p_description":"Lid will not close","p_client_request_id":"22222222-2222-4222-8222-222222222222"} | Numeric report ID. Confirmed account required. Categories are full, missing_or_damaged, wrong_info and contaminated. Description may be null. |
| admin_list_point_reports | {"p_before_id":null,"p_limit":20} | Pending items ordered by descending ID. Each has id, recycling_point_id, category, description and created_at. Use the last ID as the next cursor. |
| admin_review_point_report | {"p_report_id":1,"p_resolution":"Resolved","p_note":"Bin emptied"} | Returns Resolved or Dismissed. The point itself is updated separately. |

For submission, 42501 means verification required, 22023 means invalid input or a reused key with a different payload, and 23503 means unknown point. Admin calls require app_admins membership. A missing/already-closed report returns P0002. UI-1 can reuse submitPointReport. Before enabling offline replay, partition the device outbox by account and quarantine legacy items with unknown owners. Generate the request ID once per report.

## Release and handoff

1. Agree the SQL/HTTP name, arguments, example response and errors with the screen owner. Preserve wrappers in Lab3/frontend/src/shared/api/proposed.ts.
2. Deliver one migration and exercise it with the existing database suite. Cover a valid user, an unauthorized caller, retries and legacy rows relevant to the workflow.
3. Apply to an identified integration Supabase project. Call the endpoint using an actual client session. Check Storage/Auth through their HTTP interfaces when relevant and use two sessions for concurrency tests.
4. Update API_ENDPOINTS.md with the environment, commit, contract and smoke-test result. UI engineers can mock the contract before deployment and switch to the verified endpoint afterwards.
