# Backend integration and Harish handoff

Scope: backend/API only. Existing UI callers remain compatible; UI wiring belongs to the UI team.

## Contract decisions

- `POST /classify` suggests material only. It never writes an activity or awards points.
- Gemini returns material, finite confidence in [0,1], and reason. At least 0.6 confidence is needed. One provider attempt, 15-second timeout; unavailable/uncertain results leave verification Pending for an explicit retry.
- `POST /verify` takes `{activity_id}` and the user's Bearer token. The server checks ownership, reads the private stored image and finalizes through the existing locked SQL RPC. Matching material → Verified; confident mismatch → Rejected. Terminal retries do not classify or award again.
- Every verification response adds `activity_impact: {estimated_co2_saved_kg, is_estimate: true, basis: "illustrative_per_item_v1"}`. This is the saved **activity's** impact, not the user's total. Pending/Rejected = 0; Verified = quantity × 0.1 kg. Never accumulate response values on retries.
- User totals still come from `get_user_environmental_impact(p_user_id)`. This is an illustrative classroom estimate, not measured carbon savings. Gemini does not guess weight or emissions factors. Changing this formula later requires updating both SQL totals and the adapter contract, with parity tests.
- Existing rewards remain 10 points/XP per verified unit. Quests count activities; claiming is separate. Only Verified activities enter the public feed; private activity/photo access stays owner-only.

## Ordered acceptance checklist

- [x] Bring integration branch up to current `origin/main` (PR #9).
- [x] Red → green tests for invalid model confidence, rate-limit behavior and saved-state carbon output.
- [x] Guard live tests against accidental project mismatch.
- [x] Two-user API journey: login, other-location search, GPS check-in, private upload, real Gemini, verification, rewards, quest, impact, populated feed.
- [x] Exercise foreign-user access, Pending/Rejected exclusion and repeated/concurrent live verification.
- [x] Contribution retries pass isolated SQL/browser tests, including lost responses.
- [x] Hosted concurrent contribution check passed on 2026-11-10 using MCP-created fixtures and authenticated API requests.
- [x] Run database/CV regressions; record live evidence and cleanup.
- [x] Commit tested changes and hand off this contract. No UI implementation in this work.

For every stage: add the acceptance test, observe the failure where applicable, implement the smallest fix, rerun affected tests, then commit. Live tests must never modify pre-existing user records or milestones.

## Repeatable API acceptance and demo data

From the repository root, enter `Lab3/CV`. Use the configured team project explicitly:

```sh
export LIVE_TEST_PROJECT_REF=ihrgxedwftfzzohqpnnu
uv run --no-project --with-requirements requirements-test.txt python live_backend.py --skip-contribution
uv run --no-project --with-requirements requirements-test.txt python live_smoke.py
```

The first command exercises the two-user journey against real Supabase/Gemini via FastAPI TestClient. GPS is simulated. The second uses a blank image and requires genuine uncertainty, Pending and zero points. Both clean up their own records. No Expo/browser server is needed. `--skip-contribution` is explicit: reports mark full acceptance false rather than silently passing that check.

To populate the feed for rehearsal, add `--retain-demo` to the first command. It creates A (one Verified drop, one Rejected, one Pending, 20 points after quest) and B (zero points; can see A's feed entry). It prints the path of an ignored, owner-readable `results/demo-<run>.json` containing login credentials. Do not commit or share that file. Reset only those fixtures with:

```sh
uv run --no-project --with-requirements requirements-test.txt python live_backend.py --reset-demo results/demo-<run>.json
```

Normal runs retain no credentials; non-secret per-run evidence is under ignored `Lab3/CV/results/backend-<run>.json`. Do not run scripts with Python `-O`, which disables assertions.

## Hosted contribution verification

The project-specific Supabase MCP connection now works as `postgres`. On 2026-11-10, MCP created and removed an isolated milestone while `live_contribution.py` exercised the same authenticated contribution and listing RPCs used by the app. The service key still lacks direct milestone INSERT and contribution DELETE grants. Fixture management through MCP resolves that limitation.

The hosted test passed simultaneous duplicate requests, changed-amount UUID reuse rejection, zero-balance rejection, owner-only contribution history, target capping and retry after completion. Starting balance was 20. The duplicate 10-point request left 10 available, and a subsequent request accepted the remaining 5 needed for a 15-point milestone. Final lifetime/available/XP were 20/5/20, with exactly two contribution rows totalling 15 and status AwaitingVerification.

Repeat using a two-account manifest from `live_backend.py --skip-contribution --retain-demo`, with A at 20/20/20. Through MCP, create a fresh milestone named `API acceptance <manifest.run>`, target 15, current points 0. Then run from `Lab3/CV`:

```sh
LIVE_TEST_PROJECT_REF=ihrgxedwftfzzohqpnnu uv run --no-project --with-requirements requirements-test.txt python live_contribution.py results/demo-<run>.json --milestone-id <id>
```

Delete only that milestone's test contributions and milestone through MCP, then run the manifest's reset-demo command. The focused test assumes a fresh milestone and 20 available points. Repeating a completed test requires fresh fixtures. Evidence is written to ignored `results/contribution-<run>.json`.

For the successful 2026-11-10 focused run, two temporary Auth accounts were created and A's 20 points were generated with a synthetic two-item activity through the real SQL finalizer. Contribution requests used real user login tokens and hosted RPCs. All fixtures were removed and cleanup verified.

## Demo dataset and current Gemini check

The presentation dataset is deployed and validated on 2026-11-10. It contains fresh presenters, three background recyclers and challenge ID 6 at 90/100 Active. Setup, reset commands and evidence are in [DEMO_DATA.md](DEMO_DATA.md).

The full live journey was attempted twice on 2026-11-10. The first run failed the suggestion assertion. A standalone retry recognized Plastic at confidence 1.0. The second run passed suggestion and concurrent verification, then failed the expected Rejected status for the mismatched material. Those failures did not capture enough response detail to identify the cause. Assertions now include the safe result fields for future diagnosis. Both failed runs cleaned up their records. The earlier successful full journey remains dated 2026-11-09. A fresh complete Gemini rehearsal is still required before presenting.

## Verified 2026-11-09

- CV/configuration: 28 tests pass; new behavioral tests observed failing before fixes.
- Database: 13 subtests plus parent pass, applying all 33 migrations.
- Existing browser integration: 17 scenarios plus parent pass with fake external services, actual SQL and verification adapter.
- Hosted public API: all 8 checks pass.
- Real Gemini: plastic suggestion, matching verification, concurrent/repeated verification, confident mismatch and blank-image uncertainty pass.
- Real hosted rewards, badge, quest, carbon parity, populated two-user feed and owner isolation pass. Hosted contribution concurrency was subsequently verified on 2026-11-10 as above.
- Retain-demo and reset commands were exercised successfully; all accounts/photos created during this work were removed. Re-run the seed command when preparing rehearsal.

No UI source changes. No general image-accuracy claim, measured carbon claim, physical GPS test or classroom-network guarantee. The server still performs multiple sequential network calls; a caller timeout requires refresh/retry rather than a second reward.
