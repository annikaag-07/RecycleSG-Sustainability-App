# Lab 5 demo rehearsal

The accepted backend checklist covers account deletion, password rules, finder and issue reports, admin statistics, social posting and moderation, rewards, milestone review and the in-app inbox. The [endpoint index](../../API_ENDPOINTS.md) assigns each contract to a frontend workflow. The recorded Lab 3 walkthrough covers the original recycling journey. Use the checks below for Lab 5 once the frontend is wired.

On the audited branch, 30 backend tests, 15 frontend tests, 28 CV tests and the rebuilt Expo browser suite passed (17 scenarios). The current SQL passed a separate PostgreSQL/PostgREST HTTP run, including concurrent report and milestone requests. No hosted walkthrough was possible while the project was inactive.

## Prepare the integration project

- [ ] Restore the documented Supabase project or choose an active integration project. On 11 November 2026 the project inventory returned INACTIVE, the Edge Function inventory was empty, and the migration-history read timed out.
- [ ] Publish the reviewed backend and give both frontend owners the same commit and integration URL. For the existing project, reconcile the [historical migration mapping](LIVE_SETUP.md#hosted-migration-mapping) with the actual database first. The branch contains 41 migrations, including eight after the recorded 33-migration baseline. On a fresh project, apply the full chain and load the location seed once. Replaying the full seed against the shared catalogue duplicates points.
- [ ] Deploy the delete-my-account function. Apply the eight-character letter-and-digit Auth rule. Confirm both private media buckets and the reminder schedule. The reminder is an opt-in in-app notification at 20:00 Singapore time.
- [ ] Configure Expo and the CV service against that same project. Set the frontend verification URL, server-only Gemini and Supabase credentials, and permitted frontend origin. On a phone use a reachable CV address. Test camera or file upload, location permission and venue internet on the presentation device.
- [ ] Prepare two confirmed member accounts with profiles and one admin. Use separate browser profiles or devices for different actors. A moderator-only account can also review reported content. For deletion use an additional disposable account.

## Show one complete journey

| Step | What to do on the final frontend | Observable result |
|---|---|---|
| Find and recycle | Choose a point that accepts the photo's material, check in within 100 m and submit the image within 15 minutes. If using simulated GPS, tell the audience. | The CV service verifies the item. The user's balance and reward history agree. A retry cannot award a second time. |
| Share and interact | Share the verified check-in as a public post. In a second session browse as guest, then sign in to follow, like and comment. Change visibility or block the second account. | The shared point and awarded points match the check-in. The public photo loads as a guest. A fresh request for restricted content respects the new visibility. |
| Report and review | Submit a recycling-point issue and resolve it as admin. Report a social post and review it in the moderation queue. | Each queue shows its own item. A resolved report leaves the pending list. Hidden content disappears from the feed. |
| Verify a milestone | Use the [10-point rehearsal fixture](../../Lab3/backend/PROGRESS_API.md), a contributor with 10 spendable points and progress notifications enabled, and a separate admin. Contribute, verify, then refresh the contributor's inbox. | The milestone becomes Verified, and the contributor sees one notification. A second terminal decision fails. |
| Check the rule and finder screens | Edit a reward rate using the admin screen, then check the member's estimate and the actual payout. Exercise the open-now filter with a point whose schedule covers the rehearsal time. | The UI uses server values. Unknown hours are displayed as unknown. The optional ALBA station is scheduled only on the second Sunday from 08:30 to 11:30 Singapore time. |

## Before presenting

- [ ] Run this journey with the actual Supabase Auth, Storage, Gemini and Expo build twice. Prepare a fresh milestone and a member outside the 30-minute same-point cooldown for the second run.
- [ ] Use only the disposable account for deletion. Verify it can no longer sign in, its private media is gone and its contribution remains in the milestone total.
- [ ] Record the commit, device, project, time, and any untested steps. The local browser suite exercises the original recycling flow with simulated GPS, test Auth/Storage, and fake recognition. New screens and the venue setup need the two live rehearsals above.

The broader SRS also describes nearby user suggestions, account-level abuse reports, and richer third-party profile information. Those variants are outside the agreed missing-features checklist. Treat them as explicit scope decisions if the team intends to present the full SRS.
