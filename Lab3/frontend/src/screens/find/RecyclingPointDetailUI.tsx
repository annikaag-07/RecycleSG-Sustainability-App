import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';

import { api, toApiError, type MaterialType } from '@/shared/api';
import type { PointDetailWithSchedule } from '@/shared/api/points';
import { useAuth } from '@/shared/auth/AuthProvider';
import { AppText, Banner, Button, Card, Chip, EmptyState, Header, Screen } from '@/shared/components';
import { distanceMeters } from '@/shared/geo';
import { formatWeeklyHours, openLabel, openState, openStateFromServer } from '@/shared/hours';
import { pointStream } from '@/shared/materials';
import { colors, spacing } from '@/shared/theme';
import { isFavourite, toggleFavourite } from './favourites';
import { loadNearby } from './nearbyCache';
import { DistanceLabel, PointTypeTile } from './PointBits';
import { isUnavailable, pointTitle } from './pointDisplay';
import { useOrigin, withOrigin, type OriginParams } from './useOrigin';

type Params = OriginParams & { id: string };
type Load =
  | { kind: 'loading' }
  /** `isOpen` is the server's answer for now (undefined if that call failed or the data is cached). */
  | { kind: 'ready'; point: PointDetailWithSchedule; cachedAt?: Date; isOpen?: boolean | null }
  | { kind: 'notFound' }
  | { kind: 'error'; message: string };

/** UC 2.2: what this point accepts, what it doesn't, when it's open, and how to get there. */
export default function RecyclingPointDetailUI() {
  const params = useLocalSearchParams<Params>();
  const id = Number(params.id);
  const { origin } = useOrigin(params);
  const { user, isVerified } = useAuth();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [allMaterials, setAllMaterials] = useState<MaterialType[]>([]);
  const [favourite, setFavourite] = useState(false);
  const [favNote, setFavNote] = useState<string>();

  const fetchPoint = useCallback(async () => {
    if (!Number.isInteger(id)) {
      setLoad({ kind: 'notFound' });
      return;
    }
    setLoad({ kind: 'loading' });
    try {
      const [point, materials, isOpen] = await Promise.all([
        api.points.getPointDetail(id),
        api.points.listMaterialTypes(),
        // Optional extra: if it fails the screen falls back to the hours text instead of failing.
        api.points.isOpenNow(id).catch(() => undefined),
      ]);
      setAllMaterials(materials);
      setLoad({ kind: 'ready', point, isOpen });
    } catch (e) {
      const err = toApiError(e);
      if (err.code === 'PGRST116') return setLoad({ kind: 'notFound' }); // .single() found no row
      // UC 2.2.EX.4: fall back to what the last nearby search saved.
      const cached = err.isNetwork ? await loadNearby() : null;
      const hit = cached?.points.find((p) => p.id === id);
      if (cached && hit) {
        const extras = cached.extras.get(id);
        setLoad({
          kind: 'ready',
          cachedAt: cached.savedAt,
          point: {
            ...hit,
            operating_hours: extras?.operatingHours ?? null,
            source: null,
            last_updated: cached.savedAt.toISOString(),
            materials: (extras?.materials ?? []).map((name, i) => ({ id: -i - 1, name, description: null })),
          },
        });
      } else {
        setLoad({ kind: 'error', message: err.message });
      }
    }
  }, [id]);

  useEffect(() => {
    fetchPoint();
  }, [fetchPoint]);

  useEffect(() => {
    if (user && Number.isInteger(id)) isFavourite(user.id, id).then(setFavourite);
  }, [user, id]);

  const onStar = async (title: string) => {
    if (!user) {
      // UC 2.2.AC.2: favourites need an account.
      router.push('/login');
      return;
    }
    const now = await toggleFavourite(user.id, id, title);
    setFavourite(now);
    setFavNote(now ? 'Saved to favourites on this device.' : 'Removed from favourites.');
  };

  if (load.kind === 'loading') {
    return (
      <Screen>
        <Header leading="back" />
        <View style={styles.centered}>
          <ActivityIndicator color={colors.text} />
        </View>
      </Screen>
    );
  }
  if (load.kind === 'notFound') {
    return (
      <Screen>
        <Header leading="back" />
        <EmptyState icon="map-pin" title="This point is no longer listed" message="It may have been removed or deactivated. Go back to pick another nearby point." />
      </Screen>
    );
  }
  if (load.kind === 'error') {
    return (
      <Screen>
        <Header leading="back" />
        <Banner tone="error" title="Couldn't load this point">
          {load.message}
        </Banner>
        <Button label="Try again" onPress={fetchPoint} />
      </Screen>
    );
  }

  const { point, cachedAt } = load;
  const { title, subtitle } = pointTitle(point.name, point.address);
  const accepted = point.materials.map((m) => m.name);
  const notAccepted = accepted.length ? allMaterials.map((m) => m.name).filter((n) => !accepted.includes(n)) : [];
  const stream = pointStream(accepted);
  const open =
    !cachedAt && load.isOpen !== undefined
      ? openStateFromServer(load.isOpen, point.operating_hours)
      : openState(point.operating_hours);
  const schedule = formatWeeklyHours(point.weekly_hours);
  const distance = origin ? distanceMeters(origin, point) : null;
  const canCheckIn = !!user && isVerified && origin?.source === 'gps' && !cachedAt && !isUnavailable(point.status);

  return (
    <Screen scroll>
      <Header
        leading="back"
        trailing={
          <Pressable
            onPress={() => onStar(title)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={favourite ? 'Remove from favourites' : 'Save to favourites'}
            accessibilityState={{ selected: favourite }}
          >
            <Feather name="star" size={24} color={favourite ? colors.eWaste : colors.text} />
          </Pressable>
        }
      />
      {favNote && <Banner tone="info">{favNote}</Banner>}

      <View style={styles.titleRow}>
        <PointTypeTile stream={stream} />
        <View style={styles.fill}>
          <AppText variant="heading" accessibilityRole="header">
            {title}
          </AppText>
          <AppText variant="small" color="textMuted">
            {subtitle}
          </AppText>
        </View>
        <DistanceLabel meters={distance} here={distance != null && distance < 15} />
      </View>
      {point.source && (
        <AppText variant="caption" color="textMuted">
          ● {point.source}
        </AppText>
      )}

      {cachedAt && (
        <Banner tone="info">
          Offline — showing details saved on {cachedAt.toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}.
        </Banner>
      )}
      {point.status !== 'Available' && (
        <Banner tone={isUnavailable(point.status) || point.status === 'Full' ? 'warning' : 'info'} title={`Status: ${point.status}`}>
          {point.status === 'Information Outdated'
            ? 'The source dataset marks this information as outdated. Check the bin on arrival, and report it if something is wrong.'
            : 'This point may not be usable right now. Consider another nearby point.'}
        </Banner>
      )}

      <Card label="Accepted here">
        {accepted.length ? (
          <View style={styles.chips}>
            {accepted.map((m) => (
              <Chip key={m} label={m} selected />
            ))}
          </View>
        ) : (
          // UC 2.2.EX.5: missing data must not read as "nothing is accepted".
          <AppText color="textMuted">Accepted materials aren't listed for this point.</AppText>
        )}
        {point.source && (
          <AppText variant="small" color="textFaint">
            From the {point.source} dataset, last updated{' '}
            {new Date(point.last_updated).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}.
          </AppText>
        )}
      </Card>

      {notAccepted.length > 0 && (
        <Card label="Not accepted — take these elsewhere">
          <View style={styles.chips}>
            {notAccepted.map((m) => (
              <Chip key={m} label={m} tone="notAccepted" />
            ))}
          </View>
        </Card>
      )}

      <Card label="Opening hours">
        <View style={styles.hoursRow}>
          <Feather name="clock" size={18} color={open.kind === 'open' ? colors.success : colors.textMuted} />
          <AppText color={open.kind === 'open' ? 'success' : 'textMuted'} style={styles.bold}>
            {open.kind === 'unknown'
              ? schedule && schedule.length === 0
                ? 'Closed all week'
                : 'Opening hours aren’t listed for this point'
              : openLabel(open)}
          </AppText>
        </View>
        {schedule && schedule.length > 0 && (
          <View accessibilityLabel={`Weekly hours: ${schedule.join('; ')}`} accessible>
            {schedule.map((line) => (
              <AppText key={line} color="textMuted">
                {line}
              </AppText>
            ))}
          </View>
        )}
        {point.operating_hours && <AppText color="textMuted">{point.operating_hours}</AppText>}
        {schedule && (
          <AppText variant="small" color="textFaint">
            Singapore time.
          </AppText>
        )}
      </Card>

      <View style={styles.actions}>
        <Button
          label="Directions"
          icon="navigation"
          style={styles.fill}
          onPress={() => router.push(withOrigin(`/find/directions/${point.id}`, origin))}
        />
        <Pressable
          onPress={() => (user ? router.push({ pathname: '/find/report/[id]', params: { id: String(point.id), title } }) : router.push('/login'))}
          accessibilityRole="button"
          accessibilityLabel="Report a problem with this point"
          style={styles.flagBtn}
        >
          <Feather name="flag" size={20} color={colors.text} />
        </Pressable>
      </View>
      <Button
        label={checkInLabel({ signedIn: !!user, isVerified, hasGps: origin?.source === 'gps', offline: !!cachedAt, unavailable: isUnavailable(point.status) })}
        variant="secondary"
        disabled={!!user && !canCheckIn}
        onPress={() => router.push(user ? `/find/check-in/${point.id}` : '/login')}
      />
    </Screen>
  );
}

/** Says *why* check-in is unavailable rather than just greying it out. */
function checkInLabel(s: { signedIn: boolean; isVerified: boolean; hasGps: boolean; offline: boolean; unavailable: boolean }) {
  if (!s.signedIn) return 'Log in to check in';
  if (s.offline) return 'Check-in needs a connection';
  if (!s.hasGps) return 'Check-in needs location';
  if (!s.isVerified) return 'Verify your email to check in';
  if (s.unavailable) return 'This point is unavailable';
  return 'Check in here';
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bold: { fontWeight: '600' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  hoursRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.md },
  flagBtn: {
    width: 52,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
