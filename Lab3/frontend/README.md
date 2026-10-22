# RecycleSG Frontend

Expo (SDK 58) + expo-router + TypeScript. One codebase for Android, iOS and web.
Style reference: `Lab 1/UI-Mockups`. Backend API reference: [`/API_ENDPOINTS.md`](../../API_ENDPOINTS.md).

## Run it

```bash
cd Lab3/frontend
npm install
cp .env.example .env        # then fill in the anon key (see below)
npx expo start              # w = web, a = Android, scan QR with Expo Go for a phone
npm run typecheck
```

**Backend URL and key** — local backend: in `Lab3/backend` run `npx supabase@2 start`, then `npx supabase@2 status`
and copy `API_URL` / `ANON_KEY` into `.env`. On a physical phone, replace `127.0.0.1` with your PC's LAN IP.
Never put the service-role / secret key in `.env` — `EXPO_PUBLIC_*` values ship inside the app.

## Folder layout — who owns what

```
src/
  app/              Routes (expo-router). Thin one-line re-exports of screens. Already created for all 22 screens —
                    you should not need to edit these. Groups: (auth), (tabs)/find|quests|feed|ranks|you, admin.
  screens/find/     Person A (Pranav) — Login, Registration, Map, SearchResults, PointDetail, Directions,
                    ReportIssue, Profile, Settings, MilestoneVerification, ModerationQueue
  screens/earn/     Person B (Parth) — CheckIn, LogRecycling, Reward, EnvironmentalImpact, MilestoneContribution,
                    Quests, Collection, Leaderboard, Feed, PostDetail, PostComposer
  shared/           Used by both. Coordinate before changing anything here.
    theme/          colors, spacing, radius, typography (from the mockups)
    components/     AppText, Button, Card, Chip, TextField, Banner, EmptyState, Header, Screen, PlaceholderScreen
    api/            Supabase client + typed wrappers: api.auth / api.points / api.checkins / api.profile
    auth/           AuthProvider + useAuth() (session, user, isGuest, isVerified)
    map/            <RecycleMap> — react-native-maps on native, Leaflet on web, OneMap "Night" tiles
```

Every screen file in `screens/` currently renders a `PlaceholderScreen`. Replace the file's contents when you build it,
keeping the default export and file name so the route keeps working.

## Conventions

- Call the backend only through `api.*` from `@/shared/api`. Errors are thrown as `ApiError` (`.message` is safe to show,
  `.isNetwork` means offer a retry).
- Use theme tokens (`colors`, `spacing`, `typography`) — no hard-coded hex values in screens.
- Give every icon-only control an `accessibilityLabel` (NFR-QUAL-04).
- Route params: `useLocalSearchParams<{ id: string }>()`; navigate with `router.push('/find/point/42')`.

## Routes

| Route | Screen | Owner |
|---|---|---|
| `/login`, `/register` | LoginUI, RegistrationUI | A |
| `/find` | MapUI | A |
| `/find/search` | SearchResultsUI | A |
| `/find/point/[id]` | RecyclingPointDetailUI | A |
| `/find/directions/[id]` | DirectionsUI | A |
| `/find/report/[id]` | ReportIssueUI | A |
| `/find/check-in/[pointId]` | CheckInUI | B |
| `/find/log/[checkInId]` | LogRecyclingUI | B |
| `/find/reward/[actionId]` | RewardUI | B |
| `/quests`, `/quests/collection` | QuestsUI, CollectionUI | B |
| `/feed`, `/feed/post/[id]`, `/feed/compose` | FeedUI, PostDetailUI, PostComposerUI | B |
| `/ranks` | LeaderboardUI | B |
| `/you`, `/you/settings` | ProfileUI, SettingsUI | A |
| `/you/impact`, `/you/milestone/[id]` | EnvironmentalImpactUI, MilestoneContributionUI | B |
| `/admin/milestones`, `/admin/moderation` | MilestoneVerificationUI, ModerationQueueUI | A |
