# RecycleSG · Lab 4 implementation and testing

Prepared by Nickolas Chua

**Scope:** Lab 4 manual §§3.1 and 3.2. **Application revision:** `5b0b124` on `main`. **Execution date:** 12 November 2026, Singapore. The selected scenario is UC 3.2, “Log a recycling action and collect rewards”, following a valid UC 3.1 check-in.

## 3.1 Implement the application

### 3.1.1 From design to working behavior

The Lab 3 submission contains a TODO skeleton with named screen shells, API modules and service placeholders. Commit `fca8e19` records the skeleton. The dialog map takes a signed-in user from check-in to logging, then to the reward screen. The implemented flow carries the check-in ID to the log screen and the action ID to the reward screen. Logging creates a Pending action. A trusted service checks the stored photo before a verified result can credit the user. The archived skeleton and the running code establish traceability; they do not establish that a UML tool automatically generated the implementation.

| Design responsibility | Implemented behavior | Evidence |
|---|---|---|
| Check in at a point, UC 3.1 | CheckInUI submits the selected point and coordinates. The server enforces the distance, cooldown and daily limit. A successful check-in supplies the ID for logging. | [Check-in screen](../Lab3/frontend/src/screens/earn/CheckInUI.tsx) · [API contract](../API_ENDPOINTS.md) |
| Record a drop, UC 3.2 | LogRecyclingUI accepts a material, quantity and photo. The server checks ownership, recency, material acceptance and quantity before creating a Pending action. | [Logging screen](../Lab3/frontend/src/screens/earn/LogRecyclingUI.tsx) · [Submission control](../Lab3/backend/supabase/migrations/20261024112618_link_recycling_photos.sql) |
| Verify and show the reward, UC 3.2 | The verification service reads the user's stored photo, compares the predicted and submitted materials and finalizes the action. RewardUI displays the recorded result. A terminal retry cannot award the same action twice. | [Verification service](../Lab3/CV/verification.py) · [Reward screen](../Lab3/frontend/src/screens/earn/RewardUI.tsx) · [Finalizer](../Lab3/backend/supabase/migrations/20261025010000_finalize_recycling.sql) |

Design references: [use cases](../Lab3/RecycleSG_Use_Cases.pdf), [dialog map](../Lab3/RecycleSG_DialogMap_Group2_SCS1.pdf), [system architecture and recycling interaction sequence](../Lab3/RecycleSG_SystemArchitecture_Group2_SCS1.pdf), [archived skeleton](../Lab3/RecycleSG_AI_TODO_Skeleton_Group2_SCS1.zip).

### 3.1.2–3.1.3 Organization and public methods

The design's boundary objects map to React Native screens under `frontend/src/screens`. Control responsibilities span typed API calls, database functions and the Python verification service. PostgreSQL tables hold the entities, including check-ins, recycling actions and reward transactions.

| Public operation | Caller, purpose and result |
|---|---|
| `createCheckIn(pointId, coordinates)` | The check-in screen calls this API wrapper and receives the server's check-in ID. |
| `submitRecyclingActivity(checkInId, materialId, quantity, photoPath?)` | The log screen calls this wrapper. It returns an action ID after server validation. The initial state is Pending. |
| `POST /classify` and `POST /verify` | The first suggests a material for the photo. The second requires a bearer token and an activity ID and runs the trusted verification workflow. A suggestion on its own earns no points. |
| `SupabaseGateway.activity(id, user_id)`, `.photo(path)`, `.finalize(activity, status, result)` | The Python adapter loads the owner's action and private image, then asks the database to save the decision. The database controls the ledger update. |
| `getRewardForAction(actionId)` | The reward screen can retrieve the recorded reward for an action. The wrapper returns null when no reward exists. |

Implementation references: [typed check-in and reward wrappers](../Lab3/frontend/src/shared/api/checkins.ts), [HTTP entry points](../Lab3/CV/app.py), [gateway methods](../Lab3/CV/verification.py).

### 3.1.4 Collaboration

The team integrated backend contracts, demo fixtures and later RPC fixes through GitHub pull requests. The tested revision includes [Lab 5 backend PR #13](https://github.com/softwarelab3/2006-SCS1-X2/pull/13), [demo data PR #12](https://github.com/softwarelab3/2006-SCS1-X2/pull/12) and [blocked accounts PR #16](https://github.com/softwarelab3/2006-SCS1-X2/pull/16).

## 3.2 Deploy and test

**Test deployment.** On 12 November the Expo web application was exported and served to Chrome on loopback. The test used the real screens, FastAPI verification adapter and repository migrations in PGlite, with simulated GPS, authentication, storage and recognition. The browser's happy journey passed: one Plastic drop and a quest claim, followed by a milestone contribution, ended at **20 lifetime points, 10 available points and 20 XP**. Eight read-only checks also passed against hosted Supabase, including public material search and denial of anonymous access to the trusted finalizer. An earlier run on 26 October exercised the browser journey with real Supabase and Gemini and simulated GPS. The November checks do not establish physical-device GPS or general model accuracy. [Browser harness](../Lab3/integration/tests/README.md) · [Hosted test history](../docs/demo/TESTING.md)

### 3.2.1 Black-box testing · recycling activity submission

**Test basis.** UC 3.2 and the submission contract allow an integer quantity from 1 to 100 inclusive. The control under test is the activity-submission operation behind `submitRecyclingActivity`. Each case invokes its authenticated public RPC and reads the resulting action as its owner. The user, fresh check-in, accepted Plastic material and absent optional photo are held constant. A distinct point per case prevents the check-in cooldown from affecting the result. [Submission contract](../API_ENDPOINTS.md)

| Input quantity | Equivalence class or boundary | Expected output | Actual output |
|---|---|---|---|
| Explicit NULL | Missing numeric input | Quantity error; no action | “Quantity must be between 1 and 100”; zero actions |
| 0 | Below range, immediately outside lower bound | Same error; no action | Same error; zero actions |
| 1, 2 | Lower bound and next integer inside | Each returns an ID for a Pending action with the submitted quantity | Pending with 1 and 2 respectively |
| 99, 100 | Upper inside neighbor and upper bound | Each returns an ID for a Pending action with the submitted quantity | Pending with 99 and 100 respectively |
| 101 | Above range, immediately outside upper bound | Quantity error; no action | Same error; zero actions |

The seven executions cover all four partitions and both sides of each numeric boundary. A separate midrange example would repeat the valid partition. Explicit NULL is distinct from omitting the argument, which has a default.

### 3.2.2 White-box testing · basis paths

**Method A — photo classification, `app.classify`.** The route checks MIME type, empty content and maximum size, then calls inference. Model the handled missing-key exception as a fourth binary decision at the inference call. With one common exit, the control-flow graph has **V(G) = 4 + 1 = 5**. Each row below uses a different exit edge. The HTTP client exercises the real route; inference is stubbed so each outcome is repeatable. [Route](../Lab3/CV/app.py) · [Executed cases](../Lab3/CV/tests/test_api.py)

| Path and test input | Expected output | Actual output |
|---|---|---|
| A1 · MIME fails: text/plain, one byte | 415, no inference | 415; zero calls |
| A2 · MIME passes, empty JPEG | 400, no inference | 400; zero calls |
| A3 · Nonempty JPEG exceeds limit: 3 bytes, test limit 2 | 413, no inference | 413; zero calls |
| A4 · Valid JPEG, inference raises MissingKeyError | 503 | 503 |
| A5 · Valid PNG, inference returns Plastic at 0.9 | 200 with the supplied result; filename, bytes and MIME forwarded | 200; JSON and all three forwarded arguments matched |

The size limit is reduced only in A3 to exercise the same branch cheaply. The deployed classifier route declares an 8 MiB upload limit.

**Method B — trusted finalization, `finalize_recycling_activity`.** Decisions in execution order are D1: owned action missing; D2: action already terminal; D3: invalid result; D4: claimed verification contradicts the material; D5: set the verification timestamp for a verified result. Counting each compound guard as one decision and the timestamp CASE as one decision gives **V(G) = 5 + 1 = 6**. The flows below form a basis at this statement level. A dash means control has already exited. These cases use the service role to finalize and the owner to inspect the ledger. [Finalizer source](../Lab3/backend/supabase/migrations/20261025010000_finalize_recycling.sql) · [Executed cases](tests/lab4-procedure.test.mjs)

| Path D1–D5 | Input or starting state | Expected output | Actual output |
|---|---|---|---|
| B1 · T – – – – | Existing Plastic action, different owner | Reject lookup | “Activity not found” |
| B2 · F T – – – | Previously verified action; retry with Rejected / Glass | Return existing Verified result; one ledger row | Verified; one ledger row |
| B3 · F F T – – | Pending Plastic; Verified / Plastic, confidence 1.01 | Reject invalid confidence | “Invalid verification result” |
| B4 · F F F T – | Pending Plastic; Verified / Glass, confidence 0.9 | Reject contradictory result | “Material mismatch” |
| B5 · F F F F T | Pending Plastic; Verified / Plastic, confidence 0.9 | Verified, timestamp set, one reward | Verified; timestamp present; one ledger row |
| B6 · F F F F F | Pending Plastic; Rejected / Glass, confidence 0.9 | Rejected, null timestamp, zero rewards | Rejected; null timestamp; zero ledger rows |

### 3.2.3–3.2.4 Selection, execution and reproduction

The submission cases vary one input. The white-box cases each introduce an edge that the others cannot cover. B2 deliberately reuses B5's saved action because duplicate rewards are observable only on a retry. The tables report **seven black-box inputs and eleven white-box paths**, all passing. The deployed browser journey links these control-level results to what the user sees.

From the repository root, with project test dependencies installed:

```sh
node --test Lab4/tests/lab4-procedure.test.mjs
(cd Lab3/CV && uv run --no-project --with-requirements requirements-test.txt python -m unittest discover -s tests -p test_api.py -v)
(cd Lab3/integration/tests && npm run build && npm test)
```

For the read-only hosted checks, run `node --env-file=../../frontend/.env --test live-public.test.mjs` from `Lab3/backend/tests` with the project frontend environment configured. The selected-case count excludes test-runner wrappers, unrelated smoke checks and multiple mocked outputs that take the same route path.
