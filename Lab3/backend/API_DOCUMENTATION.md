
# RecycleSG — Backend API Documentation

## 1. Overview

RecycleSG uses Supabase PostgreSQL, Authentication and REST APIs.

The backend currently provides four RPC functions:

1. Search recycling points by material.
2. Search recycling points near a GPS location.
3. Create a GPS-validated recycling check-in.
4. Submit a recycling activity for verification.


**Deployment status:** Phase 3 and Phase 4 database migrations have been deployed to Supabase production. Public recycling search APIs have been tested successfully in production. GPS check-ins, recycling submissions, and rewards have passed local tests. Final authenticated production and CV integration testing remain pending.


### Local development

Supabase API URL:
`http://127.0.0.1:54321`

Local Supabase Studio:
`http://127.0.0.1:54323`

Use the Supabase project URL and publishable/anon key supplied by the backend team.

Never expose service-role or secret keys in frontend code.

---

## 2. Authentication

Public search endpoints can be accessed without signing in.

GPS check-ins and recycling submissions require an authenticated Supabase user.

Use Supabase Auth to sign in and obtain a user session.

Authenticated API requests must include a valid access token.

The backend identifies users using `auth.uid()`. Frontend clients must not provide arbitrary user IDs.

---

## 3. Search Recycling Points by Material

**Endpoint**

`POST /rest/v1/rpc/search_recycling_points_by_material`

**Authentication:** Public

**Request body**

```json
{
  "p_material": "Plastic"
}
```

Supported categories with linked locations:

- Plastic
- Paper
- Glass
- Metal

Other material categories currently return no matching locations.

**Response example**

```json
[
  {
    "id": 2807,
    "name": "Recycling Bins in HDB Estates",
    "address": "1 BEACH ROAD, BEACH ROAD GARDENS, Singapore 190001",
    "latitude": 1.30367135334691,
    "longitude": 103.864478661434,
    "status": "Information Outdated"
  }
]
```

Results are sorted alphabetically by address.

**Pagination example**

`?limit=20&offset=0`

Request subsequent pages using offsets 20, 40, 60, etc.

Avoid downloading all recycling points in one request.

---

## 4. Search Nearby Recycling Points

**Endpoint**

`POST /rest/v1/rpc/search_nearby_recycling_points`

**Authentication:** Public

**Request body**

```json
{
  "p_latitude": 1.3483,
  "p_longitude": 103.6831,
  "p_radius_km": 1,
  "p_limit": 20
}
```

**Parameters**

| Parameter | Type | Description |
|---|---|---|
| p_latitude | number | User's latitude |
| p_longitude | number | User's longitude |
| p_radius_km | number | Maximum search radius in km; default 5 |
| p_limit | integer | Maximum results; default 20, maximum 100 |

Results are ordered from nearest to farthest.

**Response example**

```json
[
  {
    "id": 1,
    "name": "Recycling Bins in HDB Estates",
    "address": "Example recycling-point address",
    "latitude": 1.35,
    "longitude": 103.68,
    "status": "Information Outdated",
    "distance_km": 0.8
  }
]
```

Distances are straight-line estimates, not walking or driving distances.

---

## 5. Create GPS Check-In

**Endpoint**

`POST /rest/v1/rpc/create_gps_checkin`

**Authentication:** Required

**Request body**

```json
{
  "p_recycling_point_id": 1,
  "p_latitude": 1.3483,
  "p_longitude": 103.6831
}
```

Use the actual recycling point ID and GPS coordinates.

**Successful response**

```json
1
```

The response is the newly created check-in ID.

**Validation rules**

- User must be authenticated.
- Recycling point must exist.
- GPS coordinates must be valid.
- Reported location must be within 100 metres.
- 30-minute cooldown applies at the same recycling point.
- Maximum 10 check-ins per user per UTC day.

Possible errors include:

- `Authentication required`
- `Invalid GPS coordinates`
- `Recycling point not found`
- `Too far from recycling point`
- `Check-in cooldown active. Try again after 30 minutes.`
- `Daily check-in limit reached.`

GPS coordinates are supplied by the device and may be spoofed. This endpoint does not independently prove physical presence.

---

## 6. Submit Recycling Activity

**Endpoint**

`POST /rest/v1/rpc/submit_recycling_activity`

**Authentication:** Required

**Request body**

```json
{
  "p_check_in_id": 1,
  "p_material_type_id": 1,
  "p_quantity": 2
}
```

Material IDs should be retrieved from `material_types`. Do not assume a fixed ID for each category.

**Successful response**

```json
1
```

The response is the newly created recycling activity ID.

**Validation rules**

- User must be authenticated.
- Check-in must belong to the user.
- Check-in must be no more than 15 minutes old.
- Recycling point must accept the selected material.
- Quantity must be between 1 and 100.
- Only one activity per material per check-in.

**Initial activity status:** `Pending`

Possible errors include:

- `Authentication required`
- `Quantity must be between 1 and 100`
- `Check-in not found or not owned by user`
- `Check-in has expired`
- `Material not accepted at recycling point`
- `Activity already submitted for this material`

Users cannot directly insert or update recycling activities.

CV verification, approval and Eco Points awarding are separate backend responsibilities and have not yet been integrated.

---

## 7. Frontend Integration Example

JavaScript using Supabase:

```javascript
// Assuming `supabase` is an initialized client

const { data: nearbyPoints, error: nearbyError } =
  await supabase.rpc("search_nearby_recycling_points", {
    p_latitude: 1.3483,
    p_longitude: 103.6831,
    p_radius_km: 1,
    p_limit: 20
  });

const { data: materialPoints, error: materialError } =
  await supabase
    .rpc("search_recycling_points_by_material", {
      p_material: "Plastic"
    })
    .range(0, 19);

// After the user signs in:
const { data: checkinId, error: checkinError } =
  await supabase.rpc("create_gps_checkin", {
    p_recycling_point_id: 1,
    p_latitude: 1.3483,
    p_longitude: 103.6831
  });

// Using the returned check-in ID:
if (!checkinError) {
  const { data: activityId, error: activityError } =
    await supabase.rpc("submit_recycling_activity", {
      p_check_in_id: checkinId,
      p_material_type_id: 1,
      p_quantity: 2
    });
}
```

Actual check-in coordinates must correspond to the selected recycling point.

---

## 8. Current Database Tables

- `profiles` — user profiles and reward-related fields
- `recycling_points` — recycling locations
- `material_types` — supported material categories
- `recycling_point_materials` — material/location associations
- `check_ins` — GPS-validated check-in records
- `recycling_actions` — recycling activity submissions
- `reward_transactions` - reward transaction process

All seven tables have Row Level Security enabled.

---


## 9. Rewards, XP and Environmental Impact

Phase 4 is implemented and deployed.

### Reward calculation

When a trusted backend process changes a recycling activity from
`Pending` to `Verified`, the database automatically awards:

- 10 Eco Points per verified recycling unit
- 10 XP per verified recycling unit
- 1 additional level for every 100 total XP

Example: 12 verified units = 120 Eco Points, 120 XP, Level 2
for a new user.

Rewards are stored in `reward_transactions`.
Each recycling activity can receive a reward only once.

Users cannot directly change their Eco Points, XP, level, or create
reward transactions.

### Environmental Impact API

**Endpoint**

`POST /rest/v1/rpc/get_user_environmental_impact`

**Authentication:** Required

**Request body**

```json
{
  "p_user_id": "AUTHENTICATED_USER_UUID"
}
```

The user can only retrieve their own environmental impact.

**Response fields**

- `total_verified_actions`
- `total_recycled_units`
- `estimated_co2_saved_kg`
- `tree_equivalents`

Current illustrative estimates:

- 1 recycled unit = 0.1 kg estimated CO2 saved
- 20 kg estimated CO2 saved = 1 tree equivalent

These values are estimates, not measured environmental outcomes.
No actual tree planting is performed.

### CV Verification Integration — Nick and Hareish

1. User creates a GPS check-in.
2. User submits a recycling activity, initially `Pending`.
3. Frontend uploads the relevant recycling photo through the
   approved storage workflow.
4. Hareish's CV model evaluates the submitted image.
5. Nick connects the verification result to a trusted backend
   process.
6. Only a trusted server-side process may update
   `recycling_actions.verification_status` to `Verified`.
7. The database trigger automatically creates the reward
   transaction and updates Eco Points, XP, and level.

IMPORTANT:
- Never expose Supabase secret/service-role keys to the frontend.
- Never allow the frontend to mark its own activities as Verified.
- Do not award rewards directly from frontend code.
- CV confidence alone must not automatically authorize rewards
  without agreed verification criteria and server-side checks.

### Remaining Limitations

- Authenticated production APIs require final end-to-end testing.
- CV and photo-storage integration is pending.
- Environmental estimates are illustrative.
- Recycling-point availability is not verified live.
- Device GPS coordinates can be spoofed.
- Combined GPS and material filtering is not implemented.
- Full frontend/backend integration is pending.


## 10. Team Responsibilities and Integration Handoff

### Backend — Core Database and APIs
Owner: Backend Developer

- Supabase PostgreSQL database and migrations
- Authentication and Row Level Security
- Recycling-point search and GPS check-ins
- Recycling activity submission
- Eco Points, XP, levels, and reward transactions
- Environmental impact calculations
- Backend security and API maintenance

### System Integration — Nick

- Connect the frontend to Supabase APIs
- Integrate Hareish's CV model with backend submissions
- Implement the trusted server-side CV verification workflow
- Coordinate image upload and storage integration
- Connect verification outcomes to the existing reward trigger
- Coordinate end-to-end integration testing

### Computer Vision — Hareish

- Develop and test the recycling image recognition model
- Return prediction and confidence information
- Coordinate the model's input/output format with Nick

### Frontend — Parth and Pranav

- Implement the frontend interface
- Integrate authentication and recycling workflows with Nick
- Display recycling locations, check-ins, activities, and rewards
- Display environmental impact statistics

### Integration Rules

1. Use existing Supabase RPC functions where possible.
2. Do not write directly to protected backend tables.
3. Never expose secret or service-role API keys in frontend code.
4. Only trusted backend processes may approve recycling activities.
5. The reward trigger automatically awards points after verification.
6. Coordinate any schema or API changes with the backend owner.

### Handoff Status

- Phase 3: Implemented and deployed.
- Phase 4: Implemented and deployed.
- Public production search API: Verified.
- Authenticated production APIs: Final testing pending.
- CV integration: Pending.
- Frontend integration: Pending.


---

## Additional Backend Features

All endpoints use Supabase RPC.

Base URL:
https://ihrgxedwftfzzohqpnnu.supabase.co/rest/v1/rpc/

### Leaderboard

**RPC:** `get_leaderboard`

Parameters:
- `p_limit`: integer (optional, default 10, maximum 100)

Returns:
- rank
- username
- display_name
- level
- eco_points

Access: Public (publishable/anon key).

### Milestones

**RPC:** `list_milestones`

Returns active and other publicly visible milestone records.

Access: Public.

**RPC:** `contribute_to_milestone`

Parameters:
- `p_milestone_id`: bigint
- `p_amount`: integer
- `p_client_request_id`: UUID

Access: Authenticated.

**RPC:** `list_my_milestone_contributions`

Returns the authenticated user's milestone contributions.

Access: Authenticated.

### Quests

**Table:** `quests`

Publicly readable active quests.

**Table:** `user_quest_progress`

Authenticated users can read their own progress.

**RPC:** `claim_quest_reward`

Parameters:
- `p_quest_id`: bigint
- `p_period_start`: date (`YYYY-MM-DD`)

Access: Authenticated.

Quest progress updates automatically when a recycling
activity transitions to Verified.

### Badges

**Table:** `badges`

Publicly readable badge definitions.

**Table:** `user_badges`

Authenticated users can read their own earned badges.

Badges are awarded automatically after verified recycling
activity thresholds of 1, 10, 50 and 100.

### Community Feed

**RPC:** `get_community_feed`

Parameters:
- `p_limit`: integer (optional, default 20, maximum 100)

Returns:
- activity_id
- username
- display_name
- material
- quantity
- recycled_at

Access: Public.

Only verified recycling activities are displayed.

### Security

- Do not put secret/service-role keys in frontend code.
- Use authenticated user JWTs for protected RPCs.
- Clients cannot directly modify quest progress or badges.
- Quest rewards cannot be claimed twice.
- Recycling verification must be performed by a trusted
  backend process, not directly by the frontend.
