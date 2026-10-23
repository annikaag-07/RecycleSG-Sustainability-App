import { ApiError } from './errors';
import type { LatLng } from './types';

// OneMap (Singapore Land Authority) public search — no token needed, but it is rate-limited (HTTP 429).
const SEARCH_URL = 'https://www.onemap.gov.sg/api/common/elastic/search';

export type AddressResult = LatLng & {
  /** Full address, e.g. "409 ANG MO KIO AVENUE 10 ... SINGAPORE 560409". */
  address: string;
  /** Short label for titles: block + road ("409 ANG MO KIO AVENUE 10") when known, otherwise the place name. */
  label: string;
  postalCode: string | null;
};

type OneMapRow = {
  SEARCHVAL: string;
  BLK_NO: string;
  ROAD_NAME: string;
  ADDRESS: string;
  POSTAL: string;
  LATITUDE: string;
  LONGITUDE: string;
};

const present = (v: string | undefined) => (v && v !== 'NIL' ? v : '');

/** REQ-3.3 / UC 2.1.AC.5: look up an address or postal code to search from when GPS is off. */
export async function searchAddress(query: string): Promise<AddressResult[]> {
  const q = query.trim();
  if (!q) return [];
  const url = `${SEARCH_URL}?searchVal=${encodeURIComponent(q)}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new ApiError('Cannot reach the address service. Check your connection and try again.', 'network');
  }
  if (res.status === 429) throw new ApiError('Too many address searches. Wait a moment and try again.', '429');
  if (!res.ok) throw new ApiError('Address search is unavailable right now.', String(res.status));
  const body = (await res.json()) as { results?: OneMapRow[] };
  return (body.results ?? []).map((r) => {
    const blockAndRoad = [present(r.BLK_NO), present(r.ROAD_NAME)].filter(Boolean).join(' ');
    return {
      latitude: Number(r.LATITUDE),
      longitude: Number(r.LONGITUDE),
      address: r.ADDRESS,
      label: blockAndRoad || r.SEARCHVAL,
      postalCode: present(r.POSTAL) || null,
    };
  });
}
