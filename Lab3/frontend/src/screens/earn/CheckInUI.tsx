import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';

import { api, toApiError, type CheckIn, type PointStatus } from '@/shared/api';
import { useAuth } from '@/shared/auth/AuthProvider';
import { AppText, Banner, Button, EmptyState, Header, Screen } from '@/shared/components';
import { distanceMeters, formatDistance } from '@/shared/geo';
import { getCurrentFix, getLocationPermission, openAppSettings, requestLocationPermission, type Fix } from '@/shared/location';
import { pointStream, type Stream } from '@/shared/materials';
import { colors, radius, spacing } from '@/shared/theme';
import { PointTypeTile } from '@/screens/find/PointBits';
import { isUnavailable, pointTitle } from '@/screens/find/pointDisplay';
import {
  CHECK_IN_COOLDOWN_MIN,
  CHECK_IN_RADIUS_M,
  DAILY_CHECK_IN_LIMIT,
  cooldownEndsAt,
  nextUtcMidnight,
  startOfUtcDay,
} from './rules';
import { clockTime, timeAgo, useNow } from './time';

type Candidate = { id: number; title: string; distanceM: number; stream: Stream; tied: boolean };
/** The point the user tapped Check in on. `null` when it's no longer listed (UC 3.1.EX.7). */
type Target = { id: number; title: string; distanceM: number; status: PointStatus } | null;

type Load =
  | { kind: 'locating' }
  | { kind: 'noPermission'; canAskAgain: boolean }
  | { kind: 'imprecise'; accuracyM: number }
  | { kind: 'error'; message: string; offline: boolean }
  | { kind: 'ready'; fix: Fix; target: Target; candidates: Candidate[]; history: CheckIn[] };

/** UC 3.1: confirm which bin you're at, then hand over to LogRecyclingUI. A check-in on its own earns nothing. */
export default function CheckInUI() {
  const { pointId: pointIdParam } = useLocalSearchParams<{ pointId: string }>();
  const pointId = Number(pointIdParam);
  const { user, isVerified } = useAuth();
  const now = useNow();
  const [load, setLoad] = useState<Load>({ kind: 'locating' });
  const [selectedId, setSelectedId] = useState<number>();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();

  const locate = useCallback(
    async (ask: boolean) => {
      setLoad({ kind: 'locating' });
      setSubmitError(undefined);
      try {
        // NFR-SEC-04: permission before any position is read. The user just tapped Check in, so asking is expected.
        let permission = await getLocationPermission();
        if (permission.status !== 'granted' && ask && permission.canAskAgain) permission = await requestLocationPermission();
        if (permission.status !== 'granted') return setLoad({ kind: 'noPermission', canAskAgain: permission.canAskAgain });

        const fix = await getCurrentFix();
        // UC 3.1.EX.3: a fix wider than the radius can't place the user at any bin.
        if (fix.accuracyMeters != null && fix.accuracyMeters > CHECK_IN_RADIUS_M) {
          return setLoad({ kind: 'imprecise', accuracyM: fix.accuracyMeters });
        }

        const [targetPoint, nearby, history] = await Promise.all([
          Number.isInteger(pointId) ? api.points.getPointDetail(pointId).catch(nullIfNotFound) : Promise.resolve(null),
          api.points.searchNearby(fix, CHECK_IN_RADIUS_M / 1000, 10),
          api.checkins.listMyCheckIns(50),
        ]);
        const usable = nearby.filter((p) => !isUnavailable(p.status));
        const extras = await api.points.getPointExtras(usable.map((p) => p.id));

        // Same Haversine formula as create_gps_checkin, so "in range" here means in range on the server.
        const inRange = usable
          .map((p) => ({ p, d: distanceMeters(fix, p) }))
          .filter((x) => x.d <= CHECK_IN_RADIUS_M)
          .sort((a, b) => a.d - b.d);
        const rounded = inRange.map((x) => Math.round(x.d));
        const candidates = inRange.map((x, i) => ({
          id: x.p.id,
          title: pointTitle(x.p.name, x.p.address).title,
          distanceM: x.d,
          stream: pointStream(extras.get(x.p.id)?.materials ?? []),
          tied: rounded.filter((r) => r === rounded[i]).length > 1,
        }));
        const target = targetPoint && {
          id: targetPoint.id,
          title: pointTitle(targetPoint.name, targetPoint.address).title,
          distanceM: distanceMeters(fix, targetPoint),
          status: targetPoint.status,
        };

        // UC 3.1.AC.3: the point the user came for is pre-selected even when others are tied; otherwise the nearest.
        setSelectedId(candidates.find((c) => c.id === target?.id)?.id ?? candidates[0]?.id);
        setLoad({ kind: 'ready', fix, target, candidates, history });
      } catch (e) {
        const err = toApiError(e);
        setLoad({ kind: 'error', message: err.message, offline: err.isNetwork });
      }
    },
    [pointId],
  );

  useEffect(() => {
    if (user && isVerified) locate(true);
  }, [locate, user, isVerified]);

  // UC 3.1.AC.4: guests are told why, and offered an account.
  if (!user) {
    return (
      <Screen>
        <Header title="Check in" leading="close" />
        <EmptyState
          icon="user-check"
          title="Checking in needs an account"
          message="A check-in is how RecycleSG knows you were at the bin, so it's tied to an account. Finding points works without one."
        />
        <Button label="Create an account" onPress={() => router.push('/register')} />
        <Button label="Log in" variant="secondary" onPress={() => router.push('/login')} />
      </Screen>
    );
  }
  if (!isVerified) {
    return (
      <Screen>
        <Header title="Check in" leading="close" />
        <EmptyState icon="mail" title="Verify your email to check in" message={`Open the link we sent to ${user.email}, then come back here.`} />
      </Screen>
    );
  }

  if (load.kind === 'locating') {
    return (
      <Screen>
        <Header title="Check in" leading="close" />
        <View style={styles.centered}>
          <ActivityIndicator color={colors.text} />
          <AppText color="textMuted">Finding your position…</AppText>
        </View>
      </Screen>
    );
  }
  if (load.kind === 'noPermission') {
    // UC 3.1.EX.2: no check-in without location, because proximity is what makes a check-in count.
    return (
      <Screen>
        <Header title="Check in" leading="close" />
        <EmptyState
          icon="map-pin"
          title="Location is switched off"
          message="RecycleSG needs your location to check you in at a bin. Nothing is stored beyond the check-in itself. You can still find points by address."
        />
        {load.canAskAgain ? (
          <Button label="Allow location" onPress={() => locate(true)} />
        ) : (
          <>
            <Button label="Open settings" onPress={openAppSettings} />
            <Button label="Try again" variant="secondary" onPress={() => locate(false)} />
          </>
        )}
      </Screen>
    );
  }
  if (load.kind === 'imprecise') {
    return (
      <Screen>
        <Header title="Check in" leading="close" />
        <EmptyState
          icon="crosshair"
          title="Waiting for a better GPS fix"
          message={`Your position is only accurate to about ${Math.round(load.accuracyM)} m, which can't place you at a bin. Move into the open, away from tall blocks, and try again.`}
        />
        <Button label="Try again" onPress={() => locate(false)} />
      </Screen>
    );
  }
  if (load.kind === 'error') {
    return (
      <Screen>
        <Header title="Check in" leading="close" />
        {load.offline ? (
          // UC 3.1.EX.5 asks for an offline queue, but the server stamps a check-in when it arrives and only
          // accepts a log within 15 minutes of that, so a queued check-in couldn't be honoured. Say so instead.
          <Banner tone="warning" title="Check-in needs a connection">
            Nothing was recorded. Distances on Find still work offline, but checking in has to reach the server.
          </Banner>
        ) : (
          <Banner tone="error" title="Couldn't check your position">
            {load.message}
          </Banner>
        )}
        <Button label="Try again" onPress={() => locate(false)} />
      </Screen>
    );
  }

  const { target, candidates, history, fix } = load;
  const selected = candidates.find((c) => c.id === selectedId) ?? null;
  const usedToday = history.filter((c) => new Date(c.checked_in_at) >= startOfUtcDay(now)).length;
  const dailyLimitReached = usedToday >= DAILY_CHECK_IN_LIMIT;
  // History is newest first, so the first match is the latest check-in at this bin.
  const lastHere = selected ? history.find((c) => c.recycling_point_id === selected.id) : undefined;
  const cooldownUntil = lastHere ? cooldownEndsAt(lastHere.checked_in_at) : null;
  const coolingDown = !!cooldownUntil && cooldownUntil > now;
  const shownDistance = selected?.distanceM ?? target?.distanceM ?? null;

  const onContinue = async () => {
    if (!selected) return;
    setSubmitting(true);
    setSubmitError(undefined);
    try {
      const checkInId = await api.checkins.createCheckIn(selected.id, fix);
      // Replace, not push: going back from the log screen shouldn't land on a check-in that's already been made.
      router.replace({ pathname: '/find/log/[checkInId]', params: { checkInId: String(checkInId) } });
    } catch (e) {
      // UC 3.1.EX.6: the server is the judge. Its messages ("Too far from recycling point", cooldown, daily limit) are safe to show.
      const err = toApiError(e);
      setSubmitError(err.isNetwork ? 'Check-in needs a connection. Nothing was recorded — try again when you’re back online.' : err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen scroll>
      <Header title="Check in" leading="close" />

      <View style={styles.hero}>
        <View
          style={[styles.ring, { borderColor: selected ? colors.blueBin : colors.warning }]}
          accessible
          accessibilityLabel={shownDistance == null ? 'No bins in range' : `${formatDistance(shownDistance)} away`}
        >
          <AppText variant="title">{shownDistance == null ? '—' : formatDistance(shownDistance)}</AppText>
          <AppText variant="caption" color="textMuted">
            Away
          </AppText>
        </View>
        <AppText variant="heading" accessibilityRole="header">
          {selected ? 'You are in range' : 'You are out of range'}
        </AppText>
        <AppText color="textMuted">Check-in radius is {CHECK_IN_RADIUS_M} m</AppText>
      </View>

      {target === null && Number.isInteger(pointId) && (
        <Banner tone="warning" title="This point is no longer listed">
          {candidates.length ? 'Pick one of the bins in range below instead.' : 'Go back to Find to pick another point.'}
        </Banner>
      )}
      {target && isUnavailable(target.status) && (
        <Banner tone="warning" title={`${target.title} is marked ${target.status}`}>
          {candidates.length ? 'Pick one of the bins in range below instead.' : 'Go back to Find to pick another point.'}
        </Banner>
      )}
      {target && !isUnavailable(target.status) && target.distanceM > CHECK_IN_RADIUS_M && (
        // UC 3.1.EX.1: say how far, and never offer a way to check in anyway.
        <Banner tone="warning" title={`${target.title} is ${formatDistance(target.distanceM)} away`}>
          {candidates.length
            ? 'That’s outside the check-in radius. These bins are in range — or walk closer and refresh.'
            : 'That’s outside the check-in radius. Walk to the bin and refresh your location.'}
        </Banner>
      )}

      {candidates.length > 1 && (
        <Banner tone="info" title="Which bin?">
          {`${candidates.length} bins are within ${CHECK_IN_RADIUS_M} m of you${fix.accuracyMeters != null ? ` (GPS accurate to about ${Math.round(fix.accuracyMeters)} m)` : ''}. ${
            candidates.some((c) => c.tied)
              ? 'Bins marked “tied” are the same distance away, so position alone can’t tell them apart.'
              : 'Position alone isn’t precise enough to tell which one you used.'
          } Confirm the one you used.`}
        </Banner>
      )}

      {candidates.length > 0 && (
        <View accessibilityRole="radiogroup">
          {candidates.map((c) => (
            <CandidateRow
              key={c.id}
              candidate={c}
              chosenOnFind={c.id === target?.id}
              selected={c.id === selectedId}
              onPress={() => setSelectedId(c.id)}
            />
          ))}
        </View>
      )}

      {selected && (
        <View style={[styles.note, coolingDown && { borderColor: colors.warning }]}>
          <Feather name="clock" size={18} color={coolingDown ? colors.warning : colors.textMuted} />
          <AppText variant="small" color={coolingDown ? 'text' : 'textMuted'} style={styles.fill}>
            {coolingDown && lastHere && cooldownUntil
              ? `You checked in at ${selected.title} ${timeAgo(new Date(lastHere.checked_in_at), now)}. The cooldown for the same bin is ${CHECK_IN_COOLDOWN_MIN} min, so the next check-in here is from ${clockTime(cooldownUntil)}.`
              : lastHere
                ? `Last check-in at ${selected.title} was ${timeAgo(new Date(lastHere.checked_in_at), now)}. The cooldown for the same bin is ${CHECK_IN_COOLDOWN_MIN} min.`
                : `The cooldown for the same bin is ${CHECK_IN_COOLDOWN_MIN} min.`}
          </AppText>
        </View>
      )}
      {dailyLimitReached && (
        <Banner tone="warning" title="Daily check-in limit reached">
          {`You've used all ${DAILY_CHECK_IN_LIMIT} check-ins for today. The limit resets at ${clockTime(nextUtcMidnight(now))}.`}
        </Banner>
      )}

      {submitError && (
        <Banner tone="error" title="Check-in not recorded">
          {submitError}
        </Banner>
      )}

      <Button
        label={
          !selected
            ? 'Out of range'
            : dailyLimitReached
              ? 'Daily limit reached'
              : coolingDown && cooldownUntil
                ? `Available from ${clockTime(cooldownUntil)}`
                : 'Continue — log your recycling'
        }
        disabled={!selected || dailyLimitReached || coolingDown}
        loading={submitting}
        onPress={onContinue}
      />
      <View style={styles.secondary}>
        <Button label="Refresh location" icon="refresh-cw" variant="ghost" style={styles.fill} onPress={() => locate(false)} />
        {target && !selected && (
          <Button
            label="Directions"
            icon="navigation"
            variant="ghost"
            style={styles.fill}
            onPress={() => router.push(`/find/directions/${target.id}`)}
          />
        )}
      </View>
      {(selected ?? target) && (
        // UC 3.1.AC.5: a problem found on arrival can be reported instead of, or as well as, checking in.
        <Button
          label="Problem with this bin? Report it"
          icon="flag"
          variant="ghost"
          onPress={() => {
            const p = (selected ?? target)!;
            router.push({ pathname: '/find/report/[id]', params: { id: String(p.id), title: p.title } });
          }}
        />
      )}
    </Screen>
  );
}

function CandidateRow({
  candidate: c,
  chosenOnFind,
  selected,
  onPress,
}: {
  candidate: Candidate;
  chosenOnFind: boolean;
  selected: boolean;
  onPress: () => void;
}) {
  const detail = `${formatDistance(c.distanceM)}${chosenOnFind ? ' · the point you chose' : ''}`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      // aria-checked as well: react-native-web doesn't expose accessibilityState.checked, so web screen readers missed it.
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      accessibilityLabel={`${c.title}, ${detail}${c.tied ? ', tied' : ''}`}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
    >
      <View style={[styles.radio, selected && styles.radioOn]}>{selected && <View style={styles.radioDot} />}</View>
      <PointTypeTile stream={c.stream} />
      <View style={styles.fill}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {c.title}
        </AppText>
        <AppText variant="small" color="textMuted">
          {detail}
        </AppText>
      </View>
      {c.tied && (
        <View style={styles.tied}>
          <AppText variant="caption" style={{ color: colors.warning }}>
            Tied
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

function nullIfNotFound(e: unknown): null {
  const err = toApiError(e);
  if (err.code === 'PGRST116') return null; // .single() found no row
  throw err;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  hero: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.md },
  ring: {
    width: 136,
    height: 136,
    borderRadius: 68,
    borderWidth: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colors.text },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.text },
  tied: { borderWidth: 1, borderColor: colors.warning, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  note: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  secondary: { flexDirection: 'row', gap: spacing.md },
});
