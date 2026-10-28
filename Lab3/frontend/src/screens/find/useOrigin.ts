import { useEffect, useState } from 'react';
import type { Href } from 'expo-router';

import type { LatLng } from '@/shared/api/types';
import { getCurrentFix, getLocationPermission } from '@/shared/location';

/** Where distances are measured from: the user's GPS fix or an address they searched (UC 2.1.AC.5). */
export type Origin = LatLng & { label: string; source: 'gps' | 'address' };

export type OriginParams = { lat?: string; lng?: string; label?: string; src?: string };

/** Route params that carry the origin between Find screens, so they all measure from the same place. */
export function originParams(o: Origin | null): Record<string, string> {
  if (!o) return {};
  return { lat: String(o.latitude), lng: String(o.longitude), label: o.label, src: o.source };
}

export function withOrigin(pathname: string, o: Origin | null, extra: Record<string, string> = {}): Href {
  return { pathname, params: { ...originParams(o), ...extra } } as Href;
}

/**
 * Origin from route params, else the current GPS fix if permission was already granted.
 * Never prompts — MapUI owns the permission request. `null` means "no location; show unsorted results".
 */
export function useOrigin(params: OriginParams): { origin: Origin | null; resolving: boolean } {
  const fromParams =
    params.lat && params.lng && Number.isFinite(Number(params.lat)) && Number.isFinite(Number(params.lng))
      ? {
          latitude: Number(params.lat),
          longitude: Number(params.lng),
          label: params.label ?? 'Selected location',
          source: params.src === 'address' ? ('address' as const) : ('gps' as const),
        }
      : null;
  const [origin, setOrigin] = useState<Origin | null>(fromParams);
  const [resolving, setResolving] = useState(!fromParams);

  useEffect(() => {
    if (fromParams) {
      setOrigin(null);
      setResolving(false);
      return;
    }
    setOrigin(null);
    setResolving(true);
    let cancelled = false;
    (async () => {
      try {
        const p = await getLocationPermission();
        if (p.status === 'granted') {
          const fix = await getCurrentFix();
          if (!cancelled) setOrigin({ latitude: fix.latitude, longitude: fix.longitude, label: 'Near you', source: 'gps' });
        }
      } catch {
        // No fix — callers fall back to address-free behaviour.
      } finally {
        if (!cancelled) setResolving(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // fromParams is derived from params; re-run only when the coordinates change.
  }, [params.lat, params.lng]);

  // Route params are authoritative on every render, not only on first mount.
  return { origin: fromParams ?? origin, resolving: fromParams ? false : resolving };
}
