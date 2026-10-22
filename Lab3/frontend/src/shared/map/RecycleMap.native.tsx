import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, UrlTile } from 'react-native-maps';

import { colors } from '@/shared/theme';
import { AppText } from '@/shared/components/AppText';
import { ONEMAP_ATTRIBUTION, ONEMAP_MAX_ZOOM, ONEMAP_MIN_ZOOM, ONEMAP_TILE_URL, type RecycleMapProps } from './types';

// Rough zoom → latitude span conversion for react-native-maps regions.
const deltaForZoom = (zoom: number) => 360 / 2 ** zoom;

export function RecycleMap({ center, zoom = 16, markers, user, route, onMarkerPress, style }: RecycleMapProps) {
  const delta = deltaForZoom(zoom);
  return (
    <View style={[styles.wrap, style]}>
      <MapView
        style={StyleSheet.absoluteFill}
        mapType="none"
        initialRegion={{ ...center, latitudeDelta: delta, longitudeDelta: delta }}
        minZoomLevel={ONEMAP_MIN_ZOOM}
        maxZoomLevel={ONEMAP_MAX_ZOOM}
        showsUserLocation={false}
        toolbarEnabled={false}
      >
        <UrlTile urlTemplate={ONEMAP_TILE_URL} maximumZ={ONEMAP_MAX_ZOOM} shouldReplaceMapContent />
        {markers.map((m) => (
          <Marker
            key={m.id}
            coordinate={m}
            title={m.title}
            pinColor={m.kind === 'eWaste' ? colors.eWaste : colors.blueBin}
            onPress={() => onMarkerPress?.(m.id)}
          />
        ))}
        {user && (
          <Marker coordinate={user} anchor={{ x: 0.5, y: 0.5 }} accessibilityLabel="Your location">
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
