# Community demo: posts, follows and the inbox

This is the part of the demo that shows the Lab 5 community features. It slots into the
[main script](START_HERE.md) straight after step 3, once Presenter A's drop shows
**+10 Eco Points**, and takes about four minutes. It uses the same two prepared accounts:
Presenter A and Presenter B, in separate browser profiles.

## Before the demo

- [ ] Run the frontend from a build that has the community screens: `feature/ui-2-community`,
      or `main` once PR #15 is merged. The backend for all of it is already on the live project.
- [ ] If PR #15 is merged, update the three steps in the main script listed at the end of this page.
- [ ] Give both accounts a display name (You → Edit). Without one, the inbox and posts say
      "Anonymous Recycler" and the follow step is hard to follow on screen.
- [ ] Both accounts have a verified email. Liking, commenting, following and posting need one.
- [ ] Leave notification settings at their defaults (You → Settings → Notifications: the first
      two switches on). Turning **Likes, comments and follows** off stops step 3's inbox entries.
- [ ] Have `docs/demo/assets/plastic-bottle.png` to hand. The composer needs its own photo; it
      does not reuse the drop's.
- [ ] Ask Nick to confirm his reset also clears posts, likes, comments, follows and inbox entries
      for A and B, or use fresh accounts for a second run.

## What to click and say

### 1. Share the drop (Presenter A, about 1 min)

On the reward screen that shows **+10 Eco Points**, click **Share as a post**.

**New post** opens. Click **Choose photos** and pick `plastic-bottle.png`. Type a caption,
e.g. *First bottle at N4*, and hashtags `#recyclesg #plastic`. They show as chips.

The **Link your check-in** card shows *Demo recycling bin — NTU N4*, *1 item · +10 Eco
Points*, already ticked. **Visible to** is **Public**. Click **Post**.

The new post opens with the photo, the caption, the hashtags and a **+10 pts** chip next to
the name.

Say: "Only a verified drop can be linked to a post, so the points you see on a post were
actually earned. Photos are stored privately and only shown to people allowed to see the
post."

### 2. React to it (Presenter B, about 1 min)

Switch to B's browser. Open **Feed**. It opens on **Discover**, with A's post at the top.

Click the heart to like it. Open the post, type *Nice one!* in **Add a comment…** and send
it. Click the **Follow** chip next to A's name; it changes to **Following**.

Say: "Anyone can browse Discover, even without an account. Liking, commenting and following
need a verified account."

### 3. The inbox (Presenter A, about 1 min)

Switch back to A. Open **Feed**. The bell at the top shows a red count.

Click the bell. **Inbox** lists, newest first:

- *B now follows you*
- *B commented on your post*
- *B liked your post*
- the progress from step 3 of the main script: the badge A earned and the completed quest

Click *B now follows you*. B's profile opens with their follower and following counts. Go
back and click **Mark all read**.

Say: "Everything that happens to you, social or progress, lands in one inbox, and each entry
opens what it's about. You choose which kinds you get in Settings."

### 4. Compare and progress (about 1 min)

**Presenter B:** open **Ranks**, then **Following** and **This week**. A is on the board
with 10 points, because B follows A.

Say: "Besides the global board, you can compare with just the people you follow."

**Presenter A:** open **Quests → Collection**. Under the badge count it reads *1 verified
drop so far · 1-day streak*. The **Closest** card shows the next badge with a progress bar, and **In
progress** lists the rest, for example *1 of 2 regions* for Regional Recycler. **You**
shows **Current streak: 1 day**.

Say: "Badges count verified drops, streaks of days in a row and regions of Singapore, all
worked out on the server from real recycling."

### Optional, if there is time

- **Followers only.** On A: You → Settings → Privacy → **Followers only**. A new follower now
  has to be approved: they see **Request to follow**, and A gets a **follow request** row
  at the top of the inbox with Accept and Decline. B already follows A, so this needs a
  third account to show.
- **Find people.** Feed → the search icon → type the start of a name.

## If something goes wrong

| What you see | What to do |
|---|---|
| **Post** is greyed out | Add at least one photo. Hashtags may only use letters, numbers and `_`. |
| The bell has no count after B acts | Open another tab and come back to **Feed**; the count refreshes when the feed is shown. |
| A message about verifying your email | That account's email isn't verified. Use the prepared accounts. |
| Names show as *Anonymous Recycler* | No display name set. Carry on, or set one under You → Edit beforehand. |
| A photo shows a spinner | Photos load privately one by one; give it a second. |
| B's Following board is empty | B hasn't followed A yet (step 2), or A has no points this week. |

## Changes to the main script once PR #15 is merged

1. **Step 1.** *Search by address instead* is gone; the address box shows straight away.
   Click **Change search location**, type *Tampines*, click **Search** and pick it. To go
   back: **Change search location → Use current location**.
2. **Step 3.** The button still reads **Log 1 plastic item · 10 points**, but the points come
   from the server now, so they appear a moment after choosing the material and quantity.
3. **Step 6.** **Feed** opens on **Discover** (posts). To show A's verified drop above the
   seeded history, click the **Verified drops** tab.
