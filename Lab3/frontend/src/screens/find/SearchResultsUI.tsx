import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { api, toApiError, type MaterialType, type NearbyRecyclingPoint } from '@/shared/api';
import { AppText, Banner, Chip, EmptyState, Header, Screen, TextField } from '@/shared/components';
import { formatDistance } from '@/shared/geo';
import { matchItem, SUGGESTED_SEARCHES, type ItemMatch } from '@/shared/itemCatalog';
import { materialMeta, type Stream } from '@/shared/materials';
import { colors, radius, spacing } from '@/shared/theme';
import { PointRow } from './PointBits';
import { toPointView, type PointView } from './pointDisplay';
import { useOrigin, withOrigin, type Origin, type OriginParams } from './useOrigin';

type Params = OriginParams & { q?: string; material?: string };
type Filter = 'all' | 'blueBin' | 'eWaste' | 'openNow';
type Load = { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; message: string };

const ITEM_RADIUS_KM = 5;
const ITEM_LIMIT = 100;
const NEAREST_RADIUS_KM = 1;
const NEAREST_LIMIT = 50;

const SECTION_TITLES: Record<Stream, string> = {
  blueBin: 'Blue bin · paper, plastic, glass, metal',
  eWaste: 'E-waste · specific materials only',
  other: 'Other collection points',
};

/**
 * Two modes (UC 2.1):
 *  - `q` set: item search — classify the item, warn if it isn't blue-bin waste, list points that accept it.
 *  - no `q`: "Nearest points" list grouped by type (UC 2.1.AC.3).
 */
export default function SearchResultsUI() {
  const params = useLocalSearchParams<Params>();
  const { origin, resolving } = useOrigin(params);
  const [query, setQuery] = useState(params.q ?? '');

  useEffect(() => setQuery(params.q ?? ''), [params.q]);

  const submit = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setQuery(trimmed);
    router.setParams({ q: trimmed, material: '' });
  };

  const isItemSearch = !!params.q?.trim() || !!params.material;

  return (
    <Screen scroll>
      <Header title={isItemSearch ? undefined : 'Nearest points'} leading="back" />
      <TextField
        icon="search"
        placeholder="What are you recycling?"
        accessibilityLabel="What are you recycling?"
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={() => submit(query)}
        returnKeyType="search"
        autoCorrect={false}
        autoFocus={!isItemSearch}
      />
      {resolving ? (
        <Loading label="Finding your location…" />
      ) : isItemSearch ? (
        <ItemResults q={params.q?.trim() ?? ''} forcedMaterial={params.material} origin={origin} onSuggest={submit} />
      ) : (
        <NearestList origin={origin} />
      )}
    </Screen>
  );
}

function ItemResults({
  q,
  forcedMaterial,
  origin,
  onSuggest,
}: {
  q: string;
  forcedMaterial?: string;
  origin: Origin | null;
  onSuggest: (q: string) => void;
}) {
  const match: ItemMatch | null = forcedMaterial ? { material: forcedMaterial } : matchItem(q);
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [results, setResults] = useState<PointView[]>([]);
  const [skipped, setSkipped] = useState<PointView | null>(null);
  const [materials, setMaterials] = useState<MaterialType[]>([]);

  const run = useCallback(async () => {
    if (!match) {
      // UC 2.1.EX.1: don't guess — let the user pick a category.
      setLoad({ kind: 'loading' });
      try {
        setMaterials(await api.points.listMaterialTypes());
        setLoad({ kind: 'ready' });
      } catch (e) {
        setLoad({ kind: 'error', message: toApiError(e).message });
      }
      return;
    }
    setLoad({ kind: 'loading' });
    try {
      if (origin) {
        const nearby = await api.points.searchNearby(origin, ITEM_RADIUS_KM, ITEM_LIMIT);
        const extras = await api.points.getPointExtras(nearby.map((p) => p.id));
        const views = nearby.map((p) => toPointView(p, extras.get(p.id), origin)).sort((a, b) => a.distanceM - b.distanceM);
        const accepting = views.filter((p) => p.materials.includes(match.material));
        setResults(accepting);
        // UC 2.1 step 7: explain a nearer point of the same kind that was filtered out.
        const stream = materialMeta(match.material).stream;
        const nearest = accepting[0];
        setSkipped(
          views.find(
            (p) => p.stream === stream && !p.materials.includes(match.material) && (!nearest || p.distanceM < nearest.distanceM),
          ) ?? null,
        );
      } else {
        // No location: the material search RPC works but cannot sort by distance.
        const rows = await api.points.searchByMaterial(match.material, 0, 20);
        const extras = await api.points.getPointExtras(rows.map((p) => p.id));
        setResults(
          rows.map((p) => toPointView({ ...p, distance_km: 0 } as NearbyRecyclingPoint, extras.get(p.id), p)),
        );
        setSkipped(null);
      }
      setLoad({ kind: 'ready' });
    } catch (e) {
      setLoad({ kind: 'error', message: toApiError(e).message });
    }
  }, [match?.material, origin?.latitude, origin?.longitude]);

  useEffect(() => {
    run();
  }, [run]);

  if (!match) {
    return (
      <>
        <Banner tone="info" title={`We couldn't identify "${q}"`}>
          Pick the closest material below and we'll find points that take it.
        </Banner>
        {load.kind === 'loading' && <Loading label="Loading materials…" />}
        {load.kind === 'error' && <ErrorState message={load.message} onRetry={run} />}
        <View style={styles.wrap}>
          {materials.map((m) => (
            <Chip key={m.id} label={m.name} onPress={() => router.setParams({ material: m.name })} />
          ))}
        </View>
        <Suggestions onPick={onSuggest} />
      </>
    );
  }

  return (
    <>
      {match.warning && (
        <Banner tone="error" title={match.warning.title}>
          {match.warning.body}
        </Banner>
      )}
      <AppText variant="small" color="textMuted">
        Matched to <AppText variant="small" style={styles.bold}>{match.material}</AppText>
        {forcedMaterial ? '' : ` from "${q}"`}.
      </AppText>
      {match.tip && <Banner tone="info">{match.tip}</Banner>}
      {!origin && (
        <Banner tone="info">Location is off, so these aren't sorted by distance. Turn it on in Find to see the nearest.</Banner>
      )}

      <AppText variant="label" color="textMuted">
        Take it to
      </AppText>
      {load.kind === 'loading' && <Loading label={origin ? `Finding points ${origin.source === 'gps' ? 'near you' : `near ${origin.label}`}…` : 'Searching…'} />}
      {load.kind === 'error' && <ErrorState message={load.message} onRetry={run} />}
      {load.kind === 'ready' && results.length === 0 && (
        // UC 2.1.EX.2
        <EmptyState
          icon="map-pin"
          title={origin ? `No point within ${ITEM_RADIUS_KM} km takes ${match.material.toLowerCase()}` : `No points listed for ${match.material.toLowerCase()}`}
          message="Recycling-point data for this material may not be loaded yet. Try another material or check NEA's guidance for national collection channels."
        />
      )}
      {load.kind === 'ready' &&
        results.map((p) => (
          <PointRow key={p.id} point={p} showDistance={!!origin} onPress={() => router.push(withOrigin(`/find/point/${p.id}`, origin))} />
        ))}
      {load.kind === 'ready' && skipped && (
        <Banner tone="warning">
          <AppText variant="small">
            <AppText variant="small" style={styles.bold}>
              {skipped.title}
            </AppText>{' '}
            is closer at {formatDistance(skipped.distanceM)} but takes{' '}
            {skipped.materials.length ? skipped.materials.join(', ').toLowerCase() : 'other materials'} only. It is filtered out
            rather than ranked low.
          </AppText>
        </Banner>
      )}
      <Suggestions onPick={onSuggest} />
    </>
  );
}

function NearestList({ origin }: { origin: Origin | null }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [points, setPoints] = useState<PointView[]>([]);

  const run = useCallback(async () => {
    if (!origin) return;
    setLoad({ kind: 'loading' });
    try {
      const nearby = await api.points.searchNearby(origin, NEAREST_RADIUS_KM, NEAREST_LIMIT);
      const extras = await api.points.getPointExtras(nearby.map((p) => p.id));
      setPoints(nearby.map((p) => toPointView(p, extras.get(p.id), origin)).sort((a, b) => a.distanceM - b.distanceM));
      setLoad({ kind: 'ready' });
    } catch (e) {
      setLoad({ kind: 'error', message: toApiError(e).message });
    }
  }, [origin?.latitude, origin?.longitude]);

  useEffect(() => {
    run();
  }, [run]);

  const sections = useMemo(() => {
    const visible = points.filter((p) =>
      filter === 'all' ? true : filter === 'openNow' ? p.open.kind === 'open' : p.stream === filter,
    );
    return (['blueBin', 'eWaste', 'other'] as Stream[])
      .map((s) => ({ stream: s, items: visible.filter((p) => p.stream === s) }))
      .filter((s) => s.items.length > 0);
  }, [points, filter]);

  if (!origin) {
    return (
      <EmptyState
        icon="map-pin"
        title="Location is switched off"
        message="Nearest points need your location or an address. Go back to Find to turn on location or search an address — or search for an item above."
      />
    );
  }

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {(['all', 'blueBin', 'eWaste', 'openNow'] as Filter[]).map((f) => (
          <Chip
            key={f}
            label={{ all: 'All', blueBin: 'Blue bin', eWaste: 'E-waste', openNow: 'Open now' }[f]}
            selected={filter === f}
            onPress={() => setFilter(f)}
          />
        ))}
      </ScrollView>
      {load.kind === 'loading' && (
        <Loading label={`Finding points ${origin.source === 'gps' ? 'near you' : `near ${origin.label}`}…`} skeleton />
      )}
      {load.kind === 'error' && <ErrorState message={load.message} onRetry={run} />}
      {load.kind === 'ready' && points.length === 0 && (
        <EmptyState icon="map-pin" title={`No recycling points within ${NEAREST_RADIUS_KM} km`} message="Try searching for the item you want to recycle." />
      )}
      {load.kind === 'ready' && points.length > 0 && sections.length === 0 && (
        <Banner tone="info">
          {filter === 'openNow'
            ? "Opening hours aren't listed for these points yet, so none can be confirmed as open now."
            : 'No nearby points of this type.'}
        </Banner>
      )}
      {sections.map((s) => (
        <View key={s.stream} style={styles.section}>
          <AppText variant="label" color="textMuted">
            {SECTION_TITLES[s.stream]}
          </AppText>
          {s.items.map((p) => (
            <PointRow key={p.id} point={p} showDistance onPress={() => router.push(withOrigin(`/find/point/${p.id}`, origin))} />
          ))}
        </View>
      ))}
    </>
  );
}

function Suggestions({ onPick }: { onPick: (q: string) => void }) {
  return (
    <View style={styles.suggestBox}>
      <AppText variant="label" color="textMuted">
        Also searched
      </AppText>
      <View style={styles.wrap}>
        {SUGGESTED_SEARCHES.map((s) => (
          <Chip key={s} label={s} onPress={() => onPick(s)} />
        ))}
      </View>
    </View>
  );
}

function Loading({ label, skeleton }: { label: string; skeleton?: boolean }) {
  return (
    <View style={styles.section} accessibilityLiveRegion="polite">
      <View style={styles.loadingRow}>
        <ActivityIndicator color={colors.text} size="small" />
        <AppText variant="small" color="textMuted">
          {label}
        </AppText>
      </View>
      {skeleton &&
        [0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.skeletonRow}>
            <View style={styles.skeletonTile} />
            <View style={styles.fill}>
              <View style={[styles.skeletonBar, { width: '45%' }]} />
              <View style={[styles.skeletonBar, { width: '70%' }]} />
            </View>
          </View>
        ))}
    </View>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.section}>
      <Banner tone="error" title="Couldn't load results">
        {message}
      </Banner>
      <Chip label="Try again" onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, gap: spacing.sm },
  bold: { fontWeight: '700', color: colors.text },
  chips: { gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  section: { gap: spacing.sm },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  suggestBox: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, marginTop: spacing.md },
  skeletonRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', paddingVertical: spacing.sm },
  skeletonTile: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised },
  skeletonBar: { height: 12, borderRadius: 6, backgroundColor: colors.surfaceRaised },
});
