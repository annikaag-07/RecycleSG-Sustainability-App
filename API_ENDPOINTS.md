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

## Screens with no (or only partial) backend support

Raise these with the backend owner.

### Person A (feature/ui-1)

| Screen | Backend status | What's missing |
|---|---|---|
| LoginUI | ✅ Supabase Auth | Attempt counter / lockout message ("3 attempts left") not exposed; Singpass not configured |
| RegistrationUI | ✅ Supabase Auth | Email verification disabled locally; guidelines-acceptance record (version + timestamp) not stored; Singpass not configured |
| MapUI | ✅ `search_nearby_recycling_points` | Material info not in the response (need a second query); availability status is always "Information Outdated" |
| SearchResultsUI | ⚠️ partial | Material search is **not sorted by distance** and has no lat/lng param; no item→material mapping (e.g. "old laptop" → E-Waste); only blue-bin materials have points |
| RecyclingPointDetailUI | ⚠️ partial | Works via `recycling_points` select, but `operating_hours` is empty for all points; no favourites endpoint |
| DirectionsUI | ❌ none (expected) | Routing comes from OneMap / Google Maps on the client — need a OneMap API token |
| ReportIssueUI | ❌ none | No reports table/RPC, no photo storage |
| ProfileUI | ⚠️ partial | Own profile + impact work; no streak, badges, items-recycled count (can derive from `recycling_actions`), followers, posts, town |
| SettingsUI | ❌ mostly none | No notification-preferences or profile-visibility storage; no account-deletion endpoint. Permission toggles are device-only (fine) |
| MilestoneVerificationUI | ❌ none | No milestones, evidence or verification tables; no admin role |
| ModerationQueueUI | ❌ none | No posts/comments/reports tables; no admin/moderator role |

### Person B (feature/ui-2)

| Screen | Backend status | What's missing |
|---|---|---|
| CheckInUI | ✅ `create_gps_checkin` | No "candidate points / tie" endpoint (use nearby search with small radius); cooldown remaining time not returned |
| LogRecyclingUI | ⚠️ partial | `submit_recycling_activity` works; **no photo upload** |
| RewardUI | ⚠️ partial | Actions stay `Pending` (no verifier), so nothing is awarded yet; no quest/streak/badge progress |
| EnvironmentalImpactUI | ⚠️ partial | Personal impact stats only; no milestone list |
| MilestoneContributionUI | ❌ none | No contribute RPC / milestone tables |
| QuestsUI | ❌ none | No quests or streaks |
| CollectionUI | ❌ none | No badges |
| LeaderboardUI | ❌ none | RLS blocks reading other profiles; no ranking RPC |
| FeedUI | ❌ none | No posts/follows |
| PostDetailUI | ❌ none | No posts/comments/likes |
| PostComposerUI | ❌ none | No posts table, no image storage |
