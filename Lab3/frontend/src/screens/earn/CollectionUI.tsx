import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';

import { api, toApiError, type Badge, type UserBadge } from '@/shared/api';
import { useAuth } from '@/shared/auth/AuthProvider';
import { AppText, Banner, Button, Card, EmptyState, Header, Screen } from '@/shared/components';
import { colors, spacing } from '@/shared/theme';
import { ProgressBar } from './ProgressBar';

type Data = { badges: Badge[]; mine: UserBadge[]; verified: number; pending: number };

const drops = (n: number) => `${n} verified drop${n === 1 ? '' : 's'}`;
const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });

/** UC 4.1 steps 6–8: badges earned, badges in progress, and the one closest to unlocking. */
export default function CollectionUI() {
  const { user } = useAuth();
  const [data, setData] = useState<Data>();
  const [error, setError] = useState<string>();

  const fetchData = useCallback(async () => {
    if (!user) return;
    setError(undefined);
    try {
      const [badges, mine, verified, pending] = await Promise.all([
        api.progress.listBadges(),
        api.progress.listMyBadges(),
        api.progress.countMyActions(user.id, 'Verified'),
        api.progress.countMyActions(user.id, 'Pending'),
      ]);
      setData({ badges, mine, verified, pending });
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

  const { badges, mine, verified, pending } = data;
  const earnedAt = new Map(mine.map((b) => [b.badge_id, b.earned_at]));
  const earned = badges.filter((b) => earnedAt.has(b.id));
  const locked = badges.filter((b) => !earnedAt.has(b.id));
  // Badges are listed easiest first, so the first locked one is the closest (UC 4.1 step 8).
  const closest = locked[0];

  return (
    <Screen scroll>
      <Header title="Collection" leading="back" />

      <View style={styles.summary}>
        <AppText variant="title" accessibilityRole="header">
          {earned.length} of {badges.length} badges
        </AppText>
        <AppText color="textMuted">{drops(verified)} so far</AppText>
      </View>

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
          <ProgressBar value={verified} max={closest.required_verified_actions} label={`${closest.name} progress`} />
          <AppText variant="small" color="textMuted">
            {/* The server only awards badges when an activity is verified, so a badge already reached waits for the next one. */}
            {verified >= closest.required_verified_actions
              ? 'Unlocks with your next verified drop.'
              : `${closest.required_verified_actions - verified} more verified drop${closest.required_verified_actions - verified === 1 ? '' : 's'} to go.`}
          </AppText>
        </Card>
      )}

      {earned.length > 0 && (
        <Card label="Earned">
          {earned.map((b) => (
            <View key={b.id} style={styles.item}>
              <BadgeHead badge={b} earned />
              <AppText variant="small" color="textMuted">
                Earned {formatDate(earnedAt.get(b.id)!)}
              </AppText>
            </View>
          ))}
        </Card>
      )}

      {locked.length > 1 && (
        <Card label="In progress">
          {locked.slice(1).map((b) => (
            <View key={b.id} style={styles.item}>
              <BadgeHead badge={b} earned={false} />
              <ProgressBar value={verified} max={b.required_verified_actions} label={`${b.name} progress`} />
              <AppText variant="small" color="textMuted">
                {Math.min(verified, b.required_verified_actions)} of {drops(b.required_verified_actions)}
              </AppText>
            </View>
          ))}
        </Card>
      )}

      {badges.length === 0 && <EmptyState icon="award" title="No badges yet" message="Badges haven't been set up on the server." />}

      <AppText variant="small" color="textFaint">
        Each verified log counts once, however many items it had.
      </AppText>
    </Screen>
  );
}

function BadgeHead({ badge: b, earned }: { badge: Badge; earned: boolean }) {
  return (
    <View style={styles.head}>
      <Feather
        name={earned ? 'award' : 'lock'}
        size={22}
        color={earned ? colors.success : colors.textFaint}
        accessibilityLabel={earned ? 'Earned' : 'Not earned yet'}
      />
      <View style={styles.fill}>
        <AppText variant="bodyStrong">{b.name}</AppText>
        <AppText variant="small" color="textMuted">
          {b.description ?? `Complete ${drops(b.required_verified_actions)}`}
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
});
