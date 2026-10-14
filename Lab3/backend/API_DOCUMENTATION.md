
# RecycleSG — Backend API Documentation

## 1. Overview

RecycleSG uses Supabase PostgreSQL, Authentication and REST APIs.

The backend currently provides four RPC functions:

1. Search recycling points by material.
2. Search recycling points near a GPS location.
3. Create a GPS-validated recycling check-in.
4. Submit a recycling activity for verification.

**Deployment status:** Tested locally. Production deployment and end-to-end integration are pending.

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

All six tables have Row Level Security enabled.

---

## 9. Current Limitations

- Production deployment of newer RPC functions and material associations is pending.
- Recycling location availability is not verified live.
- Combined GPS and material filtering is not yet implemented.
- Photo/CV verification integration is pending.
- Eco Points awarding is not implemented.
- GPS spoofing protection requires additional measures.
- API responses should be paginated where appropriate.
- Final integration and security testing are pending.

## 10. Backend Ownership

The backend team maintains the Supabase database, migrations, authentication rules and RPC endpoints.

Frontend developers should use Supabase client methods rather than modifying database tables directly.

Coordinate any new database fields or API requirements with the backend team before implementation.
