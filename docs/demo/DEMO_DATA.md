# Five-minute demo data

Status on 2026-11-10 — deployed and validated in team project `ihrgxedwftfzzohqpnnu`. Final run `dc1c946e178b445da088b59c084918a4` has challenge ID **6** at **90/100 Active**.

The five confirmed logins and resource IDs are saved in `Lab3/CV/results/presentation-friday.json`, an owner-readable file ignored by Git. Use the accounts labelled Presenter A and Presenter B. The three background users have synthetic demonstration history created through the trusted finalizer and reward triggers.

Presentation is Friday, 13 November 2026. Nick owns all demo data preparation, validation and reset. Background verifications should fall in the Singapore week of 9–15 November 2026.

## N4 demo bin is deployed

The team project contains **Demo recycling bin — NTU N4**, point ID **12301**, at **50 Nanyang Avenue, Block N4, Singapore 639798**. It accepts Plastic, Paper, Glass and Metal. The source field identifies it as a classroom demo fixture.

Coordinates are **1.346176586042716, 103.6821610515534**, resolved from OneMap's N4 School of Computer Engineering entry on 2026-11-10. Postal code 639798 covers several campus buildings, so search **Nanyang N4** and select the N4 entry. [OneMap lookup](https://www.onemap.gov.sg/api/common/elastic/search?searchVal=NANYANG%20N4&returnGeom=Y&getAddrDetails=Y&pageNum=1)

Repeatable setup SQL is `Lab3/backend/supabase/demo/ntu_n4.sql`. Run it through SQL/MCP against the team project. The script reuses the fixture's source identifier and material links on subsequent runs. The live nearby API and a real authenticated check-in passed with simulated coordinates at the pin. A distant Tampines check-in was rejected. The temporary account and check-in were removed, and the bin remains available.

Check-in requires a reported location within 100 m and the UI requires accuracy of at most 100 m. Nick confirmed indoor GPS at N4 for the presentation.

Use **Change search location → Search by address instead** to browse bins around another area. Selecting directions opens Google Maps from the current location to the selected bin, including when the bin was found through an address search.

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

## Features that need an existing community

Five accounts and one shared challenge are enough. Three background users populate community features; two separate presenter sessions demonstrate that one user's action reaches another user.

| Feature | Starting data | Live proof |
|---|---|---|
| Feed | Three Verified drops with display names and verification timestamps | B reopens Feed after A verifies; A's new drop appears above the seeded history |
| Weekly rankings | Background verifications in the current Singapore week | Sara 40, Ravi 30, Mei 20; A earns 10 recycling points |
| All-time rankings | Consistent lifetime reward totals | A reaches 20 after the quest, tying Mei; contributing keeps A at 20 |
| Community challenge | Active at 90/100, backed by contributions of 20/30/40 | A contributes 10; both sessions see 100/100 AwaitingVerification |
| First badge, quest and personal impact | Fresh Presenter A with no previous activity or claims | Live verification unlocks rewards and 0.10 kg illustrative CO₂; no background users required |
| Remote bin discovery | National bin dataset plus the N4 fixture | Browse Tampines, open Google Maps, return to N4 for GPS check-in |

Use separate browser profiles/devices for A and B so their login sessions do not overwrite each other. Feed and rankings fetch on screen focus, not through a live push subscription. B navigates away and back to fetch A's new activity. Reopen Impact to fetch the updated challenge too.

Prepare background verifications shortly before rehearsal, in the current Monday–Sunday Singapore week and before A's live activity. Rebuild the scoped dataset if rehearsal crosses Monday. Otherwise the default weekly leaderboard could be empty despite populated lifetime totals. Existing unrelated users may appear; check demo records by ID/name rather than expecting exact global counts or ranks.

More seed data cannot enable posts, likes, comments or friends/following rankings because those backends are absent. Keep them outside this demo. The admin evidence/approval journey is also outside the five-minute script. The challenge finishes at AwaitingVerification, not an approved environmental outcome.

## Expected live demonstration

1. Presenter A searches for a Plastic-compatible bin. Show a second search location such as Tampines, then return to the chosen demo bin.
2. Select **Demo recycling bin — NTU N4** and check in at the lab using indoor GPS.
3. Upload `docs/demo/assets/plastic-bottle.png` and demonstrate real Gemini recognition. Submit quantity 1 and verify.
4. Show 10 points, 10 XP, the first badge and 0.10 kg illustrative carbon savings. Claim the first quest to reach 20 points/XP.
5. Contribute 10 points to the classroom challenge. The milestone reaches 100/100 and AwaitingVerification. Presenter A retains 10 available points and 20 lifetime points/XP.
6. Presenter B refreshes the feed and sees Presenter A's new verified drop beside the seeded community history. Show the leaderboard.

The challenge represents a classroom participation goal. Describe the carbon figure as an illustrative estimate. A completed point target moves to AwaitingVerification.

## Preparation and reset results

- [x] Five confirmed logins saved in an owner-readable, ignored manifest.
- [x] A/B have zero points/XP and empty activity, check-in and badge histories. Their first quest is unclaimed.
- [x] Three background feed entries, 20/30/40 points in both ranking periods, matching rewards/impact and owner-only activity access verified.
- [x] Dedicated challenge has three contributions totalling 90/100 and remains Active.
- [x] Disposable Presenter A exercised upload, synthetic finalization, quest claim and contribution. Verified 20 lifetime points, 10 available points, 20 XP and the 100/100 AwaitingVerification state visible to B.
- [x] Consumed dataset reset successfully. Hosted queries confirmed zero remaining accounts, activities, check-ins, contributions, photos and test milestones.
- [x] Repeated setup and reset passed. Fresh final Friday dataset created and validated afterward.

Weekly rankings use reward transaction timestamps. The background rewards were created on November 10, in the presentation week of November 9–15.

## Repeatable setup and reset

Run from `Lab3/CV` with the configured frontend and CV environments. The final dataset is already ready. This command checks its fresh starting state again.

```sh
export LIVE_TEST_PROJECT_REF=ihrgxedwftfzzohqpnnu
uv run --no-project --with-requirements requirements-test.txt python demo_data.py validate results/presentation-friday.json
```

To prepare a future dataset, choose a new manifest filename and use these phases in order.

```sh
uv run --no-project --with-requirements requirements-test.txt python demo_data.py accounts results/presentation-next.json
uv run --no-project --with-requirements requirements-test.txt python demo_data.py seed-sql results/presentation-next.json
# Apply the generated SQL through the team-project Supabase MCP execute_sql tool.
uv run --no-project --with-requirements requirements-test.txt python demo_data.py contribute results/presentation-next.json
uv run --no-project --with-requirements requirements-test.txt python demo_data.py validate results/presentation-next.json
```

SQL fixture management uses the project-scoped MCP access because the service key lacks milestone INSERT and contribution DELETE grants. Setup resumes using saved credentials and stable contribution request IDs. If account creation was interrupted, rerun `accounts` with the same manifest first to recover any remote creation whose response was lost.

When the current dataset has been used and needs resetting, generate cleanup SQL, apply it through the same MCP connection, then delete its accounts and photos.

```sh
uv run --no-project --with-requirements requirements-test.txt python demo_data.py reset-sql results/presentation-friday.json
# Apply the generated SQL through the team-project MCP before the next command.
uv run --no-project --with-requirements requirements-test.txt python demo_data.py reset-accounts results/presentation-friday.json
```

Create the replacement with a new manifest filename and the setup sequence above. The old manifest is retained for audit. Cleanup stops for inspection if fixture users contributed to other milestones or other users contributed to the fixture challenge. Existing N4 and national bins remain available for the next run.

## Evidence and repository delivery

Disposable reset-test run `a11b876324e04af19c96ca507285714c` passed setup twice, contributions twice, consumption of A's state, SQL cleanup twice and account cleanup twice. The consumption test used simulated N4 coordinates and synthetic trusted finalization. Real Gemini evidence is recorded separately in BACKEND_INTEGRATION.md.

Final Friday run `dc1c946e178b445da088b59c084918a4` passed all five logins, fresh presenters, background rewards/badges/impact, unclaimed quests, public feed, private activity isolation, both ranking periods and the 90/100 challenge. The private manifest records created IDs and validation time. The Python regression suite passes **34 tests**, including project/identity guards, file permissions and lost-response recovery during account creation.

The remaining repository delivery step is to review, commit and push the tooling, tests and documentation on `nick/recyclesg-integration`, then update the integration PR. Credentials and private manifests stay in ignored `results/` files. Suggested PR title is **Integrate Gemini verification and prepare the community demo**.
