# Demo handoff and alignment review

Prepared 2026-11-10 for the next teammate or agent. The goal is a five-minute classroom demonstration of finding a suitable bin, identifying recyclable material, earning rewards and contributing to a community goal.

Presentation is Friday, 13 November 2026. Nick owns preparation, validation and reset of all demo data. The presentation uses indoor GPS at N4, confirmed by Nick.

## Start here

Repository is `2006-SCS1-X2`, branch `nick/demo-data`. The team Supabase project is `ihrgxedwftfzzohqpnnu`. Confirm the checked-out branch and configured project before applying fixtures.

Read the walkthrough, dataset specification and backend contract in that order. The walkthrough is the presentation acceptance checklist. The dataset document defines setup and reset expectations. The backend document records API behaviour and dated verification evidence.

- [Walkthrough](START_HERE.md)
- [Demo dataset and delivery workflow](DEMO_DATA.md)
- [Backend/Gemini contract and evidence](BACKEND_INTEGRATION.md)

## Agreed demonstration

| Stage | Presenter action | Expected visible result |
|---|---|---|
| Existing community | Show prepared community history and challenge | Three background recyclers and an Active challenge at 90/100 |
| Discovery | Browse another address, then select the N4 demo bin | Bins around the selected area, Google Maps directions available, N4 ready for lab check-in |
| Recycling | A checks in, uploads the bottle image and verifies quantity 1 through Gemini | Plastic recognition, Verified activity, 10 points/XP, first badge and 0.10 kg illustrative CO₂ |
| Rewards | A claims the first-drop quest | 20 lifetime points, 20 available points and 20 XP |
| Shared progress | A contributes 10 to Classroom recycling challenge | 100/100 AwaitingVerification, A retains 10 available points and 20 lifetime points/XP |
| Another user | B leaves and reopens Feed and Impact | A's activity appears and the shared challenge shows its updated state |

Weekly ranks show A's 10 recycling points. All-time ranks include the quest reward and show 20. Background totals are Mei 20, Ravi 30 and Sara 40. The exact global positions depend on other users in the database.

## Current delivery state

| Item | Recorded state | Next check |
|---|---|---|
| N4 demo bin | Deployed as point 12301 at 50 Nanyang Avenue, Block N4 | Use indoor GPS at N4, confirmed by Nick |
| Backend/Gemini integration | Implemented with automated and hosted test evidence | Run a fresh complete journey using the final presentation commit |
| Community fixtures | Deployed and validated, challenge ID 6 at 90/100 Active | Reset instructions and evidence in DEMO_DATA.md |
| Presentation accounts | Five confirmed logins verified, A/B fresh | Private credentials in Lab3/CV/results/presentation-friday.json |
| Git delivery | Demo changes collected on nick/demo-data with current main merged | Review the draft PR before approval |

## Review the data and feature alignment

- [x] Confirm the three background recyclers populate Feed and both ranking periods with the specified totals.
- [x] Confirm A/B start fresh and the classroom challenge starts at 90/100.
- [ ] Confirm the live sequence produces the expected rewards, carbon estimate and shared challenge state.
- [ ] Record any required changes to the mock data or feature sequence and update the dataset and walkthrough together.

## Handoff actions

1. Review the agreed sequence and dataset against the team's intended features. Data preparation, API validation and reset testing are complete.
2. Use Presenter A/B credentials from the private local manifest. Feed and Impact refresh when revisited in separate sessions.
3. If the accounts are used before presentation, follow DEMO_DATA.md to reset the recorded run and create fresh fixtures. The reset was exercised with a photo, claimed quest and completed challenge.
4. Review and commit/push the local tooling, tests and documentation, then update the integration PR with the evidence. The team database is already populated.

## Reviewer response

| Review item | Response |
|---|---|
| Reviewer and date | Pending |
| Fits the team's intended demo and assessment requirements | Pending |
| Required changes to the sequence or data | Pending |
| Data preparation, validation and reset owner | Nick |
| Final commit and PR | Pending |
| Presentation date and location mode | Friday, 13 November 2026 / indoor GPS at N4 |
| Dataset checks | Passed 2026-11-10 through hosted APIs; reset also passed |

Readiness requires the populated dataset checks and complete walkthrough to pass on the presentation setup. Record evidence in START_HERE.md before marking the demo ready.
