import type { ViewStyle } from 'react-native';

import type { LatLng } from '@/shared/api/types';

export type MapMarker = LatLng & {
  id: number;
  title: string;
  /** Visual style: blue-bin points vs e-waste points (yellow), as in the mockups. */
  kind: 'blueBin' | 'eWaste';
};

export type RecycleMapProps = {
  center: LatLng;
  zoom?: number;
  markers: MapMarker[];
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
