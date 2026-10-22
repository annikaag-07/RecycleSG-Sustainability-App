import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api, toApiError, type RecyclingPointDetail } from '@/shared/api';
import { AppText, Banner, Button, Chip, Header } from '@/shared/components';
import { distanceMeters, formatDistance, walkingMinutes } from '@/shared/geo';
import { RecycleMap } from '@/shared/map/RecycleMap';
import { pointStream } from '@/shared/materials';
import { colors, radius, spacing } from '@/shared/theme';
import { pointTitle } from './pointDisplay';
import { useOrigin, type OriginParams } from './useOrigin';

type Mode = 'walking' | 'transit';

/** Google Maps directions URL — no API key needed; opens the app if installed, otherwise the browser (UC 2.2.EX.2). */
export function googleMapsUrl(dest: { latitude: number; longitude: number }, mode: Mode, from?: { latitude: number; longitude: number } | null) {
  const p = new URLSearchParams({ api: '1', destination: `${dest.latitude},${dest.longitude}`, travelmode: mode });
  if (from) p.set('origin', `${from.latitude},${from.longitude}`);
  return `https://www.google.com/maps/dir/?${p.toString()}`;
}

/**
 * UC 2.2 steps 5–8. The in-app route and step list need OneMap's routing API, which requires a OneMap
 * account token (SRS Appendix C item 1). Until then this screen shows both ends on the map, the
 * straight-line distance, and hands the walk to Google Maps — the hand-off the use case already specifies.
 */
export default function DirectionsUI() {
  const params = useLocalSearchParams<OriginParams & { id: string }>();
  const id = Number(params.id);
  const { origin, resolving } = useOrigin(params);
  const [point, setPoint] = useState<RecyclingPointDetail | null>(null);
  const [error, setError] = useState<string>();
  const [mode, setMode] = useState<Mode>('walking');
  const [openError, setOpenError] = useState<string>();

  const load = useCallback(async () => {
    setError(undefined);
    try {
      setPoint(await api.points.getPointDetail(id));
    } catch (e) {
      setError(toApiError(e).message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const openInMaps = async () => {
    if (!point) return;
    setOpenError(undefined);
    try {
      // A searched address is a valid start too; without any origin Google Maps uses the device's location.
      await Linking.openURL(googleMapsUrl(point, mode, origin));
    } catch {
      setOpenError("Couldn't open Google Maps. Copy the address instead: " + point.address);
    }
  };

  if (error) {
    return (
      <SafeAreaView edges={['top']} style={styles.root}>
        <View style={styles.pad}>
          <Header title="Directions" leading="back" />
          <Banner tone="error" title="Couldn't load this point">
            {error}
          </Banner>
          <Button label="Try again" onPress={load} />
        </View>
      </SafeAreaView>
    );
  }
  if (!point || resolving) {
    return (
      <SafeAreaView edges={['top']} style={[styles.root, styles.centered]}>
        <ActivityIndicator color={colors.text} />
      </SafeAreaView>
    );
  }

  const { title } = pointTitle(point.name, point.address);
  const meters = origin ? distanceMeters(origin, point) : null;

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.pad}>
        <Header title="Directions" leading="back" />
      </View>
      <View style={styles.map}>
        <RecycleMap
          center={origin ? midpoint(origin, point) : point}
          zoom={meters != null && meters > 700 ? 15 : 16}
          markers={[{ id: point.id, title, latitude: point.latitude, longitude: point.longitude, kind: pointStream(point.materials.map((m) => m.name)) }]}
          selectedId={point.id}
          user={origin?.source === 'gps' ? origin : null}
        />
      </View>
      <View style={styles.sheet}>
        <View style={styles.sheetHead}>
          <View style={styles.fill}>
            <AppText variant="heading" numberOfLines={1}>
              {title}
            </AppText>
            <AppText variant="small" color="textMuted">
              {meters != null
                ? `${formatDistance(meters)} in a straight line · about ${walkingMinutes(meters)} min walk or more`
                : 'Turn on location in Find to see how far it is.'}
            </AppText>
          </View>
          <View style={styles.modes}>
            <Chip label="Walking" selected={mode === 'walking'} onPress={() => setMode('walking')} />
            <Chip label="Transit" selected={mode === 'transit'} onPress={() => setMode('transit')} />
          </View>
        </View>
        <Banner tone="info">
          Step-by-step directions aren't available in the app yet. The basemap is from OneMap; the route itself is handed
          to Google Maps.
        </Banner>
        {/* NFR-SAFE-01 */}
        <Banner tone="warning">Stay on public paths and follow access rules. Don't enter restricted, private or unsafe areas.</Banner>
        {openError && <Banner tone="error">{openError}</Banner>}
        <Button label={`Open in Google Maps (${mode})`} icon="external-link" onPress={openInMaps} />
      </View>
    </SafeAreaView>
  );
}

const midpoint = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => ({
  latitude: (a.latitude + b.latitude) / 2,
  longitude: (a.longitude + b.longitude) / 2,
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  centered: { alignItems: 'center', justifyContent: 'center' },
  fill: { flex: 1 },
  pad: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.md },
  map: { flex: 1, marginTop: spacing.md },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
    marginTop: -radius.lg,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  modes: { flexDirection: 'row', gap: spacing.xs },
});
