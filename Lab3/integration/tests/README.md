# Credential-free browser integration tests

This suite runs the actual Expo web screens, the actual FastAPI `/verify` adapter,
and all repository SQL migrations. It uses a small test-only HTTP adapter over
PGlite for Supabase, deterministic fake authentication, private in-memory image
storage, simulated browser GPS and fake material recognition. No real user data,
Supabase project or Gemini key is used. External browser requests are blocked,
including map tiles; map-provider availability/visual tiles are not tested.

## Run

Requirements: Node/npm, uv, Google Chrome installed (`channel: chrome`), and free
loopback ports 54321 and 8001. The test CV service uses 8001 so the live app can keep using 8000. Do not run against an existing local Supabase instance.
Install frontend dependencies in `Lab3/frontend` first (`npm ci --ignore-scripts`).

From this directory:

```sh
npm ci --ignore-scripts
npm run build
npm test
```

The test starts/stops its own loopback services and a separate headless browser;
it does not use your existing Chrome profile. Python requirements come from
`Lab3/CV/requirements-test.txt`. Initial installation can need network access;
test execution makes no external service calls once dependencies are cached.

The exported build has fake URLs/keys embedded. **Do not deploy `artifacts/web`.**
The application's ordinary build has no mock mode or test bypass added.

## Evidence and boundaries

- `artifacts/results.xml`: machine-readable results of the latest run.
- `artifacts/reward.png`, `impact.png`: actual browser screenshots.
- Failed scenarios also save a screenshot and visible page text.
- `artifacts/cv-service.log`: local adapter diagnostics; fake credentials only.
- Generated artifacts and node_modules are ignored by Git. Rerun to regenerate.

Scenarios cover the happy path, uncertainty/retry, unavailable inference/retry,
material mismatch, verification HTTP failure, upload failure/retake, lost
submission response, lost contribution response, out-of-range GPS, imprecise GPS
and cooldown. Asserted database values come from actual reward/quest/contribution
SQL, not hard-coded fake reward totals. Lost-response tests commit the operation
upstream then deliberately abort delivery to the browser.

Photo-selection scenarios also cover automatic material suggestion before any
activity is created, manual override, uncertainty and retry, classifier HTTP
failure, a material the point does not accept, a late response after a manual
choice, and a retake that supersedes an in-flight request. The fake classifier
is injected into both `/classify` and `/verify`; neither calls Gemini. The
suggestion screen is captured in `artifacts/photo-suggestion.png`.

The HTTP adapter intentionally implements only the interfaces needed here. It is
not Supabase GoTrue, Storage or PostgREST. It does not validate real email login,
real upload transport/permissions, model accuracy, map tiles, actual GPS, Android
or iOS. Parallel finalization calls are also checked in the SQL suite, but PGlite
is a single-engine test and is not a production concurrency benchmark.

The authoritative acceptance gate and remaining live checks are in
`../../../docs/demo/DEMO_ACCEPTANCE.md`. Never replace live sign-off with these results.
