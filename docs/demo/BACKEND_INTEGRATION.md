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
- [ ] Guard live tests against accidental project mismatch.
- [ ] Two-user API journey: login, other-location search, GPS check-in, private upload, real Gemini, verification, rewards, quest, impact, populated feed.
- [ ] Exercise foreign-user access, Pending/Rejected exclusion, repeated/concurrent verification and contribution retries.
- [ ] Run database/CV regressions; record live evidence and cleanup.
- [ ] Commit tested changes and hand off this contract. No UI implementation in this work.

For every stage: add the acceptance test, observe the failure where applicable, implement the smallest fix, rerun affected tests, then commit. Live tests must never modify pre-existing user records or milestones.
