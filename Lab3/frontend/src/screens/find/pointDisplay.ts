// Display helpers shared by the Find screens (MapUI, SearchResultsUI, RecyclingPointDetailUI).
import type { LatLng, NearbyRecyclingPoint, PointStatus } from '@/shared/api/types';
import type { PointExtras } from '@/shared/api/points';
import { distanceMeters } from '@/shared/geo';
import { openState, type OpenState } from '@/shared/hours';
import { pointStream, type Stream } from '@/shared/materials';

export type PointView = {
  id: number;
  title: string;
  subtitle: string;
  address: string;
  latitude: number;
  longitude: number;
  status: PointStatus;
  distanceM: number;
  materials: string[];
  stream: Stream;
  open: OpenState;
};

// "409A ANG MO KIO AVENUE 10" -> "409A Ang Mo Kio Avenue 10" (block letters stay upper case).
export const titleCase = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\b(\d+)([a-z]{1,2})\b/g, (_, n: string, l: string) => n + l.toUpperCase());

/**
 * Every NEA bin has the same name ("Recycling Bins in HDB Estates"), so the address's first part
 * ("1 Beach Road") is the useful title, as in the mockups ("Blk 409A").
 */
export function pointTitle(name: string, address: string): { title: string; subtitle: string } {
  const first = address.split(',')[0]?.trim();
  if (first && /recycling bins? in hdb estates/i.test(name)) return { title: titleCase(first), subtitle: name };
  return { title: name, subtitle: titleCase(address) };
}

export function toPointView(p: NearbyRecyclingPoint, extras: PointExtras | undefined, origin: LatLng): PointView {
  const materials = extras?.materials ?? [];
  return {
    id: p.id,
    ...pointTitle(p.name, p.address),
    address: p.address,
    latitude: p.latitude,
    longitude: p.longitude,
    status: p.status,
    // Recomputed on the device so cached points still show correct distances offline (UC 2.1.EX.4).
    distanceM: distanceMeters(origin, p),
    materials,
    stream: pointStream(materials),
    open: openState(extras?.operatingHours),
  };
}

/** Status values that mean "don't send people here". */
export function isUnavailable(status: PointStatus) {
  return status === 'Removed' || status === 'Temporarily Closed' || status === 'Inaccessible';
}
