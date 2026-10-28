# Ordered integration tasks

Read [demo acceptance](DEMO_ACCEPTANCE.md) and [component checklist](COMPONENT_CHECKLIST.md). Integrate only after the relevant component gate passes. Keep changes small, record tests, and update these documents in the same change. Do not rewrite completed parts or add queues/state frameworks/new services.

## I00 — Establish repeatable component tests

- [x] Frontend: 11 offline tests, typecheck/web export; actual browser screenshots/navigation against the simulated backend. Real backend sign-off belongs to I01/I06.
- [x] Backend: `Lab3/backend/tests/database.test.mjs`; 11 subtests pass, 31 migrations. Auth/Storage are stand-ins; no external database writes.
- [x] CV: 23 classifier/HTTP/verifier tests pass, no live API calls.
- [x] Fix demo-path component failures and record issue IDs/regressions. Optional scope exclusions remain explicit in COMPONENT_CHECKLIST.md.

Exit: offline gates pass, live-only blockers explicitly listed. No claim of end-to-end readiness.

Current handoff (2026-10-25): component tests and simulated browser integration
are implemented. The actual verification bridge now exists. I02–I05 are
implemented and exercised against fake external services; do not reimplement
them. I01 and I06 remain live-only gates deferred until the user supplies the
demo environment. Read the current results in COMPONENT_CHECKLIST.md. The
checked implementation items below mean simulated verification is complete.
They do not replace I01/I06 live validation or authorize deployment.

Implemented files: `Lab3/CV/verification.py`, `/verify` in `app.py`, finalization
migration `20261025010000_finalize_recycling.sql`, frontend
`shared/api/verification.ts` and RewardUI completion/retry controls. Profile
badges and route-origin bugs are fixed. The selected workflow is upload → create
Pending → reward screen automatically requests verification → reconcile status,
with explicit retry and no new queue/service.

Credential-free system test: `Lab3/integration/tests/README.md`. It runs actual
browser UI, the actual Python adapter and actual migrations with mocked external
boundaries. It must remain separate from production configuration. Finalizer
is service-role-only and terminal; client-side recognition never grants points.

## I01 — Agree and prepare the actual demo environment

Depends on I00. Paths: frontend `.env.example`, `shared/api/supabase.ts`; backend `README.md`, seed generator/config/migrations; CV `.env.example`.

**Update after user confirmed old app is disposable:** deployment completed;
32 repository migrations, full bin seed, private bucket and eight public HTTP
checks pass. Old data preserved, old client table grants revoked. See
[LIVE_SETUP.md](LIVE_SETUP.md) for exact evidence, hosted migration mapping and
remaining secrets/account/rehearsal steps. The historical preflight below is
superseded by that result; I01 stays open until authenticated flows pass.

2026-10-26 update: server keys configured; real programmatic login/profile,
owned upload/download, simulated-GPS check-in, Pending submission and Gemini
uncertainty verification all pass via `Lab3/CV/live_smoke.py`. Its temporary
account/photo were removed. Do not request keys again. I01/I06 still need the
actual demo image, persistent presentation account, rewarded browser journey
and classroom/human rehearsal. See LIVE_SETUP.md for evidence and limitations.

### Live preflight — 2026-10-25

User selected `zwyibrksagddbrqiqaqf` (`nickolaschua's Project`, Singapore).
Restored from INACTIVE; now ACTIVE_HEALTHY. **Do not reset this project.**
Read-only inspection found 20 pre-existing travel/insurance public tables,
6 Auth users, and 6 rows in the old public.users table. There are no Storage
buckets or recorded Supabase migrations. The table-list estimated zero row
counts were misleading after restoration; explicit COUNT confirmed users exist.
No custom auth.users triggers or collisions with the checked RecycleSG function
names were found. No RecycleSG migrations or seed have been applied remotely.

Security advisor flags 11 pre-existing public tables with RLS disabled:
alembic_version, checkpoint_migrations, checkpoints, checkpoint_blobs,
checkpoint_writes, payments, flights, hotels, visas, itineraries,
voice_transcripts. These are unrelated to SC2006; do not silently delete them
or change their access policies. See [Supabase RLS advisory](https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public).
Clarify whether this old application must keep working before mixing in demo
users or changing its permissions. No existing rows or permissions were changed.

Local ignored frontend `.env` now targets this project using its enabled legacy
anon key (no modern publishable key was returned). Local ignored CV `.env`
targets the same URL; server service-role key and Gemini key remain blank.
Frontend verification URL is loopback port 8000, not a deployed service.
Frontend typecheck passes. This is configuration only, not live flow validation.
Next agent: resolve preservation/security scope, inspect schema again, apply the
31 repository migrations without resetting unrelated objects, record remote
migration-version mapping, seed only once, then execute the live acceptance gate.

- [ ] Identify designated demo Supabase project, browser origin, CV/integration URL and who supplies credentials. Do not reset a shared deployment without authorization.
- [ ] Apply migrations/seed and verify confirmed user/profile, private recycling-photos bucket, Plastic-compatible point and Active milestone.
- [ ] Document tested classroom GPS/simulated-location setup and fresh-account/reset strategy. Any simulation must be disclosed.
- [ ] Exercise login, public search and owned storage upload through actual network APIs.

Exit: live Auth/Storage/REST tested; evidence has no secrets. If configuration is absent, stop live testing and mark BLOCKED while continuing offline work.

## I02 — Define one material and verification contract

Depends on I00; can proceed without live services. Paths: `Lab3/CV/classifier.py`, frontend `shared/api/types.ts`, `shared/materials.ts`, backend material seed/schema.

- [x] Align Paper/Cardboard/Metal and exact DB material names, case-insensitive comparison. No location-data expansion.
- [x] Policy: confident matching material → Verified; confident mismatch → terminal Rejected; unsure/unavailable → Pending with retry. Material matching is not proof of disposal.
- [x] Request: user bearer token plus activity ID. Server derives owner/photo/material/quantity from DB.
- [x] Response: activity ID, status, recognized material/confidence and message. Retryable infrastructure failures do not reject the activity.
- [x] Contract covered by mocked verifier tests and actual browser uncertainty/mismatch/outage scenarios.

Exit: no ambiguous material/status mapping; regression tests cover confident, unsure, unavailable and mismatch.

## I03 — Add the thin verification connection

Depends on I02; live validation needs I01. Prefer extending existing `Lab3/CV/app.py` with a small helper module, not adding another deployed service.

- [x] Authenticate user, confirm ownership/Pending, download stored private photo in `verification.py`.
- [x] Apply I02 policy; client wait bounded at 25 seconds, Supabase requests at 15 seconds and Gemini HTTP timeout at 15 seconds per request. A late server completion is reconciled by retry; there is no queue or global server-job cancellation.
- [x] New finalizer migration atomically writes CV fields/status/timestamp under row lock; existing migrations unchanged.
- [x] Finalizer terminal/idempotent, owner-scoped and service-role-only. No client secrets.
- [x] Configurable explicit CORS origins; authenticated server-side photo retrieval. Tested on loopback origins; deployment configuration remains I01.
- [x] SQL/Python/browser tests cover success, owner denial, duplicate finalization, concurrent submitted calls (single PGlite engine), missing image, uncertainty/outage and feed timestamp.

Exit: a single pending action becomes verified exactly once and downstream SQL triggers execute; no manual dashboard update required.

## I04 — Connect UI submission and reward completion

Depends on I03. Paths: `shared/api/checkins.ts` (or focused verification wrapper), `LogRecyclingUI.tsx`, `RewardUI.tsx`, `shared/api/photos.ts`.

- [x] Upload → submit Pending → reward screen auto-verifies saved activity ID; inference retry does not create a new action.
- [x] Refresh after verification response/error; retry and status refresh controls update without reload.
- [x] Distinct upload/submission/verification errors; fresh photo paths and explicit collision failures. Browser upload-failure/retake and lost-submission tests pass.
- [x] Verification loading bounded; submitting/loading buttons disabled during requests. Hung verification abort contract unit-tested.
- [x] D02–D04 and failure paths exercised in real Chrome against fake external services.

Exit: no forever-Pending success path, correct photo, exactly one reward, honest failure message.

## I05 — Verify downstream screens one by one

Depends on I04. Existing DB functions/screens should be reused.

- [x] SQL confirms per-drop progress, first claim once and badge award; browser claims first quest and displays earned badge count.
- [x] Profile refreshes and shows one earned badge in browser.
- [x] Impact shows verified estimate/disclaimer and refreshed post-contribution balance; screenshot inspected.
- [x] Contribution arithmetic and response-loss retry pass in browser and SQL.
- [x] Feed/ranks load in browser; SQL verifies weekly recycling versus lifetime totals and feed timestamp.
- [x] Admin approval and social posts remain excluded; no unnecessary implementation added.

Exit: D05–D08 arithmetic matches selected script; existing screens connected without parallel accounting logic in frontend.

## I06 — Rehearse and sign off

2026-10-26: real-service automated Chrome happy path PASSED with the included
CC0 bottle photo and simulated GPS. A fresh signed-in demo launcher is ready:
root `demo.command`; follow START_HERE.md. No missing secrets/photo blocker.
I06 remains open only for the two timed human runs on the presentation setup.

Depends on I01–I05. Execute every required check in DEMO_ACCEPTANCE.md on final presentation setup. Record commit, date, mode, evidence and two durations. All mandatory steps must pass; optional exclusions must be explicit. Mark READY only then.
