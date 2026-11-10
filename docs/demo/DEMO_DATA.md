# Five-minute demo data

Status on 2026-11-10 — proposed presentation dataset. The live acceptance runner creates test fixtures with different starting balances. Prepare this dataset before the timed rehearsal.

The demo should show a first-time recycler finding a bin, identifying an item, earning a reward and contributing to a community goal. A second presenter refreshes the feed to show the new activity.

## Accounts and starting state

| Account | Purpose | Starting records |
|---|---|---|
| Presenter A | Drives the recycling journey | Confirmed login, zero points/XP, no check-ins, no activity, first quest unclaimed |
| Presenter B | Shows another user's feed | Confirmed login, zero points/XP, no activity |
| Demo Mei | Background community member | One Verified Plastic activity, quantity 2, 20 points/XP, 0.20 kg illustrative CO₂ |
| Demo Ravi | Background community member | One Verified Paper activity, quantity 3, 30 points/XP, 0.30 kg illustrative CO₂ |
| Demo Sara | Background community member | One Verified Metal activity, quantity 4, 40 points/XP, 0.40 kg illustrative CO₂ |

Background accounts provide three feed entries and three leaderboard positions. Label these as seeded demonstration history. Use the existing finalizer/reward triggers when preparing their records so points, quest progress, badges and impact agree. Record their IDs in the seed manifest. All background quests remain unclaimed.

Create one dedicated milestone named **Classroom recycling challenge**, with target 100. Have the three background accounts contribute their 20, 30 and 40 points through the normal contribution RPC. This produces 90/100 progress and zero remaining available points for those accounts while preserving their lifetime points and XP. Keep the milestone Active for the presentation.

## Expected live demonstration

1. Presenter A searches for a Plastic-compatible bin. Show a second search location such as Tampines, then return to the chosen demo bin.
2. Check in using the agreed real location or explicitly disclosed simulated GPS. The existing tested location is 1 Beach Road. Select the venue before the rehearsal.
3. Upload `docs/demo/assets/plastic-bottle.png` and demonstrate real Gemini recognition. Submit quantity 1 and verify.
4. Show 10 points, 10 XP, the first badge and 0.10 kg illustrative carbon savings. Claim the first quest to reach 20 points/XP.
5. Contribute 10 points to the classroom challenge. The milestone reaches 100/100 and AwaitingVerification. Presenter A retains 10 available points and 20 lifetime points/XP.
6. Presenter B refreshes the feed and sees Presenter A's new verified drop beside the seeded community history. Show the leaderboard if time permits.

The challenge represents a classroom participation goal. Describe the carbon figure as an illustrative estimate. A completed point target moves to AwaitingVerification.

## Preparation and reset checklist

- [ ] Record project, commit, seed run ID and all created user/activity/photo/milestone IDs in an ignored local manifest.
- [ ] Store confirmed login credentials in an owner-readable local file. Give the two presenters their assigned logins through the team's usual private channel.
- [ ] Verify fresh presenter balances, empty check-in histories and the unclaimed first quest.
- [ ] Verify three public feed entries, leaderboard totals 20/30/40, private activity ownership and the challenge at 90/100 Active.
- [ ] Confirm material compatibility at the demo bin, image upload and current Gemini response.
- [ ] Keep an optional separate recovery account for Pending/Rejected examples if those are included in the presentation script.
- [ ] After rehearsal, remove only that run's contributions before removing its milestone/accounts. Remove private photos through Storage. Recreate a fresh dataset for the final demonstration.

The existing `live_backend.py --retain-demo` output is useful for API inspection. Its first account has already completed the first-drop quest and holds Pending/Rejected activities. Use fresh Presenter A/B accounts for this presentation script.
