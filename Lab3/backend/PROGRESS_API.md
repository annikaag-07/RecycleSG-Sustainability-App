# Milestones, progress and notifications

Call these functions with `supabase.rpc(name, args)` using the signed-in user's session. Empty argument objects can be omitted. The milestone and gamification administration calls check membership in `app_admins` on every request. The mobile app reads its personal inbox when open. Dates and streak days use Singapore time.

## Review a milestone

Continue using `api.proposed.listMilestonesForReview()` for the queue and `api.proposed.decideMilestone(id, decision, reason)` to save a decision. The second wrapper calls:

```ts
await supabase.rpc('admin_decide_milestone', {
  p_milestone_id: 1,
  p_decision: 'verify',
  p_reason: null,
  p_expected_status: 'AwaitingVerification'
})
```

`verify` returns `Verified` and creates an inbox event per distinct contributor with progress notifications enabled. `reject` requires a reason and returns `Rejected`. `request_evidence` requires a note and returns `AwaitingVerification`. The backend stores the reviewer, time, reason and the evidence reference at decision time. Refresh the list on success or a `40001` stale decision. A missing milestone returns `P0002`, invalid input returns `22023`, and a non-admin receives `42501`.

## Display progress

| RPC | Arguments | Result |
|---|---|---|
| get_my_streak | {} | Integer number of consecutive days, including yesterday's streak until today ends |
| list_my_badge_progress | {} | Array of {id, name, description, criterion, target, progress, earned_at} |

Count each Singapore calendar date with a verified action once, using its submission time. Badge criteria are `verified_actions`, `streak` (longest achieved), or `regions` (distinct named regions of points visited). Points with an unknown region contribute to action and streak counts. An earned badge has a timestamp. A locked badge has null `earned_at`. A progress bar can render `Math.min(progress, target) / target`. For example, a regional badge could return `{"criterion":"regions","target":2,"progress":1,"earned_at":null}` alongside its display fields. Existing histories count immediately and earned badges survive rule changes.

## Display rewards under the current rules

The ordinary signed-in member can call `get_my_level_progress({})` for one row with `level, xp, xp_step, next_level_xp, remaining_xp`. Use the returned remaining XP in the profile and reward screens. A user keeps an attained level when an administrator raises the threshold.

For the log form call `estimate_recycling_reward({p_material_type_id, p_quantity})`. For a pending action also pass its original `created_at` as `p_submitted_at`. The response is one row with `eco_points` and `xp`. Estimates use current rates and the applicable seasonal window. A verified action's actual payout comes from its `reward_transactions` row. Replace the fixed 10-points and 100-XP assumptions in LogRecyclingUI, RewardUI and ProfileUI when wiring these reads.

## Configure gamification

Read `admin_get_game_rules({})` for an object containing `xp_step`, `materials`, `quests`, `badges` and `seasons`. Save with the following RPCs. A null `p_id` creates a row. An existing ID updates it.

| RPC | Example JSON arguments | Response |
|---|---|---|
| admin_set_material_reward | {"p_material_id":1,"p_points_per_unit":12,"p_xp_per_unit":6} | void |
| admin_set_level_step | {"p_xp_step":100} | void |
| admin_save_quest | {"p_id":null,"p_title":"Two drops","p_description":"Verify two actions","p_quest_type":"daily","p_target_actions":2,"p_reward_eco_points":10,"p_reward_xp":10,"p_is_active":true} | numeric quest ID |
| admin_save_badge | {"p_id":null,"p_name":"Regional explorer","p_description":"Visit three regions","p_criterion":"regions","p_target":3} | numeric badge ID |
| admin_save_season | {"p_id":null,"p_name":"Green Week","p_starts_at":"2026-11-21T00:00:00+08:00","p_ends_at":"2026-11-28T00:00:00+08:00","p_multiplier":2} | numeric event ID |

Default rewards are 10 points and 10 XP per unit. Each can be set from 1 to 1000. Events multiply both rewards using the action's submission time. The start is inclusive, the end exclusive, and overlapping seasons use the largest multiplier (1–10). Set an event's multiplier to 1 to remove its bonus. Level thresholds are equally spaced by `xp_step` (default 100). New XP transactions use current settings and retain at least the user's attained level. Existing reward transactions keep their recorded values.

Quest types are `daily`, `weekly` and `one_time`. Deactivate a quest with `p_is_active:false`. A configured positive badge threshold applies to existing verified history. An eligible user receives the award on save. Admin editors should handle `42501` for authorization, `P0002` for a missing editable record, `23505` for duplicate names, `23503` for an unknown material, and `22023`, `23502` or `23514` for invalid fields.

## Read the inbox and save preferences

| RPC | Example JSON arguments | Response |
|---|---|---|
| list_my_notifications | {"p_before_id":null,"p_limit":20} | Newest first. Rows contain id, category, kind, payload, created_at and read_at |
| mark_notification_read | {"p_id":42} | void. Repeat calls preserve the original timestamp |
| get_my_notification_preferences | {} | One row with social, progress and streak_reminder |
| set_notification_preferences | {"p_social":true,"p_progress":true,"p_streak_reminder":false} | void. Send all three switches |

Use the last ID as `p_before_id` for another page. The maximum page size is 100. Map the frontend's `streakReminder` preference to `streak_reminder`. Read the server preference when signing in. Changes affect future events. Each generated notification belongs to its recipient. A missing or another user's notification returns `P0002` when marked read.

| kind | category | payload |
|---|---|---|
| like | social | {actor_id, post_id} |
| comment | social | {actor_id, post_id, comment_id} |
| follow | social | {actor_id} |
| level_up | progress | {level} |
| badge_earned | progress | {badge_id} |
| quest_completed | progress | {quest_id, period_start} |
| milestone_verified | progress | {milestone_id} |
| streak_at_risk | streak_reminder | {local_date} |

Social events from blocked actors and references to hidden or deleted content are filtered when listing. For reminders, a user must opt in, have a verified action yesterday, and have none yet today. Where PostgreSQL offers pg_cron, the migration schedules `recyclesg-streak-reminder` at 12:00 UTC (20:00 Singapore, with the default UTC cron timezone). With an external scheduler, call the service-role-only `send_streak_reminders()` at 20:00 Singapore. Re-running in the same evening emits at most one event per user.

## Verification

From `Lab3/backend/tests`, run `npm ci` then `node --test progress.test.mjs database.test.mjs`. The local fixture applies the migrations and exercises caller-specific SQL permissions, terminal decisions, contributor deduplication, preference toggles, blocked actors, historical streaks, configurable payouts, earned and locked badge data, level/quest events, and reminder deduplication.

On the integration project, use a regular user and an admin session to submit these RPCs through the frontend client. Open the same milestone in two admin sessions and confirm only one terminal decision succeeds. Check the scheduled reminder's run history and time zone on that deployment.

## Rehearse the milestone and inbox path

The three default milestones start active and need at least 1,000 points. For a quick demo, use a separate active milestone with a 10-point target and evidence notes that clearly say it is a rehearsal. A SQL editor user can create it on the disposable demo project:

```sql
insert into public.milestones
    (name, description, organisation, target_points, expected_outcome, evidence_notes)
select 'Lab 5 milestone rehearsal', 'Demonstrate the contribution and review flow',
       'RecycleSG demo team', 10, 'Review the synthetic recycling record',
       'Synthetic evidence for the Lab 5 rehearsal.'
where not exists (
    select 1 from public.milestones
    where name = 'Lab 5 milestone rehearsal' and status in ('Active', 'AwaitingVerification')
);
```

Use a confirmed member with at least 10 **available** points and progress notifications enabled. Contribute 10 through the app and use a separate signed-in admin to verify. Refresh the member's inbox and confirm exactly one notification for that milestone ID. The decision is terminal. Run the seed again after rehearsal for a fresh milestone, and earn another 10 spendable points before the presentation. If the demo uses private profiles, use separate accounts for the admin and contributor.
