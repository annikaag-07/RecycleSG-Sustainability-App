import type { ViewStyle } from 'react-native';

import type { LatLng } from '@/shared/api/types';
import type { Stream } from '@/shared/materials';
import { colors } from '@/shared/theme';

export type MapMarker = LatLng & {
  id: number;
  title: string;
  /** Visual style: blue-bin points (blue), e-waste points (yellow), anything else (grey), as in the mockups. */
  kind: Stream;
};

export const MARKER_COLORS: Record<Stream, string> = {
  blueBin: colors.blueBin,
  eWaste: colors.eWaste,
  other: colors.textMuted,
};

export type RecycleMapProps = {
  /** Map re-centres whenever this changes (e.g. after an address search). */
  center: LatLng;
  zoom?: number;
  markers: MapMarker[];
  selectedId?: number | null;
  /** User's approximate position, drawn as a blue dot. */
  user?: LatLng | null;
  /** Optional walking route polyline for DirectionsUI. */
  route?: LatLng[];
  onMarkerPress?: (id: number) => void;
  style?: ViewStyle;
};

// OneMap "Night" raster basemap — matches the dark mockups. No token needed for tiles.
export const ONEMAP_TILE_URL = 'https://www.onemap.gov.sg/maps/tiles/Night/{z}/{x}/{y}.png';
export const ONEMAP_ATTRIBUTION = 'Map data © OneMap · Singapore Land Authority';
export const ONEMAP_MIN_ZOOM = 11;
export const ONEMAP_MAX_ZOOM = 19;
