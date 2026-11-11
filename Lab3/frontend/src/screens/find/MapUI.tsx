import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { api, toApiError, type LatLng } from '@/shared/api';
import type { AddressResult } from '@/shared/api/onemap';
import { useAuth } from '@/shared/auth/AuthProvider';
import { AppText, Banner, Button, Chip, EmptyState, TextField } from '@/shared/components';
import { formatDistance, walkingMinutes } from '@/shared/geo';
import { openLabel } from '@/shared/hours';
import { getCurrentFix, getLocationPermission, openAppSettings, requestLocationPermission } from '@/shared/location';
import { RecycleMap } from '@/shared/map/RecycleMap';
import { colors, radius, spacing } from '@/shared/theme';
import { loadNearby, saveNearby } from './nearbyCache';
import { MaterialTile, PointTypeTile } from './PointBits';
import { titleCase, toPointView, type PointView } from './pointDisplay';
import { loadHomeLocation, type HomeLocation } from './settingsStore';
import { withOrigin } from './useOrigin';

type Origin = LatLng & { label: string; source: 'gps' | 'address'; accuracyMeters?: number | null };
type Filter = 'all' | 'blueBin' | 'eWaste' | 'openNow';
type Load =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'offline'; savedAt: Date }
  | { kind: 'error'; message: string };

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'blueBin', label: 'Blue bin' },
  { key: 'eWaste', label: 'E-waste' },
  { key: 'openNow', label: 'Open now' },
];
const DEFAULT_RADIUS_KM = 1;
const WIDER_RADIUS_KM = 5;
const MAX_POINTS = 50;

export default function MapUI() {
  const [permission, setPermission] = useState<'checking' | 'granted' | 'denied'>('checking');
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [locError, setLocError] = useState<string>();
  const { user } = useAuth();
  const [home, setHome] = useState<HomeLocation | null>(null);

  // Home location from Settings (REQ-2.2) is offered as a starting point when GPS is off.
  useEffect(() => {
    if (user) loadHomeLocation(user.id).then(setHome);
  }, [user]);

  const locate = useCallback(async (ask: boolean) => {
    setLocError(undefined);
    try {
      let p = await getLocationPermission();
      if (p.status !== 'granted' && ask && p.canAskAgain) p = await requestLocationPermission();
      setCanAskAgain(p.canAskAgain);
      if (p.status !== 'granted') {
        setPermission('denied');
        return;
      }
      setPermission('granted');
      const fix = await getCurrentFix();
      setOrigin({ ...fix, label: 'Near you', source: 'gps' });
    } catch (e) {
      setPermission('denied');
      setLocError(toApiError(e).message);
    }
  }, []);

  useEffect(() => {
    locate(true);
  }, [locate]);

  if (!origin) {
    if (permission === 'checking') return <Centered label="Finding your location…" />;
    return (
      <LocationOff
        locationEnabled={permission === 'granted'}
        canAskAgain={canAskAgain}
        error={locError}
        onTurnOn={() => (canAskAgain ? locate(true) : openAppSettings())}
        onAddress={(a) => setOrigin({ latitude: a.latitude, longitude: a.longitude, label: shortLabel(a), source: 'address' })}
        home={home}
        onHome={() => home && setOrigin({ latitude: home.latitude, longitude: home.longitude, label: home.label, source: 'address' })}
      />
    );
  }
  return <NearbyMap origin={origin} onChangeOrigin={() => setOrigin(null)} />;
}

function NearbyMap({ origin, onChangeOrigin }: { origin: Origin; onChangeOrigin: () => void }) {
  const { user, isVerified } = useAuth();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);
  const [points, setPoints] = useState<PointView[]>([]);
  const [load, setLoad] = useState<Load>({ kind: 'idle' });
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const fetchPoints = useCallback(async () => {
    setLoad({ kind: 'loading' });
    try {
      const nearby = await api.points.searchNearby(origin, radiusKm, MAX_POINTS);
      const extras = await api.points.getPointExtras(nearby.map((p) => p.id));
      const views = nearby.map((p) => toPointView(p, extras.get(p.id), origin));
      setPoints(views);
      setSelectedId(views[0]?.id ?? null);
      setLoad({ kind: 'ready' });
      saveNearby(nearby, extras);
    } catch (e) {
      const err = toApiError(e);
      const cached = err.isNetwork ? await loadNearby() : null;
      if (cached) {
        const views = cached.points
          .map((p) => toPointView(p, cached.extras.get(p.id), origin))
          .sort((a, b) => a.distanceM - b.distanceM);
        setPoints(views);
        setSelectedId(views[0]?.id ?? null);
        setLoad({ kind: 'offline', savedAt: cached.savedAt });
      } else {
        setLoad({ kind: 'error', message: err.message });
      }
    }
  }, [origin, radiusKm]);

  useEffect(() => {
    fetchPoints();
  }, [fetchPoints]);

  const visible = useMemo(() => {
    switch (filter) {
      case 'blueBin':
        return points.filter((p) => p.stream === 'blueBin');
      case 'eWaste':
        return points.filter((p) => p.stream === 'eWaste');
      case 'openNow':
        return points.filter((p) => p.open.kind === 'open');
      default:
        return points;
    }
  }, [points, filter]);

  const selected = visible.find((p) => p.id === selectedId) ?? visible[0] ?? null;
  const hoursUnknown = filter === 'openNow' && points.length > 0 && points.every((p) => p.open.kind === 'unknown');

  const search = () => {
    const q = query.trim();
    if (q) router.push(withOrigin('/find/search', origin, { q }));
  };

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.top}>
        <View style={styles.titleRow}>
          <AppText variant="title" accessibilityRole="header" numberOfLines={1} style={styles.fill}>
            {origin.label}
          </AppText>
          <IconButton icon="list" label="Nearest points list" onPress={() => router.push(withOrigin('/find/search', origin))} />
        </View>
        <Button label="Change search location" variant="secondary" onPress={onChangeOrigin} />
        <TextField
          icon="search"
          placeholder="What are you recycling?"
          accessibilityLabel="What are you recycling?"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={search}
          returnKeyType="search"
          autoCorrect={false}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {FILTERS.map((f) => (
            <Chip key={f.key} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} />
          ))}
        </ScrollView>
        {load.kind === 'offline' && (
          <Banner tone="info">
            <AppText variant="small">
              <AppText variant="small" style={styles.bold}>
                Offline.
              </AppText>{' '}
              Showing points saved on {formatSavedAt(load.savedAt)}. Distances still work — they are computed on your
              device.
            </AppText>
          </Banner>
        )}
        {hoursUnknown && (
          <Banner tone="info">Opening hours aren't listed for these points yet, so none can be confirmed as open now.</Banner>
        )}
      </View>

      <View style={styles.fill}>
        <RecycleMap
          center={origin}
          markers={visible.map((p) => ({ id: p.id, title: p.title, latitude: p.latitude, longitude: p.longitude, kind: p.stream }))}
          selectedId={selected?.id}
          user={origin.source === 'gps' ? origin : null}
          onMarkerPress={setSelectedId}
        />

        <View style={styles.overlay} pointerEvents="box-none">
          {load.kind === 'loading' && (
            <View style={styles.statusPill} accessibilityLiveRegion="polite">
              <ActivityIndicator color={colors.text} size="small" />
              <AppText variant="small">Finding points {origin.source === 'gps' ? 'near you' : `near ${origin.label}`}…</AppText>
            </View>
          )}
          {load.kind === 'error' && (
            <View style={styles.card}>
              <Banner tone="error" title="Couldn't load recycling points">
                {load.message}
              </Banner>
              <Button label="Try again" onPress={fetchPoints} />
            </View>
          )}
          {(load.kind === 'ready' || load.kind === 'offline') && visible.length === 0 && !hoursUnknown && (
            <View style={styles.card}>
              <EmptyState
                icon="map-pin"
                title={points.length === 0 ? `No recycling points within ${radiusKm} km` : 'No points match this filter'}
                message={
                  points.length === 0
                    ? 'Try a wider search, or search for the item you want to recycle.'
                    : 'Switch back to All to see every nearby point.'
                }
              />
              {points.length === 0 && radiusKm < WIDER_RADIUS_KM && (
                <Button label={`Search within ${WIDER_RADIUS_KM} km`} onPress={() => setRadiusKm(WIDER_RADIUS_KM)} />
              )}
              {points.length > 0 && <Button label="Show all" variant="secondary" onPress={() => setFilter('all')} />}
            </View>
          )}
          {selected && load.kind !== 'loading' && load.kind !== 'error' && (
            <PointCard
              point={selected}
              offline={load.kind === 'offline'}
              canCheckIn={!!user && isVerified && origin.source === 'gps'}
              signedIn={!!user}
              originIsGps={origin.source === 'gps'}
              origin={origin}
            />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

function PointCard({
  point,
  offline,
  canCheckIn,
  signedIn,
  originIsGps,
  origin,
}: {
  point: PointView;
  origin: Origin;
  offline: boolean;
  canCheckIn: boolean;
  signedIn: boolean;
  originIsGps: boolean;
}) {
  const here = originIsGps && point.distanceM < 15;
  const checkInLabel = !signedIn
    ? 'Log in to check in'
    : !originIsGps
      ? 'Check-in needs location'
      : canCheckIn
        ? 'Check in'
        : 'Verify email to check in';

  return (
    <View style={styles.card} accessibilityLabel={`${point.title}, ${formatDistance(point.distanceM)} away`}>
      <Pressable style={styles.cardRow} onPress={() => router.push(withOrigin(`/find/point/${point.id}`, origin))} accessibilityRole="button">
        <PointTypeTile stream={point.stream} />
        <View style={styles.fill}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {point.title}
          </AppText>
          <AppText variant="small" color="textMuted" numberOfLines={1}>
            {point.subtitle}
          </AppText>
        </View>
        <View style={styles.distance}>
          <AppText variant="bodyStrong">{formatDistance(point.distanceM)}</AppText>
          <AppText variant="caption" color="textMuted">
            {here ? 'HERE' : `~${walkingMinutes(point.distanceM)} MIN`}
          </AppText>
        </View>
      </Pressable>
      <View style={styles.cardDivider} />
      <View style={styles.cardRow}>
        <View style={styles.materialRow}>
          {point.materials.length === 0 ? (
            <AppText variant="small" color="textFaint">
              Accepted materials not listed
            </AppText>
          ) : (
            point.materials.map((m) => <MaterialTile key={m} name={m} />)
          )}
        </View>
        <AppText variant="small" color={!offline && point.open.kind === 'open' ? 'success' : 'textMuted'}>
          {offline ? 'Cached' : openLabel(point.open)}
        </AppText>
      </View>
      {point.status !== 'Available' && (
        <AppText variant="small" color={point.status === 'Information Outdated' ? 'textFaint' : 'warning'}>
          Status: {point.status}
        </AppText>
      )}
      {offline ? (
        <Banner tone="warning">Check-in needs a connection — try again when you're back online.</Banner>
      ) : (
        <View style={styles.actions}>
          <Button label="Details" variant="secondary" style={styles.fill} onPress={() => router.push(withOrigin(`/find/point/${point.id}`, origin))} />
          <Button
            label={checkInLabel}
            style={styles.fill}
            disabled={signedIn && !canCheckIn}
            onPress={() => router.push(signedIn ? `/find/check-in/${point.id}` : '/login')}
          />
        </View>
      )}
    </View>
  );
}

/** UC 2.1.EX.3 / mockup "Location is switched off": discovery still works by address; check-in does not. */
function LocationOff({
  locationEnabled,
  canAskAgain,
  error,
  onTurnOn,
  onAddress,
  home,
  onHome,
}: {
  locationEnabled: boolean;
  canAskAgain: boolean;
  error?: string;
  onTurnOn: () => void;
  onAddress: (a: AddressResult) => void;
  home: HomeLocation | null;
  onHome: () => void;
}) {
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<AddressResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [searchError, setSearchError] = useState<string>();

  const lookUp = async () => {
    if (!q.trim()) return;
    setBusy(true);
    setSearchError(undefined);
    try {
      setResults(await api.onemap.searchAddress(q));
    } catch (e) {
      setSearchError(toApiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const blockedOnWeb = Platform.OS === 'web' && !canAskAgain;

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <ScrollView contentContainerStyle={styles.offPage} keyboardShouldPersistTaps="handled">
        <AppText variant="title" accessibilityRole="header">
          Find
        </AppText>
        {!searching ? (
          <>
            <EmptyState
              icon="map-pin"
              title={locationEnabled ? 'Choose search location' : 'Location is switched off'}
              message="Find recycling points around your current location or another address in Singapore."
            />
            {error && <Banner tone="warning">{error}</Banner>}
            {blockedOnWeb && (
              <Banner tone="info">Location is blocked for this site. Allow it in your browser's site settings, then reload.</Banner>
            )}
            <Button label={locationEnabled ? 'Use current location' : canAskAgain || Platform.OS === 'web' ? 'Turn on location' : 'Open settings'} onPress={onTurnOn} />
            {home && <Button label={`Use home: ${home.label}`} variant="secondary" onPress={onHome} />}
            <Button label="Search by address instead" variant="secondary" onPress={() => setSearching(true)} />
          </>
        ) : (
          <>
            <TextField
              label="Address or postal code"
              icon="search"
              placeholder="e.g. 560409 or Ang Mo Kio Ave 10"
              value={q}
              onChangeText={setQ}
              onSubmitEditing={lookUp}
              returnKeyType="search"
              autoFocus
            />
            <Button label="Search" onPress={lookUp} loading={busy} />
            {searchError && <Banner tone="error">{searchError}</Banner>}
            {results?.length === 0 && <Banner tone="info">No matching address. Try a postal code.</Banner>}
            {results?.map((r) => (
              <Pressable
                key={`${r.latitude},${r.longitude},${r.address}`}
                onPress={() => onAddress(r)}
                accessibilityRole="button"
                style={styles.addressRow}
              >
                <Feather name="map-pin" size={18} color={colors.textMuted} />
                <AppText variant="small" style={styles.fill}>
                  {r.address}
                </AppText>
              </Pressable>
            ))}
            <Button label="Back" variant="ghost" onPress={() => setSearching(false)} />
          </>
        )}
        <Banner tone="info">
          Search around any address in Singapore. Check-in uses your current GPS location.
        </Banner>
      </ScrollView>
    </SafeAreaView>
  );
}

function IconButton({ icon, label, onPress }: { icon: 'list' | 'crosshair'; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button" accessibilityLabel={label} style={styles.iconBtn}>
      <Feather name={icon} size={20} color={colors.text} />
    </Pressable>
  );
}

function Centered({ label }: { label: string }) {
  return (
    <View style={[styles.root, styles.centered]}>
      <ActivityIndicator color={colors.text} />
      <AppText color="textMuted">{label}</AppText>
    </View>
  );
}

// The header truncates long labels itself (numberOfLines={1}).
const shortLabel = (a: AddressResult) => titleCase(a.label);
const formatSavedAt = (d: Date) =>
  d.toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  fill: { flex: 1 },
  bold: { fontWeight: '700' },
  centered: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  top: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md, gap: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconBtn: { padding: spacing.xs },
  chips: { gap: spacing.sm },
  overlay: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg, gap: spacing.md },
  statusPill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardDivider: { height: 1, backgroundColor: colors.border },
  distance: { alignItems: 'flex-end' },
  typeTile: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  materialRow: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  materialTile: { width: 30, height: 30, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: spacing.md },
  offPage: { padding: spacing.xl, gap: spacing.lg },
  addressRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
});
