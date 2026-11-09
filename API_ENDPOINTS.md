# RecycleSG Backend API Reference (for frontend)

Maintained API reference, updated 2026-10-28. Source of truth: `Lab3/backend/supabase/migrations/*.sql`,
`Lab3/CV/app.py` and `Lab3/CV/verification.py`. Setup and evidence are linked from [Lab 3](Lab3/README.md).

## How the backend works

Application data and accounting use **Supabase**; photo recognition and trusted verification run in the
**FastAPI CV service**. There is no separate Express server. Supabase provides:

- **Supabase Auth** for sign-up / log-in / sessions (`/auth/v1/...`)
- **PostgREST** auto-generated REST API over Postgres tables (`/rest/v1/<table>`)
- **RPC functions** written in SQL/PL-pgSQL (`/rest/v1/rpc/<function>`)
- **Row Level Security (RLS)** decides what each user can read/write

The frontend should call it through `@supabase/supabase-js` rather than raw HTTP:

```js
const { data, error } = await supabase.rpc("search_nearby_recycling_points", { ... });
const { data, error } = await supabase.from("material_types").select("*");
```

**Base URL**: local `http://127.0.0.1:54321`, or the hosted project URL (ask the backend owner).
**Every Supabase API request** needs the `apikey: <anon/publishable key>` header. Authenticated requests also need
`Authorization: Bearer <access_token>` (supabase-js adds both automatically once signed in).
Never put the service-role key in the app.

**Errors**: RPCs raise Postgres exceptions. PostgREST returns HTTP 400 with
`{ "code": "P0001", "message": "Too far from recycling point", ... }`. Show `error.message` to the user.

Legend — **Auth**: `Public` = anon key only; `User` = signed-in user; `—` = not callable by clients.

---

## 1. Auth

Provided by Supabase Auth (not custom code). A DB trigger (`handle_new_user`) creates a `profiles` row on sign-up
with `username = 'user_<uuid-without-dashes>'` and `display_name` from sign-up metadata.

| Method & URL | What it does | Request | Example response | Auth |
|---|---|---|---|---|
| `POST /auth/v1/signup` · `supabase.auth.signUp()` | Register with email + password | `{ "email": "a@e.ntu.edu.sg", "password": "********", "data": { "display_name": "Jia Hui" } }` | `{ "user": { "id": "uuid", "email": "..." }, "session": {...} \| null }` | Public |
| `POST /auth/v1/token?grant_type=password` · `signInWithPassword()` | Log in | `{ "email", "password" }` | `{ "access_token", "refresh_token", "expires_in": 3600, "user": {...} }` | Public |
| `POST /auth/v1/recover` · `resetPasswordForEmail()` | Send password-reset email | `{ "email" }` | `{}` | Public |
| `PUT /auth/v1/user` · `updateUser()` | Set new password (after reset link) | `{ "password" }` | `{ "id", "email", ... }` | User |
| `POST /auth/v1/resend` · `auth.resend()` | Resend verification email | `{ "type": "signup", "email" }` | `{}` | Public |
| `POST /auth/v1/logout` · `signOut()` | End session | — | `204` | User |
| `GET /auth/v1/user` · `getUser()` | Current user | — | `{ "id", "email", "email_confirmed_at", ... }` | User |

Notes:
- Local config has `auth.email.enable_confirmations = false`, so locally sign-up returns a session immediately
  (no verification step). The hosted project's setting is unknown — check with backend owner.
- Password rule in config: `minimum_password_length = 6` by default; the SRS wants 8 + alphanumeric. Enforce in the UI.
- **Singpass / SSO: not configured.**
- **Account deletion: no endpoint.** Clients cannot delete `auth.users`; needs a server-side function.

### Profiles (`profiles` table)

| Method & URL | What it does | Request | Example response | Auth |
|---|---|---|---|---|
| `GET /rest/v1/profiles?id=eq.<uid>&select=*` · `from("profiles").select("*").eq("id", uid).single()` | Read **own** profile (RLS: own row only) | — | `{ "id": "uuid", "username": "user_ab12...", "display_name": "Jia Hui", "avatar_url": null, "bio": null, "eco_points": 120, "available_eco_points": 120, "xp": 120, "level": 2, "created_at": "2026-10-14T..." }` | User |
| `PATCH /rest/v1/profiles?id=eq.<uid>` · `.update({...}).eq("id", uid)` | Edit own profile. Only `username`, `display_name`, `avatar_url`, `bio` are writable | `{ "display_name": "JH", "bio": "Recycling in AMK" }` | `204` (or row with `Prefer: return=representation`) | User |

`eco_points` = lifetime total, `available_eco_points` = spendable balance (separate, per SRS). Users cannot write them.

---

## 2. Recycling points & search

| Method & URL | What it does | Request | Example response | Auth |
|---|---|---|---|---|
| `POST /rest/v1/rpc/search_nearby_recycling_points` | Points within radius, nearest first (straight-line Haversine) | `{ "p_latitude": 1.3483, "p_longitude": 103.6831, "p_radius_km": 1, "p_limit": 20 }` — radius default 5, limit default 20, max 100 | `[{ "id": 1, "name": "Recycling Bins in HDB Estates", "address": "409A ANG MO KIO AVE 10, Singapore 561409", "latitude": 1.35, "longitude": 103.68, "status": "Information Outdated", "distance_km": 0.08 }]` | Public |
| `POST /rest/v1/rpc/search_recycling_points_by_material` | All points accepting a material name (case-insensitive), **sorted by address, not distance** | `{ "p_material": "Plastic" }` · paginate with `?limit=20&offset=0` or `.range(0,19)` | `[{ "id": 2807, "name": "...", "address": "1 BEACH ROAD, ...", "latitude": 1.3036, "longitude": 103.8644, "status": "Information Outdated" }]` | Public |
| `GET /rest/v1/recycling_points?id=eq.<id>&select=*,recycling_point_materials(material_types(id,name))` | Full detail for one point incl. accepted materials and `operating_hours`, `source`, `last_updated` | — | `{ "id": 1, "name": "...", "address": "...", "latitude": ..., "longitude": ..., "operating_hours": null, "status": "Information Outdated", "source": "NEA Recycling Bins", "last_updated": "...", "recycling_point_materials": [{ "material_types": { "id": 1, "name": "Plastic" } }] }` | Public |
| `GET /rest/v1/material_types?select=*` | List material categories (use for filter chips and to get IDs for submissions) | — | `[{ "id": 1, "name": "Plastic", "description": "Plastic bottles, ..." }, ...]` (9 rows: Plastic, Paper, Cardboard, Glass, Metal, Batteries, E-Waste, Clothing, Lighting Waste) | Public |
| `GET /rest/v1/recycling_point_materials?recycling_point_id=eq.<id>` | Raw point↔material links | — | `[{ "recycling_point_id": 1, "material_type_id": 1 }]` | Public |

Notes:
- `status` is one of `Available, Full, Temporarily Closed, Inaccessible, Removed, Information Outdated`. The NEA import sets **every** point to `Information Outdated` and `operating_hours` to empty.
- The repository seed links only Plastic, Paper, Glass and Metal (NEA blue bins); Cardboard, E-Waste, Batteries, Clothing and Lighting Waste have no seed links. Retrieve material IDs from the database; never assume fixed IDs.
- No combined "nearby + material" search. The app filters nearby results client-side; limiting before filtering can miss suitable points. Paginate material-only search rather than downloading the whole catalogue.
- **Favourites: no table/endpoint.**
- **Report an issue: no table/endpoint.**
- **Directions/routing: not in backend** — the current app hands off to Google Maps; in-app OneMap routing would require a routing token.

---

## 3. Check-in & recycling actions

| Method & URL | What it does | Request | Example response | Auth |
|---|---|---|---|---|
| `POST /rest/v1/rpc/create_gps_checkin` | GPS-distance-checked check-in; returns new check-in ID | `{ "p_recycling_point_id": 1, "p_latitude": 1.3483, "p_longitude": 103.6831 }` | `17` | User |
| `POST /rest/v1/rpc/submit_recycling_activity` | Log a recycling action against a check-in; status starts `Pending`; returns action ID | `{ "p_check_in_id": 17, "p_material_type_id": 1, "p_quantity": 4, "p_photo_url": "<auth uid>/check-in-17-material-1-<request-id>.jpg" }` — `p_photo_url` optional | `42` | User |
| `GET /rest/v1/check_ins?select=*&order=checked_in_at.desc` | Own check-in history (RLS own rows) | — | `[{ "id": 17, "user_id": "uuid", "recycling_point_id": 1, "latitude": ..., "longitude": ..., "distance_meters": 12.4, "checked_in_at": "..." }]` | User |
| `GET /rest/v1/recycling_actions?select=*,material_types(name)&order=created_at.desc` | Own recycling actions and their verification status | — | `[{ "id": 42, "check_in_id": 17, "material_type_id": 1, "quantity": 4, "photo_url": null, "cv_predicted_material": null, "cv_confidence": null, "verification_status": "Pending", "created_at": "...", "verified_at": null }]` | User |

Check-in rules (enforced server-side): within **100 m**; **30-min** cooldown per point; max **10 check-ins per UTC day**.
Device GPS can be spoofed; distance checks do not independently prove physical presence.
Errors: `Authentication required`, `Invalid GPS coordinates`, `Recycling point not found`, `Too far from recycling point`,
`Check-in cooldown active. Try again after 30 minutes.`, `Daily check-in limit reached.`

Submission rules: check-in must be yours and ≤ **15 min** old; point must accept the material; quantity 1–100;
one action per material per check-in. Errors: `Quantity must be between 1 and 100`,
`Check-in not found or not owned by user`, `Check-in has expired`, `Material not accepted at recycling point`,
`Activity already submitted for this material`, and for the photo `Invalid photo storage path` (not in your own folder,
or contains `..`) and `Recycling photo not found` (not uploaded yet).

**Photos** — private Storage bucket `recycling-photos` (JPEG, PNG or WebP, max 5 MB). A signed-in user can upload to,
and read from, their own folder only: `supabase.storage.from("recycling-photos").upload("<auth uid>/<file>", bytes)`.
No overwriting (there's no update policy).

Notes:
- **Photo linking**: LogRecyclingUI uploads to `<auth uid>/check-in-<check_in_id>-material-<material_type_id>-<request-id>.<jpg|png|webp>`
  first, then passes that storage path (not a signed URL) as `p_photo_url`; the server stores it in `recycling_actions.photo_url`.
- Each upload attempt gets a fresh path; collisions are errors, not reuse of previous bytes. Failed submissions can leave unused objects; cleanup is deferred.
- The app requires a photo even though the submission RPC permits an omitted path. Verification requires a valid owned stored photo.
- Submission response loss may mean the write succeeded. The app checks for the existing activity before retrying; verification retries reuse its ID.

---

## Photo recognition and verification

These routes are on `EXPO_PUBLIC_VERIFICATION_URL` (locally `http://127.0.0.1:8000`), not the Supabase URL.
Configure server-only Supabase/Gemini credentials and explicit `FRONTEND_ORIGINS`; see [CV setup](Lab3/CV/README.md).

| Route | Request / access | Result |
|---|---|---|
| `GET /health` | Public | Service health response |
| `POST /classify` | Public multipart `file`; JPEG/PNG/WebP, non-empty, up to 8 MB (app/storage limit is 5 MB) | `status: ok/unsure/unavailable`, `material`, `suggestion`, `confidence`, `reason`, `model`, `latency_ms`; raw provider errors are not exposed |
| `POST /verify` | User bearer token; JSON `{ "activity_id": 42 }` with positive ID | `{ "activity_id": 42, "status": "Verified", "material": "plastic", "confidence": 0.9, "message": "...", "activity_impact": {"estimated_co2_saved_kg": 0.1, "is_estimate": true, "basis": "illustrative_per_item_v1"} }`; status can also be Pending or Rejected |

Classification preselects only a confident material accepted by the point and not already logged. Manual choices are preserved, retakes cancel stale requests, and uncertainty/outage leaves manual selection available. The 20-second suggestion timeout never creates an activity or awards points. Client recognition is not trusted for rewards.

Verification authenticates the token, loads the caller's owned activity, validates its photo path, downloads the private image and runs recognition again. A confident case-insensitive material match finalizes **Verified**; a confident mismatch finalizes **Rejected**; uncertain/unavailable inference leaves **Pending**. Missing/foreign activities are hidden as 404; invalid stored photos return 422, missing/invalid auth 401, service/configuration failures 502/503, and invalid request bodies 422. Terminal retries return the recorded outcome without reclassifying.

The service calls `finalize_recycling_activity(p_activity_id bigint, p_user_id uuid, p_status text, p_predicted_material text, p_confidence double precision)`, returning the activity row as a set. Only `service_role` can execute it. The function locks the owned row, validates confidence/status/material, writes the terminal status and timestamp, and returns existing terminal results unchanged. Existing database triggers award points, quests and badges; clients cannot set verification or balances directly.

The UI waits up to 25 seconds for verification, then reconciles by refresh/retry. Supabase and Gemini HTTP requests have 15-second per-request timeouts. Gemini makes one attempt (including SDK retries); rate limits return unavailable. Multiple sequential Supabase calls can still exceed the UI wait. There is no background queue or global server-job cancellation. Never manually toggle terminal states to reset rewards.

`activity_impact` is the persisted activity's estimate, not the user's aggregate. Verified quantity × 0.1 kg; Pending/Rejected = zero. Never add repeated response values to a total; fetch `get_user_environmental_impact` instead. Gemini supplies material recognition, not item weight or carbon factors. See [backend handoff](docs/demo/BACKEND_INTEGRATION.md).

This is a material-match prototype: it does not validate quantity or physical disposal. Manual selection does not bypass verification. Rejected activities remain subject to one-material-per-check-in and cooldown rules.

---

## 4. Rewards / quests / badges

| Method & URL | What it does | Request | Example response | Auth |
|---|---|---|---|---|
| `GET /rest/v1/reward_transactions?select=*&order=created_at.desc` | Own reward history: one row per verified activity **or** per claimed quest | — | `[{ "id": 3, "user_id": "uuid", "recycling_action_id": 42, "quest_progress_id": null, "eco_points_earned": 40, "xp_earned": 40, "created_at": "..." }]` — quest rows have `recycling_action_id: null` and `quest_progress_id` set | User |
| `POST /rest/v1/rpc/get_user_environmental_impact` | Own impact stats (verified actions only). `p_user_id` must equal your own ID, otherwise all zeros | `{ "p_user_id": "<auth uid>" }` | `[{ "total_verified_actions": 3, "total_recycled_units": 12, "estimated_co2_saved_kg": 1.20, "tree_equivalents": 0.060 }]` | User |
| — (DB trigger `award_verified_recycling`) | When an action becomes `Verified`: +10 Eco Points and +10 XP per unit, `level = 1 + xp/100` | — | — | — |
| `GET /rest/v1/quests?select=*` | Active quests | — | `[{ "id": 1, "title": "Daily Recycler", "description": "Verify 2 recycling activities today", "quest_type": "daily", "target_actions": 2, "reward_eco_points": 20, "reward_xp": 20, "is_active": true, "created_at": "..." }]` — `quest_type` ∈ `daily`, `weekly`, `one_time` | Public |
| `GET /rest/v1/user_quest_progress?select=*&period_start=in.(2026-10-24,2026-10-19,1970-01-01)` | Own quest progress | — | `[{ "id": 1, "user_id": "uuid", "quest_id": 1, "period_start": "2026-10-24", "progress": 1, "completed_at": null, "claimed_at": null }]` | User |
| `POST /rest/v1/rpc/claim_quest_reward` | Credit a completed quest's reward (once) | `{ "p_quest_id": 1, "p_period_start": "2026-10-24" }` | `[{ "eco_points_awarded": 20, "xp_awarded": 20, "new_balance": 70, "new_level": 1 }]` | User |
| `GET /rest/v1/badges?select=*` | Badge definitions | — | `[{ "id": 1, "name": "First Step", "description": "...", "required_verified_actions": 1, "created_at": "..." }]` (thresholds 1, 10, 50, 100) | Public |
| `GET /rest/v1/user_badges?select=*` | Own earned badges | — | `[{ "user_id": "uuid", "badge_id": 1, "earned_at": "..." }]` | User |
| — (DB triggers `track_verified_quest_progress`, `award_recycling_badges`) | When an action becomes `Verified`: +1 progress on every active quest for the current period, and any badge whose threshold the user's verified-activity count has reached | — | — | — |

Level/XP/points: read from `profiles`. Quest and badge progress counts **verified activities** (one per material per check-in),
not items. Quest periods follow Singapore time: a day starts at 00:00, a week on Monday 00:00; one-time quests use
`period_start = 1970-01-01`. Claim errors: `Quest progress not found`, `Quest not completed`, `Reward already claimed`.
Claiming adds to `eco_points`, `available_eco_points` and `xp` and writes a `reward_transactions` row. **No streaks.**
Impact uses illustrative factors: 0.1 kg CO₂ per unit and one tree equivalent per 20 kg CO₂; no measured saving or actual planting is established.

---

## 5. Leaderboard

| Method & URL | What it does | Request | Example response | Auth |
|---|---|---|---|---|
| `POST /rest/v1/rpc/get_leaderboard` | Everyone by lifetime `eco_points`, highest first | `{ "p_limit": 50 }` — default 10, max 100 | `[{ "rank": 1, "username": "user_cb08...", "display_name": "Alex Tan", "level": 2, "eco_points": 120 }]` | Public |
| `POST /rest/v1/rpc/get_weekly_leaderboard` | Eco Points from recycling verified since Monday 00:00 Singapore time (quest rewards not counted), highest first | `{ "p_limit": 50 }` — default 10, max 100 | same columns; `eco_points` is the weekly total | Public |

Both use `RANK()`, so equal totals share a rank, and leave out people with 0 points. **No friends scope** (there's no
follows table), and no flag for the caller's own row (the app matches on `username` from the caller's profile).

---

## 6. Environmental milestones

| Method & URL | What it does | Request | Example response | Auth |
|---|---|---|---|---|
| `POST /rest/v1/rpc/list_milestones` | Every milestone, newest first (no evidence or admin fields) | — | `[{ "id": 1, "name": "Plant 20 trees in Ang Mo Kio", "description": "..." \| null, "organisation": "...", "target_points": 500, "current_points": 430, "expected_outcome": "..." \| null, "closing_date": "..." \| null, "status": "Active" }]` — `status` ∈ `Active`, `AwaitingVerification`, `Verified`, `Rejected` | Public |
| `POST /rest/v1/rpc/contribute_to_milestone` | Spend available Eco Points on a milestone | `{ "p_milestone_id": 1, "p_amount": 50, "p_client_request_id": "<uuid>" }` | `[{ "accepted_amount": 50, "available_eco_points": 70, "current_points": 480, "status": "Active" }]` | User (verified email) |
| `POST /rest/v1/rpc/list_my_milestone_contributions` | Own contributions to every milestone, newest first | — | `[{ "id": 1, "milestone_id": 1, "milestone_name": "...", "amount": 50, "created_at": "..." }]` | User |

`contribute_to_milestone` takes only what the target still needs and deducts `available_eco_points`, never `eco_points`.
Reaching the target sets `AwaitingVerification`. It's idempotent on `p_client_request_id`: the same ID and amount returns the
first result, a different amount with the same ID is refused. Errors: `Contribution amount must be positive`,
`Request ID is required`, `Verified account required`, `Insufficient Eco Points`, `Milestone not found`,
`Milestone unavailable` (not `Active` or past `closing_date`), `Milestone target reached`,
`Request ID already used for a different contribution`. Three demo milestones are seeded (`seed_demo_milestones`).

---

## 7. Social feed

| Method & URL | What it does | Request | Example response | Auth |
|---|---|---|---|---|
| `POST /rest/v1/rpc/get_community_feed` | Latest verified recycling activities, newest first | `{ "p_limit": 20 }` — default 20, max 100, no offset | `[{ "activity_id": 4, "username": "Anonymous Recycler", "display_name": "Alex Tan", "material": "Plastic", "quantity": 4, "recycled_at": "..." }]` | Public |

Every verified activity is listed. `username` is always `Anonymous Recycler`; `display_name` is the recycler's (trimmed), or
`Anonymous Recycler` when it's empty or unset. **No posts, comments, likes,
follows, hashtags, blocks or notifications tables**, so PostDetailUI and PostComposerUI have nothing to call.

---

## 8. Admin

Admins are rows in the `app_admins` table (service role only); `is_app_admin()` checks the caller.
`admin_list_milestones_for_review()` is live (section below). The app's admin screens are shown from
`app_metadata.role = 'admin'` instead, so for now an admin needs both. Milestone decisions, recycling-point edits, report
review, gamification config and moderation have no API.

---

## Proposed endpoints (frontend is already wired to these)

These contracts are called through `src/shared/api/proposed.ts`. **Only the admin milestone-list RPC below
is implemented**; the others are proposals. Missing functions return `PGRST202`, which the app presents as
"not available on the server yet". Implementing the proposed signatures still requires end-to-end validation,
authorisation and any necessary UI/data-flow changes.

**Admin role.** The UI reads server-controlled app metadata; current SQL uses `app_admins`.
Reconcile these before completing admin workflows. UI gating is not authorisation: each admin RPC must
enforce the chosen server policy (NFR-SEC-09).

| RPC | Args | Returns | Used by | Notes |
|---|---|---|---|---|
| `submit_point_report` | `p_recycling_point_id bigint, p_category text, p_description text, p_client_request_id uuid` | `bigint` report id | ReportIssueUI | `p_category` ∈ `full`, `missing_or_damaged`, `wrong_info`, `contaminated`. **Idempotent on `p_client_request_id`** — the app retries queued reports with the same id (NFR-QUAL-06). Status starts `Pending`; must not change what other users see (UC 2.3). Authenticated + verified users only. |
| `delete_my_account` | — | `void` | SettingsUI | REQ-1.7. Requires a trusted deletion workflow, photo cleanup and a retention/anonymisation policy: milestone contributions currently restrict user deletion, so deleting Auth alone is insufficient. |
| `admin_list_milestones_for_review` | — | rows: `id, name, description, organisation, target_points, current_points, expected_outcome, closing_date, status, evidence_url, evidence_notes, evidence_requested_note, decided_at, decision_reason` | MilestoneVerificationUI | **Live** at `3eb5cdd`. Returns `AwaitingVerification`, `Verified` and `Rejected` milestones. Admin = row in `app_admins`. |
| `admin_decide_milestone` | `p_milestone_id bigint, p_decision text, p_reason text, p_expected_status text` | new `status` text | MilestoneVerificationUI | `p_decision` ∈ `verify`, `reject` (reason required), `request_evidence` (note required; stays `AwaitingVerification`). Refuse if current status ≠ `p_expected_status` so two admins can't both decide (UC 7.1.EX.2). Record decision, admin, timestamp, evidence ref; notify contributors on `verify` (REQ-13.11). |
| `admin_moderation_queue` | — | rows: `target_type ('post'\|'comment'), target_id, author_id, author_name, excerpt, report_count, reasons text[], first_reported_at` | ModerationQueueUI | Ordered by `report_count` desc (REQ-11.3). Moderator or admin. Needs Person B's posts/comments/reports tables. |
| `admin_moderate_content` | `p_target_type text, p_target_id bigint, p_content_action text, p_user_action text, p_note text` | `void` | ModerationQueueUI | `p_content_action` ∈ `dismiss`, `hide`, `delete`; `p_user_action` ∈ `none`, `warn`, `suspend`, `ban` (REQ-11.4). |

**Kept on the device for now** (no backend storage; the UI says so): favourites (REQ-3.7), notification category
toggles (REQ-10.3), home location (REQ-2.2), and reports waiting to be sent. Preferences/favourites live under `src/screens/find/`; the report outbox lives in `shared/api/proposed.ts`.
The outbox currently uses one device-wide key and retries on auth changes; account scoping and retry behaviour need completion before enabling reports.

**Auth configuration gap:** local `site_url` is `http://127.0.0.1:3000`, while Expo uses 8081.
Configure the intended web/native redirect allowlist and validate callback handling; adding `recyclesg://`
alone does not implement native recovery. Email delivery and reset flows are outside recorded demo sign-off.

---

## Screens with no (or only partial) backend support

Raise these with the backend owner.

### Find, account and administration (UI-1)

| Screen | Backend status | What still depends on the backend |
|---|---|---|
| LoginUI | ✅ Supabase Auth | Attempt counter ("3 attempts left") not exposed — app shows Supabase's rate-limit message instead; Singpass not configured |
| RegistrationUI | ✅ Supabase Auth | Email verification disabled locally; terms acceptance stored in user metadata (no consent table); Singpass not configured |
| MapUI | ✅ `search_nearby_recycling_points` + `recycling_points` select | Status is "Information Outdated" and hours are empty for every NEA point; generate the seed for a fresh local database |
| SearchResultsUI | ✅ nearby + client-side material filter | Item→material mapping is a keyword table in the app (`shared/itemCatalog.ts`); only blue-bin materials have points in the dataset |
| RecyclingPointDetailUI | ✅ `recycling_points` select | `operating_hours` empty; favourites kept on device (no table) |
| DirectionsUI | ✅ Google Maps hand-off (no key) | In-app route + step list need a OneMap routing token |
| ReportIssueUI | ⏳ `submit_point_report` (proposed) | Reports are queued on the device until the RPC exists; photo upload needs a storage bucket |
| ProfileUI | ✅ profile, impact, check-ins, actions | Earned badge counts work; streaks and avatar upload remain unfinished |
| SettingsUI | ✅ sign-out, password reset; ⏳ `delete_my_account` | Notification prefs + home location on device; profile visibility needs posts on the server |
| MilestoneVerificationUI | ✅ `admin_list_milestones_for_review`; ⏳ `admin_decide_milestone` (proposed) | Decisions can't be saved yet; the server's admin check (`app_admins`) and the app's (`app_metadata.role`) differ |
| ModerationQueueUI | ⏳ `admin_moderation_*` (proposed) | Needs posts/comments/reports tables (Person B + backend) |

### Recycling, progress and community (UI-2)

| Screen | Backend status | What's missing |
|---|---|---|
| CheckInUI | ✅ `create_gps_checkin` | Candidates/ties come from nearby search (100 m) + local Haversine; cooldown and daily limit are worked out from `check_ins` history. Radius, cooldown, limits are copied from the SQL into `screens/earn/rules.ts` because no endpoint exposes them. Offline check-in isn't queued: the server timestamps on arrival and only allows a log within 15 min |
| LogRecyclingUI | ✅ `submit_recycling_activity` + `recycling-photos` upload | Photo selection calls `/classify`; submission uploads the chosen photo and sends its path as `p_photo_url`. Offline submit is not queued because of the 15-minute window |
| RewardUI | ✅ trusted `/verify`, refresh and retry | Uncertain/unavailable results stay Pending; older-action retrieval is limited by history queries. No streaks; verified drops appear in the read-only feed |
| EnvironmentalImpactUI | ✅ profile, impact, actions, `list_milestones` | — |
| MilestoneContributionUI | ✅ `contribute_to_milestone`, `list_my_milestone_contributions` | — |
| QuestsUI | ✅ `quests`, `user_quest_progress`, `claim_quest_reward` | No streaks (UC 4.1 step 5) |
| CollectionUI | ✅ `badges`, `user_badges` | Badges don't record where they were earned, only when |
| LeaderboardUI | ⚠️ partial — `get_weekly_leaderboard`, `get_leaderboard` | This week / All time both work. No friends board (no follows), no town. Own row matched by username |
| FeedUI | ⚠️ partial — `get_community_feed` | Read-only list of verified drops by display name (usernames hidden): no Following/Discover, posts, photos, likes, comments or follows |
| PostDetailUI | ❌ none | No posts/comments/likes — screen says so and links to the feed |
| PostComposerUI | ❌ none | No posts table or post photos — screen says so and links to the feed |

## Ownership and maintenance

Backend owns migrations, data, RPCs and security; Pranav/UI-1 owns Find/account/admin screens;
Parth/UI-2 owns recycling/progress/community screens; Hareish owns CV recognition; Nick owns
system integration and the verification bridge. Coordinate schema/API changes with the relevant owner.
Use existing RPCs and typed wrappers rather than writing protected tables directly. Historical
branch/merge provenance and test evidence are in [TESTING.md](docs/demo/TESTING.md).
