// Type-only entry so TypeScript resolves `@/shared/map/RecycleMap`.
// Metro picks RecycleMap.native.tsx (iOS/Android) or RecycleMap.web.tsx (browser) at bundle time.
export { RecycleMap } from './RecycleMap.native';
