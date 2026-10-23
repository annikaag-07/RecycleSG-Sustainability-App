# RecycleSG Backend API Reference (for frontend)

Source: `feature/backend` @ `19ad79f` — `Lab3/backend/supabase/migrations/*.sql` and `Lab3/backend/API_DOCUMENTATION.md`.
Where the two disagree, this file follows the SQL (the SQL is what actually runs).

## How the backend works

There is **no custom server** (no Express/Node/Python app). The backend is a **Supabase** project:

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
**Every request** needs the `apikey: <anon/publishable key>` header. Authenticated requests also need
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
- Per backend docs only Plastic, Paper, Glass, Metal currently have linked locations (NEA blue bins). E-waste, batteries, clothing, lighting return `[]`.
- No combined "nearby + material" search. Workaround: call nearby, then filter client-side using `recycling_point_materials`.
- **Favourites: no table/endpoint.**
- **Report an issue: no table/endpoint.**
- **Directions/routing: not in backend** — use OneMap routing API / Google Maps deep link from the client.

---

## 3. Check-in & recycling actions

| Method & URL | What it does | Request | Example response | Auth |
|---|---|---|---|---|
| `POST /rest/v1/rpc/create_gps_checkin` | GPS-validated check-in; returns new check-in ID | `{ "p_recycling_point_id": 1, "p_latitude": 1.3483, "p_longitude": 103.6831 }` | `17` | User |
| `POST /rest/v1/rpc/submit_recycling_activity` | Log a recycling action against a check-in; status starts `Pending`; returns action ID | `{ "p_check_in_id": 17, "p_material_type_id": 1, "p_quantity": 4 }` | `42` | User |
| `GET /rest/v1/check_ins?select=*&order=checked_in_at.desc` | Own check-in history (RLS own rows) | — | `[{ "id": 17, "user_id": "uuid", "recycling_point_id": 1, "latitude": ..., "longitude": ..., "distance_meters": 12.4, "checked_in_at": "..." }]` | User |
| `GET /rest/v1/recycling_actions?select=*,material_types(name)&order=created_at.desc` | Own recycling actions and their verification status | — | `[{ "id": 42, "check_in_id": 17, "material_type_id": 1, "quantity": 4, "photo_url": null, "cv_predicted_material": null, "cv_confidence": null, "verification_status": "Pending", "created_at": "...", "verified_at": null }]` | User |

Check-in rules (enforced server-side): within **100 m**; **30-min** cooldown per point; max **10 check-ins per UTC day**.
Errors: `Authentication required`, `Invalid GPS coordinates`, `Recycling point not found`, `Too far from recycling point`,
`Check-in cooldown active. Try again after 30 minutes.`, `Daily check-in limit reached.`

Submission rules: check-in must be yours and ≤ **15 min** old; point must accept the material; quantity 1–100;
one action per material per check-in. Errors: `Quantity must be between 1 and 100`,
`Check-in not found or not owned by user`, `Check-in has expired`, `Material not accepted at recycling point`,
`Activity already submitted for this material`.

Notes:
- **Photo upload: no storage bucket and no way for the client to set `photo_url`.** Pending CV/integration work (Nick/Hareish).
- Nothing in the repo changes `Pending` → `Verified` yet, so rewards are never awarded through the app today.

---

## 4. Rewards / quests / badges

| Method & URL | What it does | Request | Example response | Auth |
|---|---|---|---|---|
| `GET /rest/v1/reward_transactions?select=*&order=created_at.desc` | Own reward history | — | `[{ "id": 3, "user_id": "uuid", "recycling_action_id": 42, "eco_points_earned": 40, "xp_earned": 40, "created_at": "..." }]` | User |
| `POST /rest/v1/rpc/get_user_environmental_impact` | Own impact stats (verified actions only). `p_user_id` must equal your own ID, otherwise all zeros | `{ "p_user_id": "<auth uid>" }` | `[{ "total_verified_actions": 3, "total_recycled_units": 12, "estimated_co2_saved_kg": 1.20, "tree_equivalents": 0.060 }]` | User |
| — (DB trigger `award_verified_recycling`) | When an action becomes `Verified`: +10 Eco Points and +10 XP per unit, `level = 1 + xp/100` | — | — | — |

Level/XP/points: read from `profiles`. **Quests, streaks, badges/collectibles: no tables or endpoints.**

---

## 5. Leaderboard

**No endpoint.** `profiles` RLS only lets a user read their own row, so no client can rank users.
Needs a `SECURITY DEFINER` RPC returning public fields (display name, town, level, points) plus a weekly-points source.

---

## 6. Environmental milestones

**No milestone endpoints.** `profiles.available_eco_points` exists, but there are no `milestones`,
`milestone_contributions`, organisations or verification tables, and no contribute RPC.
The only related call is `get_user_environmental_impact` (section 4), which is a personal CO₂ estimate, not a community milestone.

---

## 7. Social feed

**No endpoints.** No posts, comments, likes, follows, hashtags, blocks or notifications tables.

---

## 8. Admin

**No endpoints and no admin role.** There is no role column or admin claim; admins currently would use Supabase Studio
with the service-role key. Recycling-point edits, report review, gamification config, moderation and milestone verification
have no API.

---

## Proposed endpoints (frontend is already wired to these)

The Person A screens call these through `src/shared/api/proposed.ts`. They **do not exist yet**: PostgREST answers
`PGRST202` (function not found), which the app turns into a clear "not available on the server yet" state. Once the
backend owner adds them with these names and signatures, the screens work with no frontend change. Names and shapes are
a proposal — if the backend prefers different ones, only `proposed.ts` needs updating.

**Admin role.** The app reads `auth.users.raw_app_meta_data.role` (`'admin'` or `'moderator'`), which only the service
role can set. That only hides admin UI; every `admin_*` function below must check the role itself, e.g.
`IF (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Administrators only'; END IF;`
(NFR-SEC-09).

| RPC | Args | Returns | Used by | Notes |
|---|---|---|---|---|
| `submit_point_report` | `p_recycling_point_id bigint, p_category text, p_description text, p_client_request_id uuid` | `bigint` report id | ReportIssueUI | `p_category` ∈ `full`, `missing_or_damaged`, `wrong_info`, `contaminated`. **Idempotent on `p_client_request_id`** — the app retries queued reports with the same id (NFR-QUAL-06). Status starts `Pending`; must not change what other users see (UC 2.3). Authenticated + verified users only. |
| `delete_my_account` | — | `void` | SettingsUI | `SECURITY DEFINER`; deletes `auth.users` row for `auth.uid()` (profiles and history cascade). REQ-1.7. |
| `admin_list_milestones_for_review` | — | rows: `id, name, description, organisation, target_points, current_points, expected_outcome, closing_date, status, evidence_url, evidence_notes, evidence_requested_note, decided_at, decision_reason` | MilestoneVerificationUI | `status` ∈ `Active`, `AwaitingVerification`, `Verified`, `VerificationRejected`. Admin only. |
| `admin_decide_milestone` | `p_milestone_id bigint, p_decision text, p_reason text, p_expected_status text` | new `status` text | MilestoneVerificationUI | `p_decision` ∈ `verify`, `reject` (reason required), `request_evidence` (note required; stays `AwaitingVerification`). Refuse if current status ≠ `p_expected_status` so two admins can't both decide (UC 7.1.EX.2). Record decision, admin, timestamp, evidence ref; notify contributors on `verify` (REQ-13.11). |
| `admin_moderation_queue` | — | rows: `target_type ('post'\|'comment'), target_id, author_id, author_name, excerpt, report_count, reasons text[], first_reported_at` | ModerationQueueUI | Ordered by `report_count` desc (REQ-11.3). Moderator or admin. Needs Person B's posts/comments/reports tables. |
| `admin_moderate_content` | `p_target_type text, p_target_id bigint, p_content_action text, p_user_action text, p_note text` | `void` | ModerationQueueUI | `p_content_action` ∈ `dismiss`, `hide`, `delete`; `p_user_action` ∈ `none`, `warn`, `suspend`, `ban` (REQ-11.4). |
| `list_milestones` | — | rows: `id, name, description, organisation, target_points, current_points, expected_outcome, closing_date, status` | EnvironmentalImpactUI | Signed-in users, read-only. Active first (soonest `closing_date`), then `AwaitingVerification`, `Verified`. No evidence or decision fields (those stay admin-only). Contributing is a separate RPC, to be proposed with MilestoneContributionUI. |
| `contribute_to_milestone` | `p_milestone_id bigint, p_amount integer, p_client_request_id uuid` | one row: `accepted_amount integer, available_eco_points integer, current_points integer, status text` | MilestoneContributionUI | Verified users. Takes only what the target still needs: `accepted_amount = least(p_amount, target_points - current_points)`, the rest stays in the balance (UC 3.3.AC.3). Deducts `available_eco_points` only, never `eco_points` (lifetime). Raise `Insufficient Eco Points` if `p_amount` > available, `Milestone unavailable` if not `Active` or past `closing_date`. Contribution row, balance deduction and progress update in one transaction (EX.3). **Idempotent on `p_client_request_id`**: a repeat returns the first result and deducts nothing (EX.4, NFR-QUAL-11). Reaching the target sets `status = 'AwaitingVerification'` (step 11). |
| `list_my_milestone_contributions` | `p_milestone_id bigint` | rows: `id, amount, created_at` | MilestoneContributionUI | Caller's own contributions to that milestone, newest first (UC 3.3.AC.4). Optional — the screen hides the history if it's missing. |
| `get_leaderboard` | `p_period text, p_scope text, p_limit integer` | rows: `rank integer \| null, user_id uuid, display_name text, town text \| null, level integer, points integer, is_me boolean` | LeaderboardUI | `p_period` ∈ `week` (verified Eco Points from `reward_transactions` since Monday 00:00 Singapore time), `all_time` (`profiles.eco_points`). `p_scope` ∈ `global`, `friends` (people the caller follows, plus the caller — needs a follows table). Users with 0 points in the period are left out. Order by points desc; equal totals share a rank, earlier `profiles.created_at` first (UC 4.2.AC.4). After the top `p_limit`, append the caller's own row if it isn't in them, with `rank` null when unranked (AC.3). Public fields only — never email, username or location; town only once there is one (NFR-SEC-05). `SECURITY DEFINER` (profiles RLS hides other rows). Callable by `anon` for `global` so guests can see the board (EX.1). |

**Kept on the device for now** (no backend storage; the UI says so): favourites (REQ-3.7), notification category
toggles (REQ-10.3), home location (REQ-2.2), and reports waiting to be sent. Each lives in one small module under
`src/screens/find/` so it can be swapped for an API call later.

**Backend config request:** reset/verification emails redirect to `http://127.0.0.1:3000` (`site_url`). Please add
`http://localhost:8081` and `recyclesg://` to `auth.additional_redirect_urls` in `config.toml` so links open the app.

---

## Screens with no (or only partial) backend support

Raise these with the backend owner.

### Person A (feature/ui-1) — all 11 screens built

| Screen | Backend status | What still depends on the backend |
|---|---|---|
| LoginUI | ✅ Supabase Auth | Attempt counter ("3 attempts left") not exposed — app shows Supabase's rate-limit message instead; Singpass not configured |
| RegistrationUI | ✅ Supabase Auth | Email verification disabled locally; terms acceptance stored in user metadata (no consent table); Singpass not configured |
| MapUI | ✅ `search_nearby_recycling_points` + `recycling_points` select | Status is "Information Outdated" and hours are empty for every NEA point; **no seed data locally** |
| SearchResultsUI | ✅ nearby + client-side material filter | Item→material mapping is a keyword table in the app (`shared/itemCatalog.ts`); only blue-bin materials have points in the dataset |
| RecyclingPointDetailUI | ✅ `recycling_points` select | `operating_hours` empty; favourites kept on device (no table) |
| DirectionsUI | ✅ Google Maps hand-off (no key) | In-app route + step list need a OneMap routing token |
| ReportIssueUI | ⏳ `submit_point_report` (proposed) | Reports are queued on the device until the RPC exists; photo upload needs a storage bucket |
| ProfileUI | ✅ profile, impact, check-ins, actions | Streak and badges not tracked by the backend; avatar upload needs storage |
| SettingsUI | ✅ sign-out, password reset; ⏳ `delete_my_account` | Notification prefs + home location on device; profile visibility needs posts on the server |
| MilestoneVerificationUI | ⏳ `admin_*milestone*` (proposed) | No milestone tables yet; admin role via `app_metadata.role` |
| ModerationQueueUI | ⏳ `admin_moderation_*` (proposed) | Needs posts/comments/reports tables (Person B + backend) |

### Person B (feature/ui-2) — 6 of 11 screens built

| Screen | Backend status | What's missing |
|---|---|---|
| CheckInUI | ✅ `create_gps_checkin` — **built** | Candidates/ties come from nearby search (100 m) + local Haversine; cooldown and daily limit are worked out from `check_ins` history. Radius, cooldown, limits are copied from the SQL into `screens/earn/rules.ts` because no endpoint exposes them. Offline check-in isn't queued: the server timestamps on arrival and only allows a log within 15 min |
| LogRecyclingUI | ⚠️ partial — **built** | `submit_recycling_activity` works; **no photo upload** (button shown disabled, like ReportIssueUI); offline submit not queued, same 15-min reason |
| RewardUI | ⚠️ partial — **built** | Actions stay `Pending` (no verifier), so the screen shows points as pending, not earned; Verified/Rejected states work once something verifies; no quest/streak/badge progress |
| EnvironmentalImpactUI | ⚠️ partial — **built** | Balance, impact and per-material stats work; milestone list waits for `list_milestones` (proposed) |
| MilestoneContributionUI | ⏳ `list_milestones`, `contribute_to_milestone`, `list_my_milestone_contributions` (proposed) — **built** | Shows "not set up on the server yet" until the RPCs exist |
| QuestsUI | ❌ none | No quests or streaks |
| CollectionUI | ❌ none | No badges |
| LeaderboardUI | ⏳ `get_leaderboard` (proposed) — **built** | RLS blocks reading other profiles, so it needs the `SECURITY DEFINER` RPC; Friends needs a follows table; no `town` column yet; tapping a row will open another user's profile once UC 5.2 exists |
| FeedUI | ❌ none | No posts/follows |
| PostDetailUI | ❌ none | No posts/comments/likes |
| PostComposerUI | ❌ none | No posts table, no image storage |
