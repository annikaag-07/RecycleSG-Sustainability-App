# Five-minute demo: start here

Everything below was exercised against real Supabase and real Gemini on
2026-10-26. GPS is intentionally simulated. This is a classroom prototype.

## Launch

Double-click `demo.command` in the repository root. If macOS doesn't execute
it, open a terminal in the repository and run `./demo.command`.

The launcher starts the app and verification server if needed, opens a separate
Chrome window at a mobile-sized viewport, and signs in a prepared account.
GPS is set to **1 Beach Road**, accuracy 5 m. The prepared bottle photo is
`docs/demo/assets/plastic-bottle.png`. Do not use a normal browser window instead:
that window will not have the same simulated GPS or account session.

Keep the terminal running. Close the launched Chrome window when finished.
To repeat after checking in, relaunch: it creates a fresh confirmed account if
the previous one has already checked in, avoiding cooldowns and used quests.
Accounts and contributions from rehearsals are retained as demo data. No shared
database reset or key rotation is performed. Internet access remains necessary.

## What to click and say

1. **0:00–0:40 — Find.** Say: “RecycleSG helps people find suitable recycling
   points, identify materials, and see their contribution.” Search **plastic
   bottle**, then choose **1 Beach Road**.
2. **0:40–1:10 — Check in.** Click **Check in here**, then **Continue — log your
   recycling**. Say: “For this classroom demonstration, location is simulated.”
3. **1:10–2:10 — Record.** Click **Add a photo** and choose
   `docs/demo/assets/plastic-bottle.png`; select **Plastic**, keep quantity **1**,
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
- Wrong account balance/cooldown: close the demo Chrome window and relaunch
  `demo.command` for a fresh account. Do not toggle database verification flags.
- Internet/API outage: explain it honestly. Previously captured live screenshots
  are under `Lab3/integration/tests/artifacts/live/`; do not present screenshots
  or the mocked regression suite as a current live result.
- Server won't start: from `Lab3/CV`, run
  `uv run --no-project --with-requirements requirements.txt uvicorn app:app --host 127.0.0.1 --port 8000`;
  from `Lab3/frontend`, run `npm start -- --web --port 8081`.

## Verified result and limits

Live browser automated run: **20.858 seconds**, real Supabase Auth/Storage/RPC,
real Gemini, one Verified Plastic action with confidence 1.0, one badge, quest
claim and contribution. Final values: lifetime 20, available 10, XP 20. Feed and
leaderboard also passed. This is not a five-minute human rehearsal or a claim
of model accuracy on arbitrary photos. Seed point status is Information Outdated;
we have not verified that physical bin's present condition.

Photo source/licence: [assets/README.md](assets/README.md). Test and launch code:
`Lab3/integration/tests/live-demo.mjs` and `present.mjs`. Local account credentials
are generated under ignored `artifacts/live/` with owner-only file permissions;
never commit them or put service keys in browser configuration.

Only remaining sign-off: two timed human runs on the actual classroom laptop/network.
