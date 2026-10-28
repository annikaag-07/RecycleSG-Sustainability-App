# Component verification and issue register

Updated: 2026-10-25 (Asia/Singapore). Read [acceptance](DEMO_ACCEPTANCE.md) first; integration order is in [tasks](INTEGRATION_TASKS.md).

## Baseline and ownership

The integration branch already contains the following fetched branch tips. Test their code on the merged branch; use these SHAs to attribute scope, not to discard later fixes. No new remote fetch was performed for this checklist.

| Area | Source baseline | Paths |
|---|---|---|
| UI-1: finding bins, account/profile/settings, admin shells | `origin/feature/ui-1` `0c1b659` | `Lab3/frontend/src/screens/find`, shared components/maps/auth |
| UI-2: logging, rewards, quests, badges, impact, feed/ranks | `origin/feature/ui-2` `cc20e53` | `Lab3/frontend/src/screens/earn`, shared API wrappers |
| Backend | `origin/feature/backend` `4e661f0` | `Lab3/backend/supabase/migrations`, scripts/data |
| CV (actual implementation landed on main) | `origin/main` `983c774` | `Lab3/CV` |
| Integration scaffold | `origin/feature/integration` `b174fa7` | `Lab3/integration` (no bridge implemented) |

Merged baseline HEAD: `c7945cb`. Attribution is by branch/area, not a claim about individual teammates' identities.

## Execution rules for any agent

1. Check `git status`, branch and applicable `AGENTS.md`. Preserve existing work.
2. Reproduce a component failure before fixing it; add a regression test when practical.
3. Run offline component tests before live services. No real Gemini requests, user photo uploads or shared database writes merely to run offline tests.
4. Record command, result, scope and limitations here. Mark an issue fixed only after its regression passes.
5. Do not install/configure a new frontend lint stack implicitly: `expo lint` attempts auto-setup when absent.
6. Changes using Expo/React Native APIs require the versioned docs described in frontend `AGENTS.md`.
7. Stop at missing live configuration and record BLOCKED; never invent credentials or report mocked tests as end-to-end success.

## Component gates

Latest sync: teammate backend/UI-2 changes are merged at HEAD `243d085`.
33 migrations, 14 database checks, 11 frontend tests/typecheck, 8 public HTTP
checks and full real browser journey pass. See TEAMMATE_SYNC.md for exact scope.

2026-10-26 superseding live result: C11–C13 now have real-service automated
Chrome coverage, including real bottle recognition and reward/quest/contribution
arithmetic. See LIVE_SETUP.md and START_HERE.md. C12 uses the chosen CC0 image
only (not an accuracy benchmark); C13 still needs human classroom rehearsal.
No production-readiness claim or undisclosed physical GPS test is implied.

| ID | Test | Status / evidence |
|---|---|---|
| C01 | Frontend `npm run typecheck` | PASS after current fixes, 2026-10-25 |
| C02 | Web export with placeholder local Supabase environment | PASS after current fixes; `/tmp/recyclesg-component-web`; build only, no live backend |
| C03 | UI-1 pure helpers/API behavior and navigation on actual browser | Helper tests PASS; actual Chrome login/find/search/detail/profile navigation PASS against fake services; real hosted services NOT RUN |
| C04 | UI-2 rule calculations, submission/upload retry behavior | Rules/API tests PASS; actual Chrome reward/quest/impact/contribution/feed/rank flows PASS against fake services |
| C05 | Frontend lint | BLOCKED: no lint script/config; do not confuse with passing lint |
| C06 | All migrations apply from scratch | PASS: 32 migrations; latest offline suite 12 subtests + parent = 13 PASS; also applied to hosted project (LIVE_SETUP.md) |
| C07 | Backend positive path: search/check-in/log/verify/rewards/quests/badges/contribute/impact/feed/ranks | PASS: repeatable assertion suite under `Lab3/backend/tests` (files added, not Git-committed yet) |
| C08 | Backend negative paths: ownership, cooldown, invalid quantities, duplicate claim/contribution | PASS in same isolated suite; not a concurrency/HTTP test |
| C09 | CV classifier unit tests | PASS: 7 existing tests, mocked inference |
| C10 | CV HTTP and trusted verification contracts | PASS: 23 Python tests total (7 classifier, 6 upload HTTP, 10 verifier); real adapter also exercised over HTTP in browser suite |
| C11 | Real Supabase Auth + Storage + PostgREST | PASS, 2026-10-26: real Chrome login/upload/check-in/verification/rewards/quest/contribution; also 8 public HTTP checks and programmatic uncertainty path. GPS explicitly simulated. |
| C12 | Real Gemini inference on demo photo | PASS on included CC0 plastic-bottle.png: plastic confidence 1.0, real Verified reward in browser. Blank image uncertainty also passes. Not a general accuracy benchmark. |
| C13 | Integrated presentation device/browser | PASS automated Chrome with real services, 20.858 s; launcher opened fresh signed-in account. Two timed human classroom rehearsals still NOT RUN. |

## Issue register

Checkbox means resolved and verified, or explicitly excluded with reason. Severity is relative to this classroom demo, not production.

- [x] **ISS-01 / integration — IMPLEMENTED, simulated E2E PASS:** `shared/api/verification.ts` calls `/verify`; `Lab3/CV/verification.py` authenticates, reads the owned stored photo, classifies and invokes the finalization RPC. Browser test uses this actual adapter with fake inference and Supabase transport. Deployment still needs C11/C12.
- [x] **ISS-02 / UI-2 — FIXED, browser PASS:** RewardUI auto-verifies Pending once on entry, bounds client waiting to 25 seconds, refreshes after response/error and exposes explicit retry/status refresh. Uncertain→retry→Verified and mismatch→Rejected tested without reload.
- [x] **ISS-03 / backend — FIXED through supported finalizer:** New migration `20261025010000_finalize_recycling.sql` writes status/timestamp together under a row lock. SQL regression and browser feed check pass. Never manually update status alone to simulate verification.
- [ ] **ISS-04 / HIGH / demo setup:** Real GPS/accuracy gate plus 30-minute cooldown can block classroom/rehearsal. Fifteen-minute expired log tells user to check in again before cooldown ends. Files: `CheckInUI.tsx`, `LogRecyclingUI.tsx`, `earn/rules.ts`. Establish location/reset plan; correct misleading expired-window guidance.
- [x] **ISS-05 / contract — FIXED:** CV schema/prompt now distinguish Paper, Cardboard and Metal; all nine category names match DB names case-insensitively. Model schema tests pass; real model accuracy is still NOT RUN. Plastic remains the demo material.
- [x] **ISS-06 / HIGH / UI-2 photo helper — FIXED (offline regression):** Both stale-path and swallowed-collision tests failed before fix, passed after. `shared/api/photos.ts` now uses a fresh request ID per upload and propagates storage errors. No overwrite permissions added. Abandoned uploads can remain after failed submissions; automatic cleanup is deferred. Actual Storage retake rehearsal remains D recovery gate.
- [ ] **ISS-07 / HIGH / live configuration:** Real frontend/CV .env is not configured here. Cross-origin support and configuration examples are now implemented and tested locally. Finish I01 with the actual environment; never expose server keys to frontend.
- [x] **ISS-08 / UI-1 — FIXED:** Profile reads `listMyBadges`; browser asserts `Badges: 1, earned` after verification.
- [x] **ISS-09 / supported verification API — FIXED:** Finalizer returns existing terminal status without updating again. Repeated/parallel SQL calls preserve reward and quest counts; Python tests bypass inference for terminal records. Direct privileged SQL can still mutate rows; it is not a supported reset/reversal workflow.
- [x] **ISS-10 / UI-1 — FIXED (focused regression):** Route origin now derives from current params each render; old mounted state cannot override new coordinates/label. Focused mocked-hook regression passes. This is not a comprehensive native navigation test.
- [ ] **ISS-11 / LOW / UI-1/data:** Nearest 100 fetched before material filtering; incomplete specialized-material coverage and no opening hours in seed. Demo uses Plastic and no Open-now filter; broader query change deferred unless tested demo needs it.
- [ ] **ISS-12 / LOW / optional admin:** UI app_metadata.role differs from backend app_admins membership. Admin workflow excluded; do not treat UI gate as server authority.
- [x] **ISS-13 / MEDIUM / UI-2 — FIXED (copy regression):** Contribution/quest network-error text now says the operation may have succeeded and explains retry. Existing request identity/claim guards retained. Source-copy regression passes; actual network-loss rehearsal remains outstanding.
- [x] **ISS-14 / MEDIUM / CV — FIXED (HTTP regression):** Empty image upload reached classification and returned 200. `Lab3/CV/app.py` now rejects empty bytes with HTTP 400 before inference. Test failed before fix and passed afterward. This is not full image-content validation.

## Explicit exclusions

Account deletion, report submission backend/outbox completion, milestone approval, social moderation/posts/comments/likes, notification delivery and cross-device preferences are not acceptance blockers. Existing unavailable states may remain. Do not build them to make this checklist look complete.

## Evidence log

- Prior audit: TypeScript and web export passed; CV 7/7 passed. Isolated SQL applied 30 migrations and exercised downstream rewards successfully. Temporary probe was `/tmp/recyclesg-review.r59leY/database-review.mjs`; temporary output alone is not a durable test suite.
- At the initial audit, Supabase transport, browser interaction, phone GPS and real model inference were untested. Browser interaction is now covered by the later simulated pass below; real services/phone GPS remain outstanding.
- First component pass (historical): frontend 9 offline tests; backend 9 subtests plus suite (Node reported 10); CV 13 tests; TypeScript and web export passed. The later integration pass below supersedes these counts. No live database or model calls were made.
- ISS-04 expired-window wording corrected to explain possible remaining cooldown. Location/rehearsal setup still unresolved, so ISS-04 remains open.
- `npm run lint` was attempted and reports Missing script: lint. No lint stack was installed. CV dependency version emits an httpx/TestClient deprecation warning; tests pass.

### Integration pass evidence

- Frontend: 11 offline tests and TypeScript PASS after bridge/profile/origin changes, including the 25-second client abort contract.
- Backend: 11 subtests plus parent (Node reports 12), all 31 migrations PASS. Includes finalizer client-permission denial, wrong-owner refusal, timestamp assignment and repeat/parallel-call idempotency.
- CV: 23 tests PASS. Covers terminal retry, mismatch, unsure/unavailable, wrong owner, missing/foreign photo, invalid image size/type, missing auth/config and distinct material schema.
- Browser: final eleven-scenario run **11/11 PASS** (Node reports 12 including parent); total 70.7 seconds, happy-path automation 11.0 seconds. Genuine screens and SQL, fake auth/storage/model/GPS. No production data changed. Saved XML: `Lab3/integration/tests/artifacts/results.xml`.
- Photo submission network-error wording now acknowledges an uncertain write. Browser response-loss injection confirms recovery uses one activity/reward.
- Supported finalization rule: confident category matches selected material → Verified; confident mismatch → Rejected; unsure/unavailable → Pending with retry. Recognition is not physical-disposal proof. Rejection is terminal; a new action still obeys existing uniqueness/cooldown rules.
- Actual model configuration and browser origin setup are documented in `Lab3/CV/README.md` and both `.env.example` files. No secrets were added.

| Browser scenario | Final result |
|---|---|
| Login → find/search/detail → check-in → photo → verify → reward → quest → profile/impact → contribution → feed/ranks | PASS |
| Uncertain recognition, explicit retry succeeds | PASS |
| Confident mismatched material, rejected with zero points | PASS |
| Unavailable recognition, retry succeeds | PASS |
| Verification service HTTP 503, retry succeeds | PASS |
| Upload failure, retake, submit | PASS |
| Submission committed but response lost, retry recovers one activity/reward | PASS |
| Contribution committed but response lost, retry deducts once | PASS |
| Out-of-range GPS blocks check-in | PASS |
| Poor GPS accuracy blocks check-in | PASS |
| Rehearsal cooldown blocks second check-in | PASS |

Reward and impact screenshots were also visually inspected at a 430×900 browser viewport. They render the expected points, estimate disclaimer, material breakdown and contribution balance. Map-provider images are deliberately blocked, so map tile appearance is not part of this visual check.

### Browser reproduction

From `Lab3/integration/tests`: `npm ci --ignore-scripts`, `npm run build`, `npm test`.
See that directory's README for prerequisites and exact mock boundaries. It starts
loopback-only services on 54321/8000 and uses a fresh headless Chrome profile.
`artifacts/results.xml` contains the latest machine-readable result; screenshot
artifacts show rewards/impact and failures. Never deploy the fake-service build.

## Repeatable commands

Run from the repository root. Dependencies must be installed once; these tests do not need credentials.

```sh
# Frontend (existing TypeScript dependency; no new test framework)
cd Lab3/frontend
npm ci --ignore-scripts
npm test
npm run typecheck
```

```sh
# Backend (from repository root, separate test-only package)
cd Lab3/backend/tests
npm ci --ignore-scripts
npm test
```

```sh
# CV (from repository root; uv supplies an isolated environment)
cd Lab3/CV
uv run --no-project --with-requirements requirements-test.txt python -m unittest discover tests -v
```

```sh
# Build-only web check (from frontend directory; placeholder is NOT a live key)
EXPO_NO_TELEMETRY=1 CI=1 EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 EXPO_PUBLIC_SUPABASE_ANON_KEY=review-placeholder ./node_modules/.bin/expo export --platform web --output-dir /tmp/recyclesg-component-web
```

Frontend tests transpile real TS helpers/wrappers and mock boundary dependencies; they do not mount React screens. Backend tests run actual migrations in-memory with minimal auth/storage schema stand-ins; they do not validate Supabase HTTP, deployed grants beyond the fixture, or concurrent requests. CV tests mock model inference; they do not measure recognition accuracy. Preserve these distinctions in future status updates.
