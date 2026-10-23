import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, UrlTile } from 'react-native-maps';

import { colors } from '@/shared/theme';
import { AppText } from '@/shared/components/AppText';
import {
  MARKER_COLORS,
  ONEMAP_ATTRIBUTION,
  ONEMAP_MAX_ZOOM,
  ONEMAP_MIN_ZOOM,
  ONEMAP_TILE_URL,
  type RecycleMapProps,
} from './types';

// Rough zoom → latitude span conversion for react-native-maps regions.
const deltaForZoom = (zoom: number) => 360 / 2 ** zoom;

export function RecycleMap({ center, zoom = 16, markers, selectedId, user, route, onMarkerPress, style }: RecycleMapProps) {
  const delta = deltaForZoom(zoom);
  const mapRef = useRef<MapView>(null);

  // initialRegion only applies on mount; follow later centre changes (e.g. address search).
  useEffect(() => {
    mapRef.current?.animateToRegion({ ...center, latitudeDelta: delta, longitudeDelta: delta }, 300);
  }, [center.latitude, center.longitude, delta]);

  return (
    <View style={[styles.wrap, style]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        mapType="none"
        initialRegion={{ ...center, latitudeDelta: delta, longitudeDelta: delta }}
        minZoomLevel={ONEMAP_MIN_ZOOM}
        maxZoomLevel={ONEMAP_MAX_ZOOM}
        showsUserLocation={false}
        toolbarEnabled={false}
      >
        <UrlTile urlTemplate={ONEMAP_TILE_URL} maximumZ={ONEMAP_MAX_ZOOM} shouldReplaceMapContent />
        {markers.map((m) => {
          const selected = m.id === selectedId;
          return (
            <Marker
              key={m.id}
              coordinate={m}
              title={m.title}
              accessibilityLabel={m.title}
              anchor={{ x: 0.5, y: 0.5 }}
              zIndex={selected ? 1000 : 0}
              onPress={() => onMarkerPress?.(m.id)}
              tracksViewChanges={false}
            >
              <View
                style={[
                  styles.tile,
                  { backgroundColor: MARKER_COLORS[m.kind] },
                  selected && styles.tileSelected,
                ]}
              />
            </Marker>
          );
        })}
        {user && (
          <Marker coordinate={user} anchor={{ x: 0.5, y: 0.5 }} accessibilityLabel="Your location" tracksViewChanges={false}>
            <View style={styles.userDot} />
          </Marker>
        )}
        {route && route.length > 1 && <Polyline coordinates={route} strokeColor={colors.userDot} strokeWidth={4} />}
      </MapView>
      <AppText variant="caption" color="textMuted" style={styles.attribution}>
        {ONEMAP_ATTRIBUTION}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, overflow: 'hidden', backgroundColor: colors.surface },
  tile: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: colors.background },
  tileSelected: { width: 30, height: 30, borderWidth: 3, borderColor: colors.text },
  userDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.userDot,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  attribution: { position: 'absolute', top: 8, left: 8, textTransform: 'none' },
});
