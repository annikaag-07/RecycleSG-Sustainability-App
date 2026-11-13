import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { api, toApiError, type BadgeProgress } from '@/shared/api';
import { useAuth } from '@/shared/auth/AuthProvider';
import { AppText, Banner, Button, Card, EmptyState, Header, Screen } from '@/shared/components';
import { colors, spacing } from '@/shared/theme';
import { closestBadge, defaultDescription, nextStep, progressText } from './badges';
import { Medal } from './Medal';
import { ProgressBar } from './ProgressBar';

type Data = { badges: BadgeProgress[]; streak: number; verified: number; pending: number };

const drops = (n: number) => `${n} verified drop${n === 1 ? '' : 's'}`;
const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * UC 4.1 steps 6–8: badges earned, badges in progress, and the one closest to unlocking. Badges count verified drops,
 * days in a row or regions visited; the server works out the progress for each.
 */
export default function CollectionUI() {
  const { user } = useAuth();
  const [data, setData] = useState<Data>();
  const [error, setError] = useState<string>();

  const fetchData = useCallback(async () => {
    if (!user) return;
    setError(undefined);
    try {
      const [badges, streak, verified, pending] = await Promise.all([
        api.progress.listMyBadgeProgress(),
        api.progress.getMyStreak(),
        api.progress.countMyActions(user.id, 'Verified'),
        api.progress.countMyActions(user.id, 'Pending'),
      ]);
      setData({ badges, streak, verified, pending });
    } catch (e) {
      setError(toApiError(e).message);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

  if (!user) {
    return (
      <Screen>
        <Header title="Collection" leading="back" />
        <EmptyState icon="award" title="Log in to collect badges" message="Badges are earned with verified recycling, so they need an account." />
        <Button label="Log in" onPress={() => router.push('/login')} />
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen>
        <Header title="Collection" leading="back" />
        {error ? (
          <>
            <Banner tone="error" title="Couldn't load your badges">
              {error}
            </Banner>
            <Button label="Try again" onPress={fetchData} />
          </>
        ) : (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.text} />
          </View>
        )}
      </Screen>
    );
  }

  const { badges, streak, verified, pending } = data;
  const earned = badges.filter((b) => b.earned_at).sort((a, b) => a.earned_at!.localeCompare(b.earned_at!));
  const closest = closestBadge(badges);
  const locked = badges.filter((b) => !b.earned_at && b !== closest);

  return (
    <Screen scroll>
      <Header title="Collection" leading="back" />

      <View style={styles.summary}>
        <AppText variant="title" accessibilityRole="header">
          {earned.length} of {badges.length} badges
        </AppText>
        <AppText color="textMuted">
          {drops(verified)} so far · {streak === 0 ? 'no streak yet' : `${streak}-day streak`}
        </AppText>
      </View>

      {badges.length > 0 && (
        <View style={styles.shelf}>
          {[...badges]
            .sort((a, b) => Number(!a.earned_at) - Number(!b.earned_at) || a.id - b.id)
            .map((b) => (
              <View key={b.id} style={styles.cell}>
                <Medal badge={b} earned={!!b.earned_at} size={72} />
                <AppText variant="small" color={b.earned_at ? 'text' : 'textMuted'} style={styles.center} numberOfLines={2}>
                  {b.name}
                </AppText>
              </View>
            ))}
        </View>
      )}

      {error && (
        <Banner tone="warning" title="Couldn't refresh">
          {error}
        </Banner>
      )}
      {pending > 0 && (
        <Banner tone="info" title={`${pending} drop${pending === 1 ? '' : 's'} waiting for verification`}>
          {pending === 1 ? 'It counts towards badges once it’s verified.' : 'They count towards badges once they’re verified.'}
        </Banner>
      )}

      {closest && (
        <Card label="Closest">
          <BadgeHead badge={closest} earned={false} />
          <ProgressBar value={closest.progress} max={closest.target} label={`${closest.name} progress`} />
          <AppText variant="small" color="textMuted">
            {progressText(closest)}. {nextStep(closest)}
          </AppText>
        </Card>
      )}

      {earned.length > 0 && (
        <Card label="Earned">
          {earned.map((b) => (
            <View key={b.id} style={styles.item}>
              <BadgeHead badge={b} earned />
              <AppText variant="small" color="textMuted">
                Earned {formatDate(b.earned_at!)}
              </AppText>
            </View>
          ))}
        </Card>
      )}

      {locked.length > 0 && (
        <Card label="In progress">
          {locked.map((b) => (
            <View key={b.id} style={styles.item}>
              <BadgeHead badge={b} earned={false} />
              <ProgressBar value={b.progress} max={b.target} label={`${b.name} progress`} />
              <AppText variant="small" color="textMuted">
                {progressText(b)}
              </AppText>
            </View>
          ))}
        </Card>
      )}

      {badges.length === 0 && <EmptyState icon="award" title="No badges yet" message="Badges haven't been set up on the server." />}

      <AppText variant="small" color="textFaint">
        Each verified log counts once, however many items it had. A day counts towards a streak when something you
        recycled that day, Singapore time, is verified. Regions come from the points you recycle at.
      </AppText>
    </Screen>
  );
}

function BadgeHead({ badge: b, earned }: { badge: BadgeProgress; earned: boolean }) {
  return (
    <View style={styles.head}>
      <Medal badge={b} earned={earned} />
      <View style={styles.fill}>
        <AppText variant="bodyStrong">{b.name}</AppText>
        <AppText variant="small" color="textMuted">
          {b.description ?? defaultDescription(b)}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  summary: { gap: spacing.xs },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  item: { gap: spacing.sm },
  center: { textAlign: 'center' },
  // Three across, like the mockups' badge grid: earned first, in colour.
  shelf: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.lg },
  cell: { width: '33.33%', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xs },
});
