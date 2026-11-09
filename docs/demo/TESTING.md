# Testing and recorded evidence

Consolidated 2026-10-28. Results below are dated observations, not tests rerun by this documentation change. The [demo guide](START_HERE.md) owns the presentation checklist; [hosted setup](LIVE_SETUP.md) owns deployment history.

## Latest recorded checks

| Check | Result | What it establishes |
|---|---|---|
| Frontend TypeScript and 13 tests | PASS, 2026-10-28 | Real helpers/API wrappers with mocked dependencies; no mounted-screen coverage |
| TypeScript unused locals/parameters | PASS, 2026-10-28 | Compiler checks; does not prove all exported code is used |
| CV: 23 tests (7 classifier, 6 HTTP, 10 verifier) | PASS, 2026-10-28 | Mocked inference, upload validation, ownership, material matching, retries and errors |
| Database: 13 subtests + parent (14 reported) | PASS, 2026-10-28 | All 33 migrations and RPC/RLS contracts in isolated PGlite with minimal auth/storage stand-ins |
| Browser: 17 scenarios + parent (18 reported) | PASS after photo-suggestion integration | Real Expo screens, FastAPI adapter and SQL; fake auth/storage/inference and simulated GPS |
| Web export | PASS after photo-suggestion integration | Build succeeds; no claim about deployed services |
| Hosted public HTTP checks: 8 | PASS, 2026-10-26 | Public reads and denied access, not authenticated write flows |
| Real-service browser journey | PASS, 2026-10-26 | Chrome + real Supabase/Gemini; explicitly simulated GPS |
| Frontend lint | NOT CONFIGURED | `npm run lint` has no script; do not let `expo lint` silently install a new stack |
| Human classroom rehearsal, physical Android/iOS testing, general model accuracy | NOT RUN | Separate from automated evidence |

The browser scenarios cover the complete happy path; uncertain/unavailable inference and retry; confident mismatch; verification HTTP failure; failed upload/retake; lost submission/contribution responses; out-of-range or imprecise GPS; cooldown; and photo suggestions with manual override, unsupported materials, delayed responses and retakes. See the [browser suite README](../../Lab3/integration/tests/README.md) for the exact mock boundaries and artifacts. The test deliberately blocks map tiles.

The OneMap zoom fix was checked separately at device-pixel ratios 1 and 2: zoom 19 loaded 9/9 tiles after the fix, versus zero before. Reward, impact and photo-suggestion screenshots were visually inspected at a 430×900 viewport. This does not establish native map behaviour.

## Offline checks

Run each block from the repository root. Install Node/npm and uv first. Python tests use isolated dependencies; tests do not call hosted Supabase or Gemini. Follow frontend `AGENTS.md` when changing Expo/React Native code.

```sh
cd Lab3/frontend
npm ci --ignore-scripts
npm run typecheck
npm test
```

```sh
cd Lab3/backend/tests
npm ci --ignore-scripts
npm test
```

```sh
cd Lab3/CV
uv run --no-project --with-requirements requirements-test.txt python -m unittest discover tests -v
```

```sh
cd Lab3/integration/tests
npm ci --ignore-scripts
npm run build
npm test
```

Browser prerequisites: installed Google Chrome, frontend dependencies, free loopback ports 54321 and 8001. Do not run alongside local Supabase on 54321. Port 8000 remains available for the live demo. Initial dependency installation may need internet. Never deploy the fake-service build under `artifacts/web`.

Optional build-only check, from `Lab3/frontend`:

```sh
EXPO_NO_TELEMETRY=1 CI=1 EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 EXPO_PUBLIC_SUPABASE_ANON_KEY=review-placeholder ./node_modules/.bin/expo export --platform web --output-dir /tmp/recyclesg-component-web
```

Generated evidence is ignored under `Lab3/integration/tests/artifacts/`: `results.xml`, reward/impact/photo-suggestion screenshots, failure screenshots/page text and `cv-service.log`. Regenerate it rather than committing credentials or output. PGlite checks do not establish real GoTrue/PostgREST/Storage behaviour or production concurrency; mocked CV tests do not measure image accuracy. The Python dependency currently emits an httpx/TestClient deprecation warning despite passing tests.

## Opt-in live checks

These require configured environments and internet. Read-only public checks, from `Lab3/backend/tests`:

```sh
node --env-file=../../frontend/.env --test live-public.test.mjs
```

This reads public data/settings and tests denied access; HTTP 206 is a valid partial PostgREST result. It creates no accounts, uploads or rewards. Use a Node version supporting `--env-file` and `process.loadEnvFile` for the live scripts.

The following commands **write test data and call Gemini**. Scripts require an explicit project reference matching both frontend/CV environments. Current backend-only acceptance evidence and seed/reset commands are in [BACKEND_INTEGRATION.md](BACKEND_INTEGRATION.md); older runs below remain historical evidence. From `Lab3/CV`:

```sh
LIVE_TEST_PROJECT_REF=ihrgxedwftfzzohqpnnu uv run --no-project --with-requirements requirements-test.txt python live_smoke.py
```

The 2026-10-26 run created a temporary confirmed user, exercised login/profile creation, simulated-GPS check-in, private upload/download and the real `/verify` route through FastAPI TestClient. A synthetic blank PNG returned `unsure` in 2,112 ms: Pending, zero points. The script removed its own photo, signed out and deleted its temporary account/cascading rows. This does not test successful bottle recognition.

For the real Chrome journey, start Expo on 8081 and FastAPI on 8000, then from `Lab3/integration/tests`:

```sh
LIVE_TEST_PROJECT_REF=ihrgxedwftfzzohqpnnu node live-demo.mjs
```

The 2026-10-26 run took 20.858 seconds: login → search → simulated-GPS check-in → real stored bottle photo → Gemini → Verified → 10 points → quest → badge → impact → contribution → feed/ranks. Final lifetime/available/XP: **20/10/20**. It checked the feed display name while keeping the username anonymous. This is automation time, not a human rehearsal. Accounts/contributions and local results are retained; credentials have owner-only permissions under ignored `artifacts/live/`.

The later standalone `/classify` check on the included bottle returned Plastic, confidence 1.0, in 7,285 ms. These are results for a chosen image, not accuracy measurements. Use `Lab3/CV/evaluate.py` with labelled images for accuracy, confusion matrices and latency; no general benchmark is signed off.

## Remaining work and limits

- Human presentation: two timed runs plus recovery checks on the actual laptop/network; see the demo guide.
- Data/search: all seeded points are marked Information Outdated, hours are absent, and only Plastic/Paper/Glass/Metal have links. Nearby results are limited before client-side material filtering.
- Recovery: abandoned uploads can remain after failed submissions; cleanup is deferred. Older activity recovery is constrained by list limits. Check-in response-loss wording still needs work.
- Verification: material matching does not validate quantity, prevent every photo reuse, or prove disposal. GPS can be spoofed. Rejected activities are terminal; retries must respect existing check-in/material uniqueness and cooldowns.
- Missing workflows: report submission/outbox completion, account deletion, milestone decisions, point administration, social posting/moderation/follows, notification delivery, streaks and cross-device preferences. UI admin roles and backend `app_admins` membership differ.
- Email delivery/reset links, arbitrary photos and physical-device networking/GPS are not covered by the successful laptop demo.

## Integration provenance

The original merged baseline was `c7945cb`: UI-1 `0c1b659`, UI-2 `cc20e53`, backend `4e661f0`, CV on main `983c774`, and integration scaffold `b174fa7`. Later backend `5a146f5` and UI-2 `77d37d6` added matching feed display-name behaviour; merge commits were `896de83` and `243d085`. Existing team accounting, quests and badges were retained.

The seven integration commits (`25a9be7` through `3cfb22e`) added permission restrictions, the trusted verifier, photo suggestions/retries, photo/origin/badge/recovery fixes, map zoom fixes, tests and demo tooling. They were pushed on `nick/recyclesg-integration` on 2026-10-28. Git history retains the superseded checklists and intermediate evidence.

A pre-merge local backup was retained as stash object `cb7ce94ca56e36ccf96a3a0ccb2cc475838544da`; its changes were already restored before those commits. Do not apply it again over the integrated work. Ignored environments, credentials and generated artifacts were never included in that backup.
