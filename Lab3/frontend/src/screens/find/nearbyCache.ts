import AsyncStorage from '@react-native-async-storage/async-storage';

import type { NearbyRecyclingPoint } from '@/shared/api/types';
import type { PointExtras } from '@/shared/api/points';

// Last successful nearby search, shown when offline (UC 2.1.EX.4, REQ-3.9 "serve the last known data").
const KEY = 'recyclesg.find.lastNearby.v1';

export type NearbySnapshot = {
  savedAt: string;
  points: NearbyRecyclingPoint[];
  extras: [number, PointExtras][];
};

export async function saveNearby(points: NearbyRecyclingPoint[], extras: Map<number, PointExtras>) {
  const snap: NearbySnapshot = { savedAt: new Date().toISOString(), points, extras: [...extras] };
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(snap));
  } catch {
    // Storage full or unavailable — caching is best-effort.
  }
}

export async function loadNearby(): Promise<{ savedAt: Date; points: NearbyRecyclingPoint[]; extras: Map<number, PointExtras> } | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as NearbySnapshot;
    return { savedAt: new Date(snap.savedAt), points: snap.points, extras: new Map(snap.extras) };
  } catch {
    return null;
  }
}
