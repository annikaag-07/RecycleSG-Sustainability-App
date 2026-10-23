import type { LatLng } from '@/shared/api/types';

/** Centre of Singapore, used before the user's position is known. */
export const SINGAPORE_CENTER: LatLng = { latitude: 1.3521, longitude: 103.8198 };

/** Straight-line (Haversine) distance in metres — the same formula the backend uses. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "0m", "66m", "1.1km" — matches the mockups. */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

/**
 * Rough walking minutes at ~80 m/min. Straight-line distance understates the real walk,
 * so callers should label this as an estimate until routing (DirectionsUI) is available.
 */
export function walkingMinutes(meters: number): number {
  return Math.max(1, Math.round(meters / 80));
}
