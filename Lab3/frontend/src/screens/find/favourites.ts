import AsyncStorage from '@react-native-async-storage/async-storage';

// REQ-3.7 favourites. The backend has no favourites table yet, so they are kept on this device, per account.
// Swap these functions for API calls once an endpoint exists (see API_ENDPOINTS.md "Proposed endpoints").
const key = (userId: string) => `recyclesg.favourites.v1.${userId}`;

export type Favourite = { id: number; title: string; savedAt: string };

export async function listFavourites(userId: string): Promise<Favourite[]> {
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    return raw ? (JSON.parse(raw) as Favourite[]) : [];
  } catch {
    return [];
  }
}

export async function isFavourite(userId: string, pointId: number): Promise<boolean> {
  return (await listFavourites(userId)).some((f) => f.id === pointId);
}

/** Returns the new state (true = now a favourite). */
export async function toggleFavourite(userId: string, pointId: number, title: string): Promise<boolean> {
  const list = await listFavourites(userId);
  const exists = list.some((f) => f.id === pointId);
  const next = exists ? list.filter((f) => f.id !== pointId) : [{ id: pointId, title, savedAt: new Date().toISOString() }, ...list];
  await AsyncStorage.setItem(key(userId), JSON.stringify(next));
  return !exists;
}
