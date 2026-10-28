# Hosted demo setup — 2026-10-25

Latest teammate sync (2026-10-26): backend `5a146f5` and UI-2 `77d37d6`
merged into HEAD `243d085`, local integration preserved. Now 33 repository
migrations; hosted version `20261026071804` applies
`20261024193507_fix_community_feed_display_names`. All 14 database checks,
11 frontend tests/typecheck, 8 public API checks and full real-service browser
journey pass after merging. See [TEAMMATE_SYNC.md](TEAMMATE_SYNC.md).

## Superseding full live browser result — 2026-10-26

Full real-service browser journey now PASSES: login, find, check-in with simulated
GPS, real photo upload, real Gemini recognition, Verified reward, first quest,
badge, impact, 10-point milestone contribution, feed and ranks. One action,
Plastic confidence 1.0; final lifetime/available/XP = 20/10/20. Automated happy
path took 20.858 seconds. A fresh zero-point presentation account and interactive
launcher are prepared; see [START_HERE.md](START_HERE.md). Photo and CC0 source
are in `docs/demo/assets/`. Earlier missing-photo/account/live-reward blockers
below are historical. Do not request keys or a photo again.

`live-demo.mjs` retains labelled rehearsal accounts/results (including partial
selector-debugging attempts), unlike the blank-image smoke test's cleanup.
The successful contribution remains as demo milestone progress; no manual point
reset was performed. `present.mjs` opens a separate signed-in Chrome window and
uses fresh accounts after a previous check-in. Credentials stay in ignored local
artifacts, never in docs or browser environment variables. Human classroom
rehearsal remains outstanding; stock photo + simulated GPS is not proof of disposal.

## Latest live testing — 2026-10-26

Both server secrets are now present in the ignored CV/.env; values were not
printed. `Lab3/CV/live_smoke.py` passed against real Supabase and real Gemini:
admin-created confirmed temporary account (no confirmation email), password
login, signup-trigger profile, GPS check-in using explicitly simulated bin
coordinates, authenticated private PNG upload, service-role download, Pending
submission, and the real FastAPI `/verify` route via its in-process TestClient.
The synthetic blank PNG returned Gemini `unsure` in 2,112 ms, leaving Pending
with zero points. This is not a bottle-recognition or successful reward test.
The test removed its own uploaded photo, signed out and deleted its temporary
Auth account and cascading application rows. No pre-existing data was deleted.

Reproduce from Lab3/CV (explicitly writes temporary data and calls Gemini):

```sh
uv run --no-project --with-requirements requirements-test.txt python live_smoke.py
```

Also rerun successfully: 8 public live HTTP tests, 13 offline database checks,
23 CV unit/HTTP tests, 11 frontend tests and frontend TypeScript checking.
Web export and all 11 simulated browser scenarios (12 checks including parent)
also pass; automated happy journey 11.6 seconds, total suite about 72 seconds.
Browser suite uses fake external services, not the hosted project or real Gemini.
No frontend lint configuration exists; lint remains unverified.
Remaining live gate: prepared bottle photo → real matching classification →
Verified → reward/quest/contribution arithmetic, in the actual browser and
classroom location setup. Real-device CORS/networking and human rehearsal are
not established by the in-process FastAPI smoke test. Secrets/account blockers
in the historical setup notes below are superseded by this result; a persistent
presentation account and chosen demo image still need preparation.

Project: `zwyibrksagddbrqiqaqf` / nickolaschua's Project (Singapore).
API: https://zwyibrksagddbrqiqaqf.supabase.co
Repository: softwarelab3/2006-SCS1-X2, branch nick/recyclesg-integration.

## Completed and verified

- User confirmed the old application is disposable. Restored project is ACTIVE_HEALTHY.
- Preserved all 20 old travel/insurance tables and their data, but enabled RLS and revoked ALL table privileges from PUBLIC, anon and authenticated. Old client access is intentionally disabled. No data was deleted; six old Auth users remain. They are not prepared demo accounts and predate the profile signup trigger.
- Applied all 32 repository migrations, plus one project-specific legacy isolation operation. New permission migration removes anonymous access to private badge/quest rows, removes browser execution of the signup trigger function, and explicitly grants verifier service reads.
- Seeded 12,300 locations, 49,200 material links, nine materials and three Active milestones. Seed ran once after confirming zero locations; **do not rerun seed.sql blindly** (location inserts are not idempotent).
- Private recycling-photos bucket: JPEG/PNG/WebP only, 5 MB maximum. Browser finalizer execution denied; service-role execution and required reads allowed. All public tables have RLS enabled.
- Frontend .env points to this project with its enabled anon key. CV .env has this project URL and blank secrets. Both files verified Git-ignored. No secret belongs in this document or frontend variables.
- Eight live public HTTP smoke tests PASS. Twelve offline database subtests plus parent = 13 PASS, applying all 32 migrations chronologically.

## Reproduce tests

From Lab3/backend/tests:

```sh
npm test
node --env-file=../../frontend/.env --test live-public.test.mjs
```

The second command accesses the hosted API, reads public data/settings, and tests denied access. It does not create users, upload files or award points. It requires a Node version supporting --env-file and the configured frontend .env. Counted partial PostgREST responses correctly return HTTP 206; the initial smoke-test assertions were corrected to accept that successful response.

## Remaining steps — do these in order

1. Fill SUPABASE_SERVICE_ROLE_KEY and GEMINI_API_KEY in Lab3/CV/.env locally. Never paste them into chat or EXPO_PUBLIC_* values. MCP exposes the public key, not these secrets; no privileged-key workaround was created.
2. Prepare a new confirmed demo account using supported Supabase Auth UI/API. Do not insert into auth.users directly or reuse the six old accounts as if they already had profiles. Verify signup creates a profile and login succeeds. Use a new account for clean five-minute arithmetic.
3. Start FastAPI using Lab3/CV/README.md and Expo on port 8081. Current verification URL is http://127.0.0.1:8000 (laptop only); explicit CORS allows localhost/127.0.0.1:8081. Phone use requires a reachable URL and separate validation.
4. Test authenticated upload to the owned private folder, check-in, Pending submission, real verification and once-only points. Eight public smoke tests do NOT prove these flows.
5. Verify the prepared bottle image with real Gemini, choose classroom GPS or explicitly disclosed simulation, and run two timed human rehearsals using DEMO_ACCEPTANCE.md.

## Security advisor disposition

No ERROR-level security findings remain. Remaining warnings are not a production sign-off:

- Public catalogue/leaderboard/feed/milestone RPCs are intentionally exposed; private authenticated reads/writes remain ownership/admin checked. [Function exposure advisory](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).
- No-policy RLS notices include intentionally closed legacy tables and the admin-only table. Do not add permissive policies just to silence them.
- Old vector extension remains in public; moving unrelated extension objects is not needed for the demo. [Extension advisory](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public).
- Leaked-password protection and additional MFA are not enabled. These remain outside the five-minute prototype scope; do not call this production-hardened.

## Migration mapping — important for the next agent

MCP assigns server timestamps. Each remote migration name includes its original repository version, except the project-specific isolation operation. Therefore local CLI history and hosted versions differ. **Do not blindly run db push, db reset, or replay existing migrations.** Inspect this mapping and reconcile history using supported CLI repair tooling before switching deployment mechanisms. Do not rename the shared original migrations. The legacy operation is project-specific, not part of a fresh RecycleSG schema.

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
