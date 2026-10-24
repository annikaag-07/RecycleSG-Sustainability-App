import AsyncStorage from '@react-native-async-storage/async-storage';

import type { LatLng } from '@/shared/api/types';

// Preferences the backend has no columns for yet (notification categories, home location).
// Kept on this device per account; the UI says so. Move to the server when endpoints exist.

export type NotificationPrefs = {
  social: boolean; // likes, comments, follows (REQ-10.1)
  progress: boolean; // level ups, badges, quests (REQ-10.2)
  streakReminder: boolean; // streak-at-risk evening reminder (UC 4.1.AC.3) — opt-in
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = { social: true, progress: true, streakReminder: false };

/** Evening reminder time shown next to the toggle (UC 6.1 step 3). */
export const STREAK_REMINDER_TIME = '8:00 pm';

export type HomeLocation = LatLng & { label: string };

const prefsKey = (uid: string) => `recyclesg.settings.notifications.v1.${uid}`;
const homeKey = (uid: string) => `recyclesg.settings.home.v1.${uid}`;

export async function loadNotificationPrefs(uid: string): Promise<NotificationPrefs> {
  try {
    const raw = await AsyncStorage.getItem(prefsKey(uid));
    return raw ? { ...DEFAULT_NOTIFICATION_PREFS, ...(JSON.parse(raw) as Partial<NotificationPrefs>) } : DEFAULT_NOTIFICATION_PREFS;
  } catch {
    return DEFAULT_NOTIFICATION_PREFS;
  }
}

/** Throws if storage fails, so the caller can revert the toggle (UC 6.1.EX.1). */
export async function saveNotificationPrefs(uid: string, prefs: NotificationPrefs) {
  await AsyncStorage.setItem(prefsKey(uid), JSON.stringify(prefs));
}

export async function loadHomeLocation(uid: string): Promise<HomeLocation | null> {
  try {
    const raw = await AsyncStorage.getItem(homeKey(uid));
    return raw ? (JSON.parse(raw) as HomeLocation) : null;
  } catch {
    return null;
  }
}

export async function saveHomeLocation(uid: string, home: HomeLocation | null) {
  if (home) await AsyncStorage.setItem(homeKey(uid), JSON.stringify(home));
  else await AsyncStorage.removeItem(homeKey(uid));
}
