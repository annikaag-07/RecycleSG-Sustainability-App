import { Linking, Platform } from 'react-native';
import * as Location from 'expo-location';

import type { LatLng } from '@/shared/api/types';

export type LocationPermission = 'granted' | 'denied' | 'undetermined';

export type PermissionInfo = {
  status: LocationPermission;
  /** False when the OS will no longer show the prompt; send the user to Settings instead (UC 6.1.EX.2). */
  canAskAgain: boolean;
};

export type Fix = LatLng & { accuracyMeters: number | null };

export async function getLocationPermission(): Promise<PermissionInfo> {
  const p = await Location.getForegroundPermissionsAsync();
  return { status: p.status as LocationPermission, canAskAgain: p.canAskAgain };
}

/** NFR-SEC-04: permission is requested before location is read. */
export async function requestLocationPermission(): Promise<PermissionInfo> {
  const p = await Location.requestForegroundPermissionsAsync();
  return { status: p.status as LocationPermission, canAskAgain: p.canAskAgain };
}

// On web, expo-location asks the browser with maximumAge: Infinity, so any cached position counts as current: a
// check-in could use where the user was minutes ago. Its options are spread over that default, so 0 asks for a
// fresh fix. The key isn't in LocationOptions, hence the cast.
const FRESH_ON_WEB = (Platform.OS === 'web' ? { maximumAge: 0 } : {}) as Location.LocationOptions;

export async function getCurrentFix(timeoutMs = 10000): Promise<Fix> {
  const fix = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, ...FRESH_ON_WEB });
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Could not get your location in time.')), timeoutMs),
  );
  const pos = await Promise.race([fix, timeout]);
  return { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracyMeters: pos.coords.accuracy ?? null };
}

/** Opens the OS app settings so the user can re-enable a permanently denied permission. No-op on web. */
export async function openAppSettings() {
  if (Platform.OS !== 'web') await Linking.openSettings();
}
