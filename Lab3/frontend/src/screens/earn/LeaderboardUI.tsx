import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { api, toApiError, type LeaderboardEntry, type Profile } from '@/shared/api';
import { useAuth } from '@/shared/auth/AuthProvider';
import { AppText, Banner, Button, EmptyState, Header, Screen } from '@/shared/components';
import { colors, radius, spacing } from '@/shared/theme';
import { Avatar, personName } from './Avatar';

const LIMIT = 50;

type Row = {
  /** Null when the user isn't on the board. */
  rank: number | null;
  key: string;
  name: string;
  level: number;
  points: number;
  isMe: boolean;
};

type Load =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  /** `me` is the signed-in user's own row when they aren't in the list (UC 4.2.AC.3). */
  | { kind: 'ready'; rows: Row[]; me: Row | null };

/**
 * UC 4.2: where you stand. The server ranks everyone by lifetime Eco Points; it has no weekly or friends board yet, so
 * those selectors (UC 4.2 step 2, AC.1, AC.2) aren't shown.
 */
export default function LeaderboardUI() {
  const { user } = useAuth();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });

  const fetchBoard = useCallback(async () => {
    setLoad((l) => (l.kind === 'ready' ? l : { kind: 'loading' }));
    try {
      const [entries, profile] = await Promise.all([
        api.community.getLeaderboard(LIMIT),
        user ? api.profile.getMyProfile(user.id) : Promise.resolve(null),
      ]);
      setLoad({ kind: 'ready', ...toRows(entries, profile) });
    } catch (e) {
      // UC 4.2.EX.3: an error and a retry, never a stale board shown as current.
      setLoad({ kind: 'error', message: toApiError(e).message });
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchBoard();
    }, [fetchBoard]),
  );

  return (
    <Screen scroll>
      <Header title="Leaderboard" />
      <AppText color="textMuted">All time · lifetime Eco Points</AppText>
      {!user && (
        // UC 4.2.EX.1: guests can look, but they're told they aren't on it (NFR-BR-01).
        <Banner tone="info" title="You're browsing as a guest">
          Only people with an account earn Eco Points and appear here.
        </Banner>
      )}
      <Board load={load} onRetry={fetchBoard} />
      {!user && <Button label="Create an account" onPress={() => router.push('/register')} />}
    </Screen>
  );
}

function toRows(entries: LeaderboardEntry[], profile: Profile | null): { rows: Row[]; me: Row | null } {
  // The server includes people with no points and numbers tied totals 1, 2, 3. Leave out the zeros and give equal
  // totals the same rank (UC 4.2.AC.4), which is exact within the list because it's sorted by points.
  const rows: Row[] = [];
  for (const [i, e] of entries.filter((e) => e.eco_points > 0).entries()) {
    const prev = rows[i - 1];
    rows.push({
      rank: prev && prev.points === e.eco_points ? prev.rank : i + 1,
      key: e.username,
      name: personName(e),
      level: e.level,
      points: e.eco_points,
      isMe: e.username === profile?.username,
    });
  }
  if (!profile || rows.some((r) => r.isMe)) return { rows, me: null };
  const last = rows[rows.length - 1];
  return {
    rows,
    me: {
      // Tied with the last row shown means the same rank; otherwise all we know is that it's below the list.
      rank: last && profile.eco_points > 0 && profile.eco_points === last.points ? last.rank : null,
      key: profile.username,
      name: personName(profile),
      level: profile.level,
      points: profile.eco_points,
      isMe: true,
    },
  };
}

function Board({ load, onRetry }: { load: Load; onRetry: () => void }) {
  if (load.kind === 'loading') return <ActivityIndicator color={colors.text} style={styles.spinner} />;
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

  const { rows, me } = load;
  if (rows.length === 0) {
    return (
      <>
        <EmptyState icon="award" title="No one's on the board yet" message="Verified recycling earns Eco Points. Be the first." />
        {me && <RankRow row={me} note="Not ranked yet" />}
      </>
    );
  }

  return (
    <View>
      {rows.map((r) => (
        <RankRow key={r.key} row={r} />
      ))}
      {me && (
        // UC 4.2.AC.3: your own row stays visible even when you're below the list.
        <>
          <AppText color="textFaint" style={styles.gap} accessibilityElementsHidden>
            ⋯
          </AppText>
          <RankRow row={me} note={me.points === 0 ? 'Not ranked yet' : me.rank == null ? `Not in the top ${rows.length}` : undefined} />
        </>
      )}
      <AppText variant="small" color="textFaint" style={styles.footnote}>
        {/* UC 4.2.AC.4 and EX.5: the tie rule and what counts, stated rather than implied. */}
        Eco Points come from verified recycling and completed quests. Contributing to a milestone doesn't lower them. Equal
        totals share a rank. Weekly and friends rankings aren't available yet.
      </AppText>
    </View>
  );
}

function RankRow({ row: r, note }: { row: Row; note?: string }) {
  const detail = note ?? [`Level ${r.level}`, r.isMe ? 'you' : null].filter(Boolean).join(' · ');
  const points = r.points.toLocaleString('en-SG');
  return (
    <View
      style={[styles.row, r.isMe && styles.meRow]}
      accessible
      accessibilityLabel={`${r.rank == null ? '' : `Rank ${r.rank}, `}${r.name}${r.isMe ? ' (you)' : ''}, ${detail}, ${points} Eco Points`}
    >
      <AppText variant="bodyStrong" color="textMuted" style={styles.rank}>
        {r.rank ?? '—'}
      </AppText>
      <Avatar name={r.name} highlight={r.isMe} />
      <View style={styles.fill}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {r.name}
        </AppText>
        <AppText variant="small" color="textMuted" numberOfLines={1}>
          {note && r.isMe ? `${note} · you` : detail}
        </AppText>
      </View>
      <AppText variant="bodyStrong">{points}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
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
  gap: { textAlign: 'center', paddingVertical: spacing.xs },
  footnote: { marginTop: spacing.lg },
});
