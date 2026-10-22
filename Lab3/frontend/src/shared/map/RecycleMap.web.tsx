import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';

import type { LatLng } from '@/shared/api/types';
import type { Stream } from '@/shared/materials';
import { colors } from '@/shared/theme';
import {
  MARKER_COLORS,
  ONEMAP_ATTRIBUTION,
  ONEMAP_MAX_ZOOM,
  ONEMAP_MIN_ZOOM,
  ONEMAP_TILE_URL,
  type RecycleMapProps,
} from './types';

// Square icon tiles like the mockups. Plain divIcons avoid Leaflet's default PNG marker assets.
function iconFor(kind: Stream, selected: boolean) {
  const size = selected ? 30 : 22;
  const border = selected ? `3px solid ${colors.text}` : `2px solid ${colors.background}`;
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:7px;background:${MARKER_COLORS[kind]};border:${border};box-sizing:border-box"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const userIcon = L.divIcon({
  className: '',
  html: `<div style="width:20px;height:20px;border-radius:50%;background:${colors.userDot};border:3px solid #FFFFFF;box-sizing:border-box;box-shadow:0 0 0 6px rgba(74,139,234,0.25)"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

/** MapContainer ignores `center` after mount, so pan imperatively when it changes. */
function Recenter({ center, zoom }: { center: LatLng; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([center.latitude, center.longitude], zoom);
  }, [map, center.latitude, center.longitude, zoom]);
  return null;
}

export function RecycleMap({ center, zoom = 16, markers, selectedId, user, route, onMarkerPress, style }: RecycleMapProps) {
  const icons = useMemo(() => {
    const kinds: Stream[] = ['blueBin', 'eWaste', 'other'];
    return Object.fromEntries(
      kinds.flatMap((k) => [
        [`${k}:0`, iconFor(k, false)],
        [`${k}:1`, iconFor(k, true)],
      ]),
    ) as Record<string, L.DivIcon>;
  }, []);

  return (
    <View style={[{ flex: 1, overflow: 'hidden', backgroundColor: colors.surface }, style]}>
      <MapContainer
        center={[center.latitude, center.longitude]}
        zoom={zoom}
        minZoom={ONEMAP_MIN_ZOOM}
        maxZoom={ONEMAP_MAX_ZOOM}
        style={{ width: '100%', height: '100%', background: colors.surface }}
      >
        <Recenter center={center} zoom={zoom} />
        <TileLayer url={ONEMAP_TILE_URL} attribution={ONEMAP_ATTRIBUTION} detectRetina />
        {markers.map((m) => (
          <Marker
            key={m.id}
            position={[m.latitude, m.longitude]}
            icon={icons[`${m.kind}:${m.id === selectedId ? 1 : 0}`]}
            title={m.title}
            alt={m.title}
            keyboard
            zIndexOffset={m.id === selectedId ? 1000 : 0}
            eventHandlers={{ click: () => onMarkerPress?.(m.id) }}
          />
        ))}
        {user && (
          // A Marker (not CircleMarker) so the dot sits above bin markers instead of underneath them.
          <Marker
            position={[user.latitude, user.longitude]}
            icon={userIcon}
            title="Your location"
            alt="Your location"
            interactive={false}
            zIndexOffset={2000}
          />
        )}
        {route && route.length > 1 && (
          <Polyline
            positions={route.map((p) => [p.latitude, p.longitude] as [number, number])}
            pathOptions={{ color: colors.userDot, weight: 4 }}
          />
        )}
      </MapContainer>
    </View>
  );
}
