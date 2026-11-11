import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { api, toApiError, type LeaderboardEntry, type LeaderboardPeriod, type Profile } from '@/shared/api';
import { useAuth } from '@/shared/auth/AuthProvider';
import { AppText, Banner, Button, Chip, EmptyState, Header, Screen } from '@/shared/components';
import { colors, radius, spacing } from '@/shared/theme';
import { Avatar, personName } from './Avatar';

const LIMIT = 50;

type Row = {
  /** Null when the user isn't on the board. */
  rank: number | null;
  key: string;
  name: string;
  level: number;
  /** Null when it isn't known: your weekly points when you're below the list. */
  points: number | null;
  isMe: boolean;
};

/** UC 4.2 step 2 and AC.2: everyone, or you and the people you follow. */
type Scope = 'global' | 'following';

type Load =
  | { kind: 'loading' }
  /** The Following board needs an account. */
  | { kind: 'signedOut' }
  | { kind: 'error'; message: string }
  /** `me` is the signed-in user's own row when they aren't in the list (UC 4.2.AC.3). */
  | { kind: 'ready'; rows: Row[]; me: Row | null };

/** UC 4.2: where you stand among everyone or among the people you follow, this week or all time. */
export default function LeaderboardUI() {
  const { user } = useAuth();
  // UC 4.2 step 2: This week first.
  const [period, setPeriod] = useState<LeaderboardPeriod>('week');
  const [scope, setScope] = useState<Scope>('global');
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  // Set when the server has no weekly board yet, so the all-time board is shown instead.
  const [weekMissing, setWeekMissing] = useState(false);

  const fetchBoard = useCallback(async () => {
    if (scope === 'following' && !user) return setLoad({ kind: 'signedOut' });
    setLoad({ kind: 'loading' });
    try {
      const [entries, profile] = await Promise.all([
        scope === 'following' ? api.social.getFollowingLeaderboard(period, LIMIT) : api.community.getLeaderboard(LIMIT, period),
        user ? api.profile.getMyProfile(user.id) : Promise.resolve(null),
      ]);
      if (period === 'week') setWeekMissing(false);
      setLoad({ kind: 'ready', ...toRows(entries, profile, period) });
    } catch (e) {
      const err = toApiError(e);
      if (err.code === 'not_available' && period === 'week') {
        setWeekMissing(true);
        setPeriod('all_time');
        return;
      }
      // UC 4.2.EX.3: an error and a retry, never a stale board shown as current.
      setLoad({ kind: 'error', message: err.message });
    }
  }, [period, scope, user]);

  useFocusEffect(
    useCallback(() => {
      fetchBoard();
    }, [fetchBoard]),
  );

  return (
    <Screen scroll>
      <Header title="Leaderboard" />
      <View style={styles.chips} accessibilityRole="tablist" accessibilityLabel="Who">
        <Chip label="Global" selected={scope === 'global'} onPress={() => setScope('global')} />
        <Chip label="Following" selected={scope === 'following'} onPress={() => setScope('following')} />
      </View>
      <View style={styles.chips} accessibilityRole="tablist" accessibilityLabel="Time period">
        <Chip label="This week" selected={period === 'week'} onPress={() => setPeriod('week')} />
        <Chip label="All time" selected={period === 'all_time'} onPress={() => setPeriod('all_time')} />
      </View>
      <AppText color="textMuted">
        {period === 'week' ? 'Eco Points earned since Monday, Singapore time' : 'Lifetime Eco Points'}
      </AppText>
      {weekMissing && period === 'all_time' && (
        <AppText variant="small" color="textFaint">
          The weekly board isn't on the server yet, so this is the all-time board.
        </AppText>
      )}
      {!user && scope === 'global' && (
        // UC 4.2.EX.1: guests can look, but they're told they aren't on it (NFR-BR-01).
        <Banner tone="info" title="You're browsing as a guest">
          Only people with an account earn Eco Points and appear here.
        </Banner>
      )}
      <Board load={load} period={period} scope={scope} onRetry={fetchBoard} />
      {!user && scope === 'global' && <Button label="Create an account" onPress={() => router.push('/register')} />}
    </Screen>
  );
}

function toRows(entries: LeaderboardEntry[], profile: Profile | null, period: LeaderboardPeriod): { rows: Row[]; me: Row | null } {
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
  // Your lifetime total is on your profile. Your weekly total is only known if the server listed you (with 0) or
  // returned fewer than LIMIT rows, which means everyone with points is on the list and you have none this week.
  const listed = entries.find((e) => e.username === profile.username);
  const points =
    period === 'all_time' ? profile.eco_points : listed ? listed.eco_points : entries.length < LIMIT ? 0 : null;
  const last = rows[rows.length - 1];
  return {
    rows,
    me: {
      // Tied with the last row shown means the same rank; otherwise all we know is that it's below the list.
      rank: last && points != null && points > 0 && points === last.points ? last.rank : null,
      key: profile.username,
      name: personName(profile),
      level: profile.level,
      points,
      isMe: true,
    },
  };
}

function Board({ load, period, scope, onRetry }: { load: Load; period: LeaderboardPeriod; scope: Scope; onRetry: () => void }) {
  if (load.kind === 'loading') return <ActivityIndicator color={colors.text} style={styles.spinner} />;
  if (load.kind === 'signedOut') {
    return (
      <EmptyState icon="users" title="Following needs an account" message="Log in to follow people and see how you compare with them.">
        <Button label="Log in" onPress={() => router.push('/login')} />
      </EmptyState>
    );
  }
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
  const unranked = period === 'week' ? 'No points this week yet' : 'Not ranked yet';
  if (rows.length === 0) {
    return (
      <>
        {scope === 'following' ? (
          <EmptyState
            icon="users"
            title={period === 'week' ? 'No one you follow has points this week' : 'No one you follow has points yet'}
            message="Follow people from their posts in the feed to compare with them here."
          />
        ) : (
          <EmptyState
            icon="award"
            title={period === 'week' ? 'No one has earned points this week' : "No one's on the board yet"}
            message="Verified recycling earns Eco Points. Be the first."
          />
        )}
        {me && <RankRow row={me} note={unranked} />}
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
          <RankRow row={me} note={me.points === 0 ? unranked : me.rank == null ? `Not in the top ${rows.length}` : undefined} />
        </>
      )}
      <AppText variant="small" color="textFaint" style={styles.footnote}>
        {/* UC 4.2.AC.4 and EX.5: the tie rule and what counts, stated rather than implied. */}
        {scope === 'following'
          ? 'You and the people you follow. Followers-only accounts appear once they approve you. '
          : 'Followers-only accounts appear only to their followers. '}
        {period === 'week'
          ? 'This week runs from Monday to Sunday, Singapore time, and counts Eco Points from recycling verified in that time. Quest rewards count towards all time only. Equal totals share a rank.'
          : "Eco Points come from verified recycling and completed quests. Contributing to a milestone doesn't lower them. Equal totals share a rank."}
      </AppText>
    </View>
  );
}

function RankRow({ row: r, note }: { row: Row; note?: string }) {
  const detail = note ?? [`Level ${r.level}`, r.isMe ? 'you' : null].filter(Boolean).join(' · ');
  const points = r.points == null ? null : r.points.toLocaleString('en-SG');
  return (
    <View
      style={[styles.row, r.isMe && styles.meRow]}
      accessible
      accessibilityLabel={`${r.rank == null ? '' : `Rank ${r.rank}, `}${r.name}${r.isMe ? ' (you)' : ''}, ${note ?? `Level ${r.level}`}${points == null ? '' : `, ${points} Eco Points`}`}
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
      {points != null && <AppText variant="bodyStrong">{points}</AppText>}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
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
  gap: { textAlign: 'center', paddingVertical: spacing.xs },
  footnote: { marginTop: spacing.lg },
});
