import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { api, toApiError } from '@/shared/api';
import type { LeaderboardPeriod, LeaderboardRow, LeaderboardScope } from '@/shared/api/proposed';
import { useAuth } from '@/shared/auth/AuthProvider';
import { AppText, Banner, Button, Chip, EmptyState, Header, Screen } from '@/shared/components';
import { colors, radius, spacing } from '@/shared/theme';
import { NotOnServerYet } from '@/screens/find/AdminGate';

const LIMIT = 50;

type Load =
  | { kind: 'loading' }
  | { kind: 'notAvailable' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; rows: LeaderboardRow[] };

/** UC 4.2: where you stand, globally or among people you follow, this week or all time. */
export default function LeaderboardUI() {
  const { user } = useAuth();
  // UC 4.2 step 2: Global and This week by default.
  const [scope, setScope] = useState<LeaderboardScope>('global');
  const [period, setPeriod] = useState<LeaderboardPeriod>('week');
  const [load, setLoad] = useState<Load>({ kind: 'loading' });

  const fetchBoard = useCallback(async () => {
    if (scope === 'friends' && !user) return;
    setLoad({ kind: 'loading' });
    try {
      setLoad({ kind: 'ready', rows: await api.proposed.getLeaderboard(period, scope, LIMIT) });
    } catch (e) {
      // UC 4.2.EX.3: an error and a retry, never a stale board shown as current.
      const err = toApiError(e);
      setLoad(err.code === 'not_available' ? { kind: 'notAvailable' } : { kind: 'error', message: err.message });
    }
  }, [period, scope, user]);

  useFocusEffect(
    useCallback(() => {
      fetchBoard();
    }, [fetchBoard]),
  );

  const selectors = (
    <>
      <View style={styles.chips} accessibilityRole="tablist" accessibilityLabel="Who to compare with">
        <Chip label="Global" selected={scope === 'global'} onPress={() => setScope('global')} />
        <Chip label="Friends" selected={scope === 'friends'} onPress={() => setScope('friends')} />
      </View>
      <View style={styles.chips} accessibilityRole="tablist" accessibilityLabel="Time period">
        <Chip label="This week" selected={period === 'week'} onPress={() => setPeriod('week')} />
        <Chip label="All time" selected={period === 'all_time'} onPress={() => setPeriod('all_time')} />
      </View>
    </>
  );

  return (
    <Screen scroll>
      <Header title="Leaderboard" />
      {selectors}
      {!user && (
        // UC 4.2.EX.1: guests can look, but they're told they aren't on it (NFR-BR-01).
        <Banner tone="info" title="You're browsing as a guest">
          Only people with an account earn Eco Points and appear here.
        </Banner>
      )}
      {!user && scope === 'friends' ? (
        <EmptyState icon="users" title="Log in to compare with friends" message="The friends board ranks the people you follow." />
      ) : (
        <Board load={load} scope={scope} onRetry={fetchBoard} />
      )}
      {!user && <Button label="Create an account" onPress={() => router.push('/register')} />}
    </Screen>
  );
}

function Board({ load, scope, onRetry }: { load: Load; scope: LeaderboardScope; onRetry: () => void }) {
  if (load.kind === 'loading') return <ActivityIndicator color={colors.text} style={styles.spinner} />;
  if (load.kind === 'notAvailable') return <NotOnServerYet feature="The leaderboard" />;
  if (load.kind === 'error') {
    return (
      <>
        <Banner tone="error" title="Couldn't load the leaderboard">
          {load.message}
        </Banner>
        <Button label="Try again" onPress={onRetry} />
      </>
    );
  }

  // The server sends up to LIMIT ranked rows, then your own row if it isn't among them, or if you're unranked.
  const pinned = load.rows.find((r, i) => r.is_me && (r.rank == null || i >= LIMIT)) ?? null;
  const ranked = load.rows.filter((r) => r !== pinned);

  if (scope === 'friends' && ranked.every((r) => r.is_me)) {
    // UC 4.2.EX.2: a board of one isn't a board.
    return (
      <EmptyState icon="users" title="You're not following anyone yet" message="Follow people from the Feed to see how you compare.">
        <Button label="Go to the Feed" variant="secondary" onPress={() => router.push('/feed')} />
      </EmptyState>
    );
  }
  if (ranked.length === 0) {
    return <EmptyState icon="award" title="No one's on the board yet" message="Verified recycling earns Eco Points. Be the first." />;
  }

  return (
    <View>
      {ranked.map((r) => (
        <RankRow key={r.user_id} row={r} />
      ))}
      {pinned && (
        // UC 4.2.AC.3: your own row stays visible even when you're below the list.
        <>
          <AppText color="textFaint" style={styles.gap} accessibilityElementsHidden>
            ⋯
          </AppText>
          <RankRow row={pinned} />
        </>
      )}
      <AppText variant="small" color="textFaint" style={styles.footnote}>
        {/* UC 4.2.AC.4 and EX.5: the tie rule and what counts, stated rather than implied. */}
        Only verified Eco Points count. This week runs Monday to Sunday, Singapore time. Equal totals share a rank, and the account
        that joined first is listed first.
      </AppText>
    </View>
  );
}

function RankRow({ row: r }: { row: LeaderboardRow }) {
  const detail = [r.town, `Level ${r.level}`, r.is_me ? 'you' : null].filter(Boolean).join(' · ');
  const points = r.points.toLocaleString('en-SG');
  return (
    <View
      style={[styles.row, r.is_me && styles.meRow]}
      accessible
      accessibilityLabel={`${r.rank == null ? 'Not ranked yet' : `Rank ${r.rank}`}, ${r.display_name}, ${detail}, ${points} Eco Points`}
    >
      <AppText variant="bodyStrong" color="textMuted" style={styles.rank}>
        {r.rank ?? '—'}
      </AppText>
      <View style={[styles.avatar, r.is_me && styles.meAvatar]}>
        <AppText variant="small" style={styles.bold}>
          {initials(r.display_name)}
        </AppText>
      </View>
      <View style={styles.fill}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {r.display_name}
        </AppText>
        <AppText variant="small" color="textMuted" numberOfLines={1}>
          {r.rank == null ? `Not ranked yet${r.is_me ? ' · you' : ''}` : detail}
        </AppText>
      </View>
      <AppText variant="bodyStrong">{points}</AppText>
    </View>
  );
}

const initials = (name: string) =>
  name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bold: { fontWeight: '700' },
  chips: { flexDirection: 'row', gap: spacing.sm },
  spinner: { marginTop: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  meRow: { backgroundColor: colors.surfaceRaised, borderRadius: radius.md, borderBottomColor: 'transparent' },
  rank: { width: 28, textAlign: 'center' },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meAvatar: { backgroundColor: colors.borderStrong },
  gap: { textAlign: 'center', paddingVertical: spacing.xs },
  footnote: { marginTop: spacing.lg },
});
