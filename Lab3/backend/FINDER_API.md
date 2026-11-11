# Recycling points, issue reports and usage statistics

Call each function through `supabase.rpc(name, args)`. The finder is available to guests. The admin calls require a signed-in member of `app_admins` and reject other callers with SQLSTATE `42501`.

## Browse points

| Function | Arguments | Result |
|---|---|---|
| `find_recycling_points` | `p_latitude, p_longitude, p_radius_km=5, p_limit=20, p_open_only=false, p_at=now()` | Nearest-first rows with `id, name, address, latitude, longitude, status, distance_km, is_open`. Set `p_open_only` to filter before the limit. |
| `recycling_point_open_now` | `p_point_id, p_at=now()` | Boolean or null. Null means unknown hours or unavailable point. Missing schedules stay unknown. A temporarily closed or inaccessible point returns false. |

Singapore time determines the weekday and minute. The end of an interval is exclusive. Optional `week` (1–5) restricts the interval to that occurrence of its weekday in the month. A time range crossing midnight extends into the next weekday. Existing nearby and material search RPCs keep their response shapes. Use the new RPC for the open-now chip and `is_open` for result cards. An optional local demo seed adds the ALBA Cash for Trash station at 456 Jurong West Street 41. ALBA lists the second Sunday of each month from 08:30 to 11:30. Its block-level map pin comes from NEA CSV row 3665 with the matching street and postal code 640456. The station is a separate row from the permanent blue bin. The seed runs twice without duplicating it. Use `p_at="2026-11-08T09:00:00+08:00"` to demonstrate the published hours. [Demo SQL](supabase/demo/cash_for_trash.sql) · [Operator schedule effective May 2026](https://www.alba-wh.sg/pdf/Cash-For-Trash-Schedule%20%28wef%201%20May%202026%29.pdf)

The station has material links for clothing and textiles, glass bottles, clean metal, paper and clean plastics. They populate the detail and recycling-log material pickers after seeding. [Jurong-Clementi Town Council collection guidance](https://ourneighbourhood.jrtc.org.sg/2022/05/earn-cash-rewards-by-disposing-of-your-trash-responsibly/)

## Manage points

| Function | Arguments | Result |
|---|---|---|
| `admin_list_points` | `p_after_id=null, p_limit=20, p_active=null` | Full records with sorted `material_ids`. Use the last ID as the next cursor. Set `p_active=false` to find inactive records. |
| `admin_save_point` | `p_point_id, p_point` | Numeric ID. Null ID creates a point. For edits send the full current record with your changes. Materials, hours and point details are replaced in one transaction. Set `is_active=false` to deactivate and true to reactivate. |
| `admin_remove_point` | `p_point_id` | `deleted` when no restrictive references exist or `archived` when history needs the row. Archived points leave public searches and reject new check-ins. |

`material_ids` are IDs from `material_types`. Set `weekly_hours` to null for unknown hours or an empty array for a known closed week. Each interval has an ISO weekday (Monday = 1), start minute 0–1439 and end minute 0–1440. For 24-hour opening on one day use 0 and 1440. The `operating_hours` field holds optional human-readable text. Use the `source` field to identify the origin of the schedule.

A **synthetic test fixture** for a Monday 22:00 to Tuesday 02:00 session follows. Use this only against a local or demo dataset. The coordinates and hours are test inputs.

```json
{
  "p_point_id": null,
  "p_point": {
    "name": "Demo recycling station",
    "address": "Synthetic fixture",
    "latitude": 1.3,
    "longitude": 103.8,
    "status": "Available",
    "region": "West",
    "source": "Synthetic demo fixture",
    "operating_hours": "Mon 22:00 to Tue 02:00",
    "weekly_hours": [{"day": 1, "start": 1320, "end": 120}],
    "material_ids": [],
    "is_active": true
  }
}
```

Field validation returns `22023` for incomplete details or invalid interval ranges. Database constraints reject invalid coordinates/status (`23514`) and unknown materials (`23503`). Missing edit or removal targets return `P0002`.

## Submit and replay issue reports

The existing `submit_point_report` RPC and admin report review workflow remain available. The device calls `submit_owned_point_report` with the same arguments plus `p_owner_id`. The server compares that owner with the authenticated caller in the transaction. Reuse the same `p_client_request_id` when retrying a submission.

The app saves each pending report under its owner's ID and its request ID. It retries that owner's entries on sign-in or startup and once per minute while the app is running and signed in. Legacy entries lack ownership information and stay on the device without replay. Repeated failures retain the pending entry. The account guard rejects a replay if the token changes mid-request.

## Read usage and impact statistics

Call `admin_usage_stats({p_from:'2026-01-01',p_until:'2026-02-01'})` for January. Dates are Singapore calendar dates. The start is inclusive and the end exclusive. Invalid windows return `22023`.

| Result field | Definition |
|---|---|
| `active_users` | Unique users who checked in during the interval. |
| `verified_actions` | Actions verified during the interval, by verification timestamp. |
| `most_used_points` | Up to ten points ranked by check-ins, then ID. Each row has `id, name, check_ins`. |
| `items_by_material` | Verified quantities summed per material, sorted by quantity then ID. Each row has `id, name, quantity`. |

Run `node --test finder.test.mjs` in `Lab3/backend/tests` for RPC verification and `npm test` in `Lab3/frontend` for device queue isolation.
