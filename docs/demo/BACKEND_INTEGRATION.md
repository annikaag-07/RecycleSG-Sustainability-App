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
- [ ] Hosted concurrent contribution check: blocked on creating/cleaning an isolated milestone (see below).
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

## Remaining hosted contribution check

The configured project's service key receives HTTP 403 when inserting a dedicated test milestone. The connected Supabase MCP account also cannot inspect this project or run advisors. This is a **test-fixture access blocker**, not evidence that the user-facing contribution RPC is broken. No schema/privilege changes were made merely to enable testing.

The project owner needs to provide an isolated test environment with trusted fixture creation/cleanup access, or arrange narrowly scoped creation/removal through SQL. Then run `live_backend.py` without `--skip-contribution`. It creates its own milestone, races two requests sharing a UUID, expects one contribution and balances 20 lifetime / 10 available / 20 XP, and deletes contributions before the milestone/users. Do not point it at an existing shared milestone or remove the cleanup constraints.

## Verified 2026-11-09

- CV/configuration: 28 tests pass; new behavioral tests observed failing before fixes.
- Database: 13 subtests plus parent pass, applying all 33 migrations.
- Existing browser integration: 17 scenarios plus parent pass with fake external services, actual SQL and verification adapter.
- Hosted public API: all 8 checks pass.
- Real Gemini: plastic suggestion, matching verification, concurrent/repeated verification, confident mismatch and blank-image uncertainty pass.
- Real hosted rewards, badge, quest, carbon parity, populated two-user feed and owner isolation pass. Hosted contribution concurrency remains unchecked as above.
- Retain-demo and reset commands were exercised successfully; all accounts/photos created during this work were removed. Re-run the seed command when preparing rehearsal.

No UI source changes. No general image-accuracy claim, measured carbon claim, physical GPS test or classroom-network guarantee. The server still performs multiple sequential network calls; a caller timeout requires refresh/retry rather than a second reward.
