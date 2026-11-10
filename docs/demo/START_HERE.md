# Five-minute demo: start here

The core journey passed against real Supabase and Gemini on 2026-10-26. Photo
suggestions were added and regression-tested afterward. That automated run used
explicitly simulated GPS. Human classroom rehearsal remains pending; this is a classroom prototype.
See [testing/evidence](TESTING.md) and [hosted setup](LIVE_SETUP.md).
The proposed presenter accounts, background community history and milestone starting state are described in [demo data](DEMO_DATA.md).

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

Use your actual location near a Plastic-compatible point, or explicitly configure
and disclose a simulated location for a classroom rehearsal. The recorded run
used **1 Beach Road**, accuracy 5 m. The sample photo is
`docs/demo/assets/plastic-bottle.png`.

## What to click and say

1. **0:00–0:40 — Find.** Say: “RecycleSG helps people find suitable recycling
   points, identify materials, and see their contribution.” Search **plastic
   bottle**, then choose the point matching your location setup.
2. **0:40–1:10 — Check in.** Click **Check in here**, then **Continue — log your
   recycling**. If using simulated GPS, say so explicitly.
3. **1:10–2:10 — Record.** Click **Add a photo** and choose
   `docs/demo/assets/plastic-bottle.png`; show the automatic **Plastic** suggestion,
   confirm or change the selection, keep quantity **1**,
   then **Log 1 plastic item · 10 points**. Wait for **+10 Eco Points**.
   Say: “The photo is checked by the real recognition service. Material matching
   is a prototype check, not proof that someone physically disposed of an item.”
4. **2:10–2:50 — Recognition.** Go to **Quests → One-off** and claim **10 Eco
   Points**. Then **You** shows one badge. Balance is now 20.
5. **2:50–4:15 — Impact.** Click **See impact and milestones**. Explain that
   **0.1 kg CO₂** is an illustrative estimate, not a measured result. Choose
   **Clean & Green Singapore → 10 → Review → Confirm contribution → Done**.
   Available points become 10; lifetime points remain 20.
6. **4:15–5:00 — Community.** Show **Feed**, then **Ranks**. Explain the intended
   impact: reduce uncertainty about where/what to recycle and encourage repeat
   participation. Milestone points are not actual financial donations.

## If something goes wrong

- Recognition slow/error: use **Retry verification** or status refresh on the
  same activity. Do not submit the same drop repeatedly.
- Wrong account balance/cooldown: sign in with a fresh prepared account for the
  exact totals below, or wait for cooldown and explain the existing balance.
  Do not toggle database verification flags.
- Internet/API outage: explain it honestly. Previously captured live screenshots
  are under `Lab3/integration/tests/artifacts/live/`; do not present screenshots
  or the mocked regression suite as a current live result.
- Server won't start: from `Lab3/CV`, run
  `uv run --no-project --with-requirements requirements.txt uvicorn app:app --host 127.0.0.1 --port 8000`;
  from `Lab3/frontend`, run `npm start -- --web --port 8081`.

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

The seed marks points Information Outdated; the physical bin’s current condition
is unverified. Recognition checks material, not quantity or physical disposal.
Milestone points are not financial donations or proof of project completion.

Keep registration/email delivery, password recovery, deletion, reporting,
admin approval/moderation, social posting, notifications and streaks outside
the completed demo scope. See [remaining work](TESTING.md#remaining-work-and-limits).

Photo source/licence: [assets/README.md](assets/README.md). Local credentials and
screenshots are under ignored `Lab3/integration/tests/artifacts/live/`; never
commit them. Live scripts and account retention are described in the testing guide.

## Human rehearsal checklist

These are checks for the presentation setup, not claims that automated tests failed.

- [ ] Record commit, date, tester, browser/device and viewport below.
- [ ] Confirm services, internet, fresh confirmed account/profile, zero points and an unclaimed first-drop quest.
- [ ] Confirm the prepared photo is under 5 MB, the point accepts Plastic, and the displayed suggestion/verification works.
- [ ] Use tested GPS within 100 m with accuracy ≤100 m; disclose simulation. An address search does not replace GPS.
- [ ] Avoid the 30-minute per-bin cooldown and 10-check-in UTC-day limit; submit within 15 minutes of check-in. A fresh account is the repeat strategy, not manual reward resets.
- [ ] Ensure an Active milestone has at least 10 points remaining.
- [ ] Check uncertain/unavailable verification and explicit retry, and ensure no endless spinner or incorrect success message.
- [ ] Check activity and contribution retries do not award/deduct twice; a retake uses the new photo.
- [ ] Return to You/Impact/Quests and confirm refreshed values.
- [ ] Complete the whole script twice on the actual laptop/network, each within five minutes.

| Sign-off field | Value |
|---|---|
| Commit / date / tester | NOT RUN |
| Browser / device / viewport | NOT RUN |
| Backend identifier (no credentials) | NOT RUN |
| CV / location mode | Real Gemini / simulated GPS planned |
| Script | Quest recommended |
| First / second timed run | NOT RUN / NOT RUN |
| Recovery checks / omitted screens | NOT RUN / none recorded |
| Human presentation sign-off | PENDING |

Mark human sign-off complete only after the walkthrough and recovery checks pass
on the actual presentation setup. Record output/screenshot/recording paths;
component tests and the earlier 20.858-second live automation do not replace it.
