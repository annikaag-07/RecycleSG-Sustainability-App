import 'leaflet/dist/leaflet.css';
import { useMemo } from 'react';
import { View } from 'react-native';
import L from 'leaflet';
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer } from 'react-leaflet';

import { colors } from '@/shared/theme';
import {
  ONEMAP_ATTRIBUTION,
  ONEMAP_MAX_ZOOM,
  ONEMAP_MIN_ZOOM,
  ONEMAP_TILE_URL,
  type MapMarker,
  type RecycleMapProps,
} from './types';

// Square icon tiles like the mockups (blue bin / yellow e-waste). Plain divIcons avoid Leaflet's default PNG assets.
function iconFor(kind: MapMarker['kind']) {
  const bg = kind === 'eWaste' ? colors.eWaste : colors.blueBin;
  return L.divIcon({
    className: '',
    html: `<div style="width:22px;height:22px;border-radius:6px;background:${bg};border:2px solid ${colors.background}"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

export function RecycleMap({ center, zoom = 16, markers, user, route, onMarkerPress, style }: RecycleMapProps) {
  const icons = useMemo(() => ({ blueBin: iconFor('blueBin'), eWaste: iconFor('eWaste') }), []);
  return (
    <View style={[{ flex: 1, overflow: 'hidden', backgroundColor: colors.surface }, style]}>
      <MapContainer
        center={[center.latitude, center.longitude]}
        zoom={zoom}
        minZoom={ONEMAP_MIN_ZOOM}
        maxZoom={ONEMAP_MAX_ZOOM}
        style={{ width: '100%', height: '100%', background: colors.surface }}
      >
        <TileLayer url={ONEMAP_TILE_URL} attribution={ONEMAP_ATTRIBUTION} detectRetina />
        {markers.map((m) => (
          <Marker
            key={m.id}
            position={[m.latitude, m.longitude]}
            icon={icons[m.kind]}
            title={m.title}
            alt={m.title}
            eventHandlers={{ click: () => onMarkerPress?.(m.id) }}
          />
        ))}
        {user && (
          <CircleMarker
            center={[user.latitude, user.longitude]}
            radius={9}
            pathOptions={{ color: '#FFFFFF', weight: 3, fillColor: colors.userDot, fillOpacity: 1 }}
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
