# Hosted demo setup

Deployment record from 2026-10-25/26; documentation consolidated 2026-10-28.
This records the tested environment, not a fresh health check or a guarantee that local credentials still exist.
For presentation steps use [START_HERE.md](START_HERE.md); for evidence and test commands use [TESTING.md](TESTING.md).

## Project and configuration

- Project: `zwyibrksagddbrqiqaqf` / nickolaschua's Project, Singapore.
- API: https://zwyibrksagddbrqiqaqf.supabase.co
- Repository: `softwarelab3/2006-SCS1-X2`; integration branch: `nick/recyclesg-integration`.
- The frontend needs `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and `EXPO_PUBLIC_VERIFICATION_URL` in `Lab3/frontend/.env`.
- FastAPI needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, and `FRONTEND_ORIGINS` in `Lab3/CV/.env`; see the respective `.env.example` files. Both services were configured for the recorded live runs. Never commit these files or put server secrets in `EXPO_PUBLIC_*` variables.
- Tested laptop URLs: Expo `http://127.0.0.1:8081`, CV `http://127.0.0.1:8000`. CORS allows localhost/127.0.0.1 on port 8081. Physical phones require reachable addresses and separate network/device validation.
- Start services using the [frontend README](../../Lab3/frontend/README.md) and [CV README](../../Lab3/CV/README.md). The demo launcher can start them automatically once dependencies and configuration exist.

## Database state and preservation

The restored project was ACTIVE_HEALTHY at the recorded deployment. With the old application confirmed disposable, its 20 travel/insurance tables and data were preserved, RLS enabled, and table privileges revoked from PUBLIC, anon and authenticated. Old client access was intentionally disabled; no legacy data was deleted. Six pre-existing Auth users predate the profile signup trigger and are not prepared demo accounts.

All 33 repository migrations were applied, plus the project-specific legacy isolation operation below. The seed added 12,300 locations, 49,200 material links, nine material types and three Active milestones. **Location seed inserts are not idempotent:** the seed was run once after confirming zero locations. Do not rerun it blindly or reset the shared project.

The private `recycling-photos` bucket accepts JPEG/PNG/WebP up to 5 MB. Browser roles cannot execute the finalizer or signup trigger directly; the verifier has explicit server read grants. Private progress rows are not anonymously readable. All public tables had RLS enabled at the recorded check.

New demo accounts are created through Supabase Auth's supported admin API, with confirmed email and signup-trigger profiles. Do not insert directly into `auth.users` or treat old accounts as ready to use. `present.mjs` creates a fresh account when the saved one has checked in. Rehearsal accounts, partial attempts and contributions are retained; the separate blank-image smoke test removes only its own temporary account/photo. Never reset rewards by toggling verification status.

## Security review record

The 2026-10-26 advisor check had no ERROR-level findings. This is not production sign-off:

- Public catalogue, leaderboard, feed and milestone RPCs are intentional; private operations still require ownership/admin checks. [Function exposure advisory](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).
- No-policy RLS notices include intentionally closed legacy tables and the admin-only table. Do not add permissive policies just to silence them.
- The legacy vector extension remains in public. [Extension advisory](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public).
- Leaked-password protection and additional MFA were not enabled.

## Hosted migration mapping

MCP assigned server timestamps, so hosted versions differ from repository versions. Preserve this mapping and reconcile migration history using supported CLI repair tooling before switching deployment mechanisms. **Do not blindly run `db push`, `db reset`, or replay migrations.** Do not rename shared migrations. The legacy isolation operation is specific to this project and is not part of a fresh RecycleSG schema.

| Hosted version | Applied migration name |
|---|---|
| 20261024183539 | isolate_disposable_legacy_tables |
| 20261024183547 | 20261013170156_initial_schema |
| 20261024183549 | 20261013193505_security_policies |
| 20261024183551 | 20261013194300_create_user_profile_trigger |
| 20261024183553 | 20261014020958_seed_material_types |
| 20261024183555 | 20261014034137_link_recycling_point_materials |
| 20261024183557 | 20261014041244_search_recycling_points_by_material |
| 20261024183600 | 20261014041957_search_nearby_recycling_points |
| 20261024183602 | 20261014042340_secure_gps_checkin |
| 20261024183641 | 20261014071228_checkin_cooldowns_and_limits |
| 20261024183644 | 20261014073858_submit_recycling_activity |
| 20261024183648 | 20261014090646_gamification_rewards |
| 20261024183650 | 20261021173104_explicit_data_api_permissions |
| 20261024183653 | 20261023124232_recycling_photo_storage |
| 20261024183656 | 20261023132728_milestone_system |
| 20261024183658 | 20261023141559_restrict_milestone_read_permissions |
| 20261024183700 | 20261023142353_fix_milestone_listing_permissions |
| 20261024183703 | 20261024063517_leaderboard_api |
| 20261024183705 | 20261024065329_quests_system |
| 20261024183707 | 20261024070650_quest_progress_tracking |
| 20261024183709 | 20261024073926_quest_reward_claims |
| 20261024183711 | 20261024075104_seed_default_quests |
| 20261024183713 | 20261024075459_badges_achievements |
| 20261024183716 | 20261024080101_community_feed |
| 20261024183721 | 20261024112618_link_recycling_photos |
| 20261024183723 | 20261024112839_singapore_quest_timezone |
| 20261024183725 | 20261024113130_fix_leaderboard_rankings |
| 20261024183727 | 20261024113318_weekly_leaderboard |
| 20261024183729 | 20261024113408_seed_demo_milestones |
| 20261024183731 | 20261024113544_quest_reward_history |
| 20261024183733 | 20261024113634_anonymous_community_feed |
| 20261024183735 | 20261025010000_finalize_recycling |
| 20261024183932 | 20261024183917_tighten_private_api_grants |
| 20261026071804 | 20261024193507_fix_community_feed_display_names |
