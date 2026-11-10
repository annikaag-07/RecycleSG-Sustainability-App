# Five-minute demo: start here

For teammate review, begin with the [handoff and alignment checklist](HANDOFF.md).

The core journey passed against real Supabase and Gemini on 2026-10-26. Photo
suggestions were added and regression-tested afterward. That automated run used
explicitly simulated GPS. The presentation is Friday, 13 November 2026, using indoor GPS at N4 as confirmed by Nick. Nick owns all demo data preparation, validation and reset.
See [testing/evidence](TESTING.md) and [hosted setup](LIVE_SETUP.md).
The presenter accounts, background community history and milestone are deployed and validated. Credentials are in the ignored local file `Lab3/CV/results/presentation-friday.json`. Setup and tested reset instructions are in [demo data](DEMO_DATA.md).

## Start the application

Configure the environments described in [hosted setup](LIVE_SETUP.md), and install
frontend dependencies with `npm ci` in `Lab3/frontend`. Start each service in a
separate terminal, running these commands from the repository root:

```sh
cd Lab3/CV
uv run --no-project --with-requirements requirements.txt uvicorn app:app --host 127.0.0.1 --port 8000
```

```sh
cd Lab3/frontend
npm start -- --web --port 8081
```

Open http://127.0.0.1:8081 and sign in with your prepared account. Keep both
terminals running. Internet access is required for hosted Supabase and Gemini.
No account creation, sign-in or GPS simulation happens automatically.

Use **Demo recycling bin — NTU N4** at **50 Nanyang Avenue, Block N4, Singapore 639798**.
The building pin is **1.346176586042716, 103.6821610515534** and accepts Plastic.
Use indoor GPS at N4 for check-in. The sample photo is
`docs/demo/assets/plastic-bottle.png`.

## What to click and say

1. **Community and find.** Briefly show the three seeded feed entries and the classroom challenge at 90/100. Explain that these background users are prepared demo history. Say: “RecycleSG helps people find suitable recycling
   points, identify materials, and see their contribution.” Show **Change search location → Search by address instead** with Tampines, then return to **Demo recycling bin — NTU N4**. Open Google Maps to show directions.
2. **Check in.** Click **Check in here**, then **Continue — log your
   recycling**.
3. **Record.** Click **Add a photo** and choose
   `docs/demo/assets/plastic-bottle.png`; show the automatic **Plastic** suggestion,
   confirm or change the selection, keep quantity **1**,
   then **Log 1 plastic item · 10 points**. Wait for **+10 Eco Points**.
   Say: “The photo is checked by the real recognition service. Material matching
   is a prototype check, not proof that someone physically disposed of an item.”
4. **Recognition.** Go to **Quests → One-off** and claim **10 Eco
   Points**. Then **You** shows one badge. Balance is now 20.
5. **Impact.** Click **See impact and milestones**. Explain that
   **0.1 kg CO₂** is an illustrative estimate, not a measured result. Choose
   **Classroom recycling challenge → 10 → Review → Confirm contribution → Done**.
   Show progress changing from 90/100 Active to 100/100 AwaitingVerification.
   Available points become 10; lifetime points remain 20. Administrator verification remains pending.
6. **Community.** Switch to Presenter B in a separate browser profile/device. Leave and reopen **Feed** to fetch A's new drop above the seeded history. Reopen Impact to show the shared challenge state. Show **Ranks** with A at 10 this week and 20 all time. Explain the intended
   impact: reduce uncertainty about where/what to recycle and encourage repeat
   participation. Milestone points are not actual financial donations.

## Expected results and limits

| Stage | Lifetime points | Available points | XP |
|---|---:|---:|---:|
| One verified Plastic item | 10 | 10 | 10 |
| First one-off quest claimed | 20 | 20 | 20 |
| Contribute 10 points | 20 | 10 | 20 |

Expect one earned badge, 0.10 kg illustrative CO₂ and 0.005 tree equivalents.
Weekly leaderboard recycling points are 10; all-time points are 20. The feed
shows the profile display name (Anonymous Recycler if unset), with username hidden.
If showing the badge without claiming the quest instead, contribution leaves
0 available and 10 lifetime/XP; do not mix the two scripts’ expected totals.

The national seed marks points Information Outdated; physical conditions are unverified.
The N4 point is a clearly labelled classroom fixture. Recognition checks material, not quantity or physical disposal.
Milestone points are not financial donations or proof of project completion.

Keep registration/email delivery, password recovery, deletion, reporting,
admin approval/moderation, social posting, notifications and streaks outside
the completed demo scope. See [remaining work](TESTING.md#remaining-work-and-limits).

Photo source/licence: [assets/README.md](assets/README.md). Local credentials and
screenshots are under ignored `Lab3/integration/tests/artifacts/live/`; never
commit them. Live scripts and account retention are described in the testing guide.

## Data and feature checklist

Data preparation and hosted API validation passed on 2026-11-10. The final A/B accounts remain fresh. A separate consumed dataset verified the rewards and challenge transition, followed by complete reset. The checks below also describe the expected screen results when using the prepared accounts.

Nick prepares and validates the dataset against these expected results.

- [ ] Record commit, date, tester, browser/device and viewport below.
- [ ] Confirm a fresh confirmed account/profile, zero points and an unclaimed first-drop quest.
- [ ] Confirm the prepared photo is under 5 MB, the point accepts Plastic, and the displayed suggestion/verification works.
- [ ] Avoid the 30-minute per-bin cooldown and 10-check-in UTC-day limit; submit within 15 minutes of check-in. A fresh account is the repeat strategy, not manual reward resets.
- [ ] Verify the three named background feed entries and current-week ranking totals 20/30/40.
- [ ] Confirm Classroom recycling challenge is Active at exactly 90/100 with three background contributions.
- [ ] Confirm Presenter B can reopen Feed/Impact and see A's changes using a separate session.
- [ ] After the live quest and contribution, verify A has 20 lifetime points, 10 available points and 20 XP; challenge is 100/100 AwaitingVerification.
- [ ] Check activity and contribution retries do not award/deduct twice; a retake uses the new photo.
- [ ] Return to You/Impact/Quests and confirm refreshed values.

| Sign-off field | Value |
|---|---|
| Commit / date / tester | NOT RUN |
| Browser / device / viewport | NOT RUN |
| Backend identifier (no credentials) | NOT RUN |
| CV / location mode | Real Gemini / indoor GPS at N4 |
| Script | Quest recommended |
| Data and feature sign-off | PENDING |

Record the dataset and feature-check results here, including the commit and evidence paths.
