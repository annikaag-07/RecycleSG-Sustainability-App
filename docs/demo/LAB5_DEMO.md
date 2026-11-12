# Lab 5 demo script (20 minutes)

Lab 5 gives each team about 20 minutes: a live demo of the working product (13–15 minutes),
then good software engineering practice and the system design (2–3 minutes), then
traceability for one use case (2–3 minutes). This script fills all three.

The live demo uses four browser windows, one per kind of user: a **guest**, two members
(**Presenter A** and **Presenter B**) and an **administrator**, who is also a moderator. One
presenter can drive all four, or teammates can each take a window. The story runs end to end:
A recycles a bottle, shares it, B reacts, A gives points to a community milestone, and the
administrator verifies it, which lands back in A's inbox.

It builds on the [main script](START_HERE.md) and the [community part](COMMUNITY.md), in
one order, with the admin side added. Run it on web at N4 with indoor GPS, as in the main
script.

| Time | Part | Who | Use cases |
|---|---|---|---|
| 0:00 | Use case overview | Slides | — |
| 1:00 | 1. Look around without an account | Guest | 2.1, 2.2, L3-5.1 |
| 2:30 | 2. Find a bin, check in and recycle | A | 2.1, 3.1, 3.2, L3-3.2a, L3-3.2b |
| 5:30 | 3. Share it and react | A, B | posts, follows (Lab 5) |
| 8:00 | 4. Inbox, quests and badges | A | 4.1, L3-4.2, inbox (Lab 5) |
| 9:00 | 5. Give points to a milestone | A | L3-4.5, 3.3 |
| 10:00 | 6. Report a problem | A, B | reports (Lab 5) |
| 11:00 | 7. Administrator and moderator | Admin | 7.1, admin tools (Lab 5) |
| 13:30 | 8. Close the loop | A, B | 4.2 |
| 14:30 | Design and good practice | Slides | — |
| 17:00 | Traceability: UC 3.2 | Slides, IDE | 3.2 |
| 19:30 | Wrap-up | — | — |

Use case IDs are from the Lab 3 use case document. Match them to the final Lab 5 use case
model, which also numbers the features marked "Lab 5".

## Before the demo

- [ ] Run a build with every Lab 5 screen: `main` after PR #15 is merged, or
      `feature/ui-2-community`, which already includes main.
- [ ] Rehearse the whole run twice with the prepared accounts ([rehearsal checklist](LAB5_REHEARSAL.md)).
      Lab 5 expects the product to work perfectly, so leave out anything that fails in rehearsal.
- [ ] Four browser windows: a private window for the guest, and separate browser profiles
      for A, B and the admin. Sign A, B and the admin in beforehand.
- [ ] Nick prepares and resets the data (see [demo data](DEMO_DATA.md)), plus for this script:
  - an admin account (a separate account, not A or B)
  - one off-topic post from a background account for B to report, e.g. *Selling concert
    tickets, DM me*
  - no reward rates or seasonal events set, so a Plastic item earns 10 points and 10 XP
  - the reset also clears posts, likes, comments, follows, inbox entries, point reports and
    moderation decisions, and puts the Classroom recycling challenge back to Active at 90/100
- [ ] A and B have a display name (You → Edit) and a verified email.
- [ ] A's notification settings are at their defaults (You → Settings → Notifications: first
      two switches on).
- [ ] `docs/demo/assets/plastic-bottle.png` is to hand.
- [ ] Slides for the use case diagram, the system architecture and the UC 3.2 trace, and the
      IDE open on the files listed in the traceability part.

## Use case overview (1:00)

Show the use case diagram. Say: "RecycleSG helps people in Singapore find the right recycling
point, proves their recycling with GPS and a photo, rewards it, and turns it into community
action. There are three kinds of user. A **guest** can find bins and read the community. A
**registered user** checks in, logs recycling, earns points, badges and levels, posts, follows
and gives points to milestones. An **administrator** verifies milestones, reviews reports,
moderates posts, manages bins and sets the game rules. Outside systems are OneMap for the map
and address search, Google Maps for directions, and Gemini behind our photo-recognition
service. We'll show each kind of user now."

## 1. Look around without an account (Guest, 1:30)

In the private window, on **Log in**, click **Browse as guest**.

- **Find** shows recycling points near N4 on the map. Click the **Demo recycling bin — NTU N4**
  card's **Details**: address, accepted materials, hours and status.
- Tap **Open now**. The server keeps only points whose published hours cover the current
  time. The N4 bin has no published hours, so none nearby can be confirmed open. Tap
  **Show all**.
- Open **Feed**. **Discover** shows public posts; open one to show its photos.
- Click the heart. The guest is taken to **Log in**.

Say: "Anyone can find a bin and read the community without signing up. Earning points,
posting and reacting need a verified account, so rewards can't be farmed anonymously."

## 2. Find a bin, check in and recycle (Presenter A, 3:00)

Switch to A. On **Find**, click **Change search location**, type *Tampines*, click
**Search** and pick it. The map moves there. Click **Change search location → Use current
location** to come back to N4.

Say: "You can search around any address, but check-in always uses your real GPS location."

Open **Demo recycling bin — NTU N4**, click **Check in here**, then **Continue — log your
recycling**.

Say: "Check-in only works within 100 metres of the bin. There's also a cooldown per bin and a
daily limit, so points can't be farmed."

Click **Add a photo** and choose `plastic-bottle.png`. The photo is checked and **Plastic**
is suggested. Keep quantity **1**. The button changes to **Log 1 plastic item · 10 points** a
moment later. Click it and wait for **+10 Eco Points**.

Say: "The photo goes to our recognition service, which uses Gemini. If it isn't confident, the
member picks the material. The points on the button come from the server, using the same rules
as the payout, so the estimate and the reward always agree. Rates are set by the
administrator; we'll see that later."

## 3. Share it and react (A and B, 2:30)

**A:** on the reward screen click **Share as a post**. Click **Choose photos**, pick
`plastic-bottle.png`, type *First bottle at N4* and the hashtags `#recyclesg #plastic`. The
**Link your check-in** card is ticked. **Visible to: Public**. Click **Post**. The post opens
with a **+10 pts** chip.

Say: "Only a verified drop can be linked to a post, so the points on a post were really
earned. Photos are stored privately and only shown to people allowed to see the post."

**B:** open **Feed**. A's post is at the top of **Discover**. Like it, open it, comment *Nice
one!*, and click **Follow** next to A's name.

## 4. Inbox, quests and badges (Presenter A, 1:00)

**A:** open **Feed**. The bell shows a red count. Click it. **Inbox** lists *B now follows
you*, *B commented on your post*, *B liked your post*, and the badge and quest A earned.
Click **Mark all read**.

Open **Quests → One-off** and click **Claim** on the first-drop quest (10 Eco Points). Then **Quests → Collection**:
the next badge with its progress bar, e.g. *1 of 2 regions*.

Say: "Badges count verified drops, days in a row and regions of Singapore, all worked out on
the server. Social and progress news land in one inbox, and you choose what you get in
Settings."

## 5. Give points to a milestone (Presenter A, 1:00)

**A:** open **You**. Lifetime and available points are both 20. Click **See impact and
milestones**. Say: "0.1 kg of CO₂ is an illustrative estimate, not a measurement."

Choose **Classroom recycling challenge**, pick **10**, click **Review contribution**, then
**Confirm contribution**. It goes from 90/100 to 100/100 and **Awaiting verification**.
Available points drop to 10; lifetime stays 20.

Say: "Members pool points towards real community projects. When a target is reached, an
administrator checks the organisation's evidence before it counts."

## 6. Report a problem (A and B, 1:00)

**A:** go to **Find**, open **Demo recycling bin — NTU N4**, and click the flag icon. Choose
**Bin is full**, type *Overflowing after lunch*, click **Send report**.

**B:** open **Feed → Discover**, open the off-topic post Nick prepared, click the flag
(**Report post**), choose **Not about recycling**, click **Send report**.

Say: "Members keep the map and the community accurate. Each report goes to a different
queue."

## 7. Administrator and moderator (Admin, 2:30)

Switch to the admin. Open **You**. The **Administrator tools** card only appears for staff.

1. **Verify environmental milestones.** Open **Classroom recycling challenge**, show the
   evidence card, click **Verify outcome → Confirm verification**.
2. **Point reports.** A's *Bin is full* report for N4 is there. Type a note, e.g. *Collection
   booked*, and click **Resolve**. It leaves the list.
3. **Moderation queue.** The reported post shows its reason. Click **Review**, choose **Hide**
   and **No action**, click **Apply**, then **Confirm**.
4. **Game rules.** Show **Rewards per item**, quests, badges and seasonal events. Don't save
   anything here during the demo.
5. **Usage statistics.** Pick **Last 7 days**: active users, verified actions, most-used
   points and items by material.

Say: "Staff run the whole system from the app: milestones, bin reports, moderation, game rules
and usage. The server checks the role on every action, not just the screen, so a member
can't call these even directly."

## 8. Close the loop (A and B, 1:00)

**A:** open **Feed**, then the bell. The newest entry: *Classroom recycling challenge was
verified. Thanks for helping.*

**B:** open **Feed → Discover**. The off-topic post has gone. Open **Ranks → Following →
This week**: A is on the board because B follows A.

## Design and good practice (2:30)

Show the system architecture slide.

**The design.** Say: "The app is one Expo codebase that runs on the web, iPhone and Android.
Screens never talk to the database directly: they go through one typed API layer. Behind it,
Supabase gives us Postgres, sign-in and private photo storage. Every rule that awards points or
changes someone else's data is a server function, protected by row-level security. Our own
recognition service, in Python, checks photos with Gemini. Secret keys stay on the servers,
never in the app."

**Good practice.** Say:

- "We kept boundary, control and entity classes apart, as in our class diagrams, so a screen
  can change without touching the rules."
- "The rules live in one place, on the server. The estimate a member sees and the reward they
  get come from the same rules, and a retried request never pays twice."
- "Work went through feature branches and pull requests. Database changes are versioned
  migrations, so any copy of the system can be rebuilt from the repository."
- "We test at every level: automated tests for the app, the database and the recognition
  service, plus black-box and basis-path test cases, which we'll show in a moment."

**Future upgrades.** Say: "This design makes the next steps cheap":

- "New materials, reward rates, quests, badges and seasonal events are set by staff in the
  app. No new release needed."
- "The recognition model is one setting. A better model, or a different provider behind the
  same two endpoints, needs no change in the app."
- "New kinds of notification plug into the same inbox and the same settings."
- "Native iPhone and Android builds come from the same code; today it already runs in Expo
  Go."

## Traceability: UC 3.2, Log a recycling action and collect rewards (2:30)

Walk one use case from requirement to test. Show each step on a slide, or open it in the IDE.

1. **Use case.** UC 3.2: after checking in (UC 3.1), the member adds a photo, the material is
   suggested (L3-3.2b), they log the item, the photo is verified (L3-3.2a) and the reward is
   shown.
2. **Classes.** In the class diagram: `RegisteredUser.submitRecyclingActivity()` creates a
   `RecyclingActivity` at a `RecyclingPoint`, linked to a `CheckIn`
   (`validateLocation()`, `checkCooldown()`). `CVVerificationService.verifyItem()` checks the
   photo, and a verified activity creates a `RewardTransaction`.
3. **Dialog map.** `CheckInUI → LogRecyclingUI → RewardUI`.
4. **Code.**
   - screens: `Lab3/frontend/src/screens/earn/CheckInUI.tsx`, `LogRecyclingUI.tsx`, `RewardUI.tsx`
   - API layer: `Lab3/frontend/src/shared/api/checkins.ts`, `verification.ts`, `progress.ts`
   - server functions: `submit_recycling_activity`, `finalize_recycling_activity`,
     `estimate_recycling_reward`
   - recognition service: `/classify` and `/verify` in `Lab3/CV/app.py`
5. **Tests** (Lab 4 test report):
   - **BB-01 to BB-03:** black-box tests on quantity, with equivalence classes and boundary
     values around 1 and 100
   - **CV-01 to CV-05:** basis paths through photo classification
   - **DB-01 to DB-06:** basis paths through `finalize_recycling_activity`
6. **Design choice.** Say: "The activity is saved as Pending first and only paid once the
   photo is verified, so a failed or repeated request can't create points."

## Wrap-up (0:30)

Say: "Finding the right bin, proving the recycling, rewarding it, and turning it into verified
community impact, for guests, members and staff, on a design that's tested and easy to extend.
Thank you."

## Features that set us apart

Bring these up in the demo, or use them to fill time or answer questions:

- **Proof, not trust.** GPS within 100 m, a 15-minute window from check-in, a per-bin
  cooldown, a daily limit and photo recognition.
- **Configurable game.** Staff change rewards, quests, badges and seasonal bonuses without a
  new release, and members always see the real numbers.
- **Community with real impact.** Posts can only link verified drops, and milestones are
  verified with evidence before they count.
- **Privacy.** Followers-only accounts, follow requests and blocking. Post photos are stored
  privately, and the server checks each viewer may see the post before sending a photo.
- **Works when the signal drops.** The last nearby points are cached for offline use.

## If something goes wrong

| What you see | What to do |
|---|---|
| Check-in says you're too far | Indoor GPS drifts. Move closer to a window. If it still fails, set the browser's location to the N4 pin (1.346177, 103.682161) in DevTools → Sensors, and tell the audience it's simulated. |
| The photo isn't recognised | Choose **Plastic** by hand; the demo carries on. |
| The points on the log button don't appear | Wait a second; they come from the server. The log still works without them. |
| **Post** is greyed out | Add a photo. Hashtags only use letters, numbers and `_`. |
| The bell has no count | Open another tab and come back to **Feed**. |
| *Anonymous Recycler* instead of a name | No display name set. Carry on. |
| No **Administrator tools** card | That account isn't an admin. Sign in to the prepared admin account. |
| The milestone isn't in the admin's list | A hasn't contributed yet, or it was reset. Click **Back** and open it again. |
| **XP per level** shows an error when saved | Known server bug, not fixed yet. Don't change it in the demo. |
| Anything else stalls | Say what should happen and move on to the next part. |
