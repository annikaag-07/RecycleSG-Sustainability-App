import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';

import { api, toApiError, type Quest, type QuestClaimResult, type QuestProgress, type QuestType } from '@/shared/api';
import { useAuth } from '@/shared/auth/AuthProvider';
import { AppText, Banner, Button, Card, Chip, EmptyState, Header, Screen } from '@/shared/components';
import { colors, spacing } from '@/shared/theme';
import { ProgressBar } from './ProgressBar';
import { questPeriodEnds, questPeriodStart } from './rules';
import { clockTime } from './time';

type Data = {
  quests: Quest[];
  progress: QuestProgress[];
  /** Drops still waiting for verification, which don't count yet. */
  pending: number;
  badgesEarned: number;
  badgesTotal: number;
  loadedAt: Date;
};

const TABS: { type: QuestType; label: string }[] = [
  { type: 'daily', label: 'Daily' },
  { type: 'weekly', label: 'Weekly' },
  { type: 'one_time', label: 'One-off' },
];

const drops = (n: number) => `${n} verified drop${n === 1 ? '' : 's'}`;

/** UC 4.1 steps 1–5: today's and this week's quests, how far along each is, and claiming the reward. */
export default function QuestsUI() {
  const { user } = useAuth();
  const [tab, setTab] = useState<QuestType>('daily');
  const [data, setData] = useState<Data>();
  const [loadError, setLoadError] = useState<string>();
  const [claiming, setClaiming] = useState<number>();
  const [claimed, setClaimed] = useState<{ title: string; result: QuestClaimResult }>();
  const [claimError, setClaimError] = useState<string>();

  const fetchData = useCallback(async () => {
    setLoadError(undefined);
    try {
      const now = new Date();
      const periods = TABS.map((t) => questPeriodStart(t.type, now));
      const [quests, progress, pending, badges, myBadges] = await Promise.all([
        api.progress.listQuests(),
        user ? api.progress.listMyQuestProgress(periods) : Promise.resolve([]),
        user ? api.progress.countMyActions(user.id, 'Pending') : Promise.resolve(0),
        api.progress.listBadges(),
        user ? api.progress.listMyBadges() : Promise.resolve([]),
      ]);
      setData({ quests, progress, pending, badgesEarned: myBadges.length, badgesTotal: badges.length, loadedAt: now });
    } catch (e) {
      // UC 4.1.EX.1: keep showing what was loaded before, marked as possibly out of date.
      setLoadError(toApiError(e).message);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

  const onClaim = async (quest: Quest, row: QuestProgress) => {
    setClaiming(quest.id);
    setClaimError(undefined);
    setClaimed(undefined);
    try {
      // Claim the period that was shown, even if it has just turned over.
      const result = await api.progress.claimQuestReward(quest.id, row.period_start);
      setClaimed({ title: quest.title, result });
      await fetchData();
    } catch (e) {
      const err = toApiError(e);
      // Claimed already, e.g. on another device: the refresh shows it as done.
      if (err.message === 'Reward already claimed') await fetchData();
      else setClaimError(err.isNetwork ? 'Couldn’t reach the server, so nothing was claimed. Try again.' : err.message);
    } finally {
      setClaiming(undefined);
    }
  };

  if (!data) {
    return (
      <Screen>
        <Header title="Quests" />
        {loadError ? (
          <>
            <Banner tone="error" title="Couldn't load quests">
              {loadError}
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

  const now = new Date();
  const period = questPeriodStart(tab, now);
  const ends = questPeriodEnds(tab, now);
  const quests = data.quests.filter((q) => q.quest_type === tab);
  const progressFor = (q: Quest) => data.progress.find((p) => p.quest_id === q.id && p.period_start === period);

  return (
    <Screen scroll>
      <Header title="Quests" />

      {!user && (
        <Banner tone="info" title="Log in to take part">
          Quests count your verified recycling, so they need an account.
        </Banner>
      )}
      {loadError && (
        <Banner tone="warning" title="Couldn't refresh">
          {`Showing progress from ${clockTime(data.loadedAt)}. ${loadError}`}
        </Banner>
      )}

      {/* UC 4.1 step 2: Daily is selected first; AC.1 switches to the longer weekly set. */}
      <View style={styles.chips} accessibilityRole="tablist" accessibilityLabel="Quest period">
        {TABS.map((t) => (
          <Chip key={t.type} label={t.label} selected={tab === t.type} onPress={() => setTab(t.type)} />
        ))}
      </View>
      <AppText variant="small" color="textMuted">
        {ends
          ? // UC 4.1.EX.3: partial progress doesn't carry over, so say when the period ends.
            `${tab === 'daily' ? 'Daily quests reset' : 'Weekly quests reset on Monday'} at ${clockTime(ends)}. Unfinished progress doesn't carry over.`
          : 'Each of these can be completed once.'}
      </AppText>

      {user && data.pending > 0 && (
        <Banner tone="info" title={`${data.pending} drop${data.pending === 1 ? '' : 's'} waiting for verification`}>
          {`Only verified recycling counts towards quests. ${data.pending === 1 ? 'It will count once it’s' : 'They’ll count once they’re'} checked.`}
        </Banner>
      )}
      {claimed && (
        <Banner tone="info" title={`+${claimed.result.eco_points_awarded} Eco Points and ${claimed.result.xp_awarded} XP`}>
          {`Claimed from “${claimed.title}”. You now have ${claimed.result.new_balance} available Eco Points and you're level ${claimed.result.new_level}.`}
        </Banner>
      )}
      {claimError && (
        <Banner tone="error" title="Not claimed">
          {claimError}
        </Banner>
      )}

      {quests.length === 0 ? (
        <EmptyState icon="target" title={`No ${TABS.find((t) => t.type === tab)!.label.toLowerCase()} quests right now`} />
      ) : (
        quests.map((q) => (
          <QuestCard
            key={q.id}
            quest={q}
            row={user ? progressFor(q) : undefined}
            signedIn={!!user}
            claiming={claiming === q.id}
            onClaim={onClaim}
          />
        ))
      )}

      {/* UC 4.1 step 6. */}
      <Pressable
        onPress={() => router.push('/quests/collection')}
        accessibilityRole="button"
        accessibilityLabel={user ? `Badges, ${data.badgesEarned} of ${data.badgesTotal} earned` : 'Badges'}
        style={({ pressed }) => [pressed && { opacity: 0.7 }]}
      >
        <Card>
          <View style={styles.linkRow}>
            <Feather name="award" size={22} color={colors.textMuted} />
            <View style={styles.fill}>
              <AppText variant="bodyStrong">Badges</AppText>
              <AppText variant="small" color="textMuted">
                {user ? `${data.badgesEarned} of ${data.badgesTotal} earned` : `${data.badgesTotal} to earn`}
              </AppText>
            </View>
            <Feather name="chevron-right" size={20} color={colors.textMuted} />
          </View>
        </Card>
      </Pressable>

      <Button label="Find a bin" variant="secondary" icon="map-pin" onPress={() => router.push('/find')} />
    </Screen>
  );
}

function QuestCard({
  quest: q,
  row,
  signedIn,
  claiming,
  onClaim,
}: {
  quest: Quest;
  row: QuestProgress | undefined;
  signedIn: boolean;
  claiming: boolean;
  onClaim: (q: Quest, row: QuestProgress) => void;
}) {
  const done = row?.progress ?? 0;
  const left = Math.max(0, q.target_actions - done);
  const reward = [q.reward_eco_points > 0 && `${q.reward_eco_points} Eco Points`, q.reward_xp > 0 && `${q.reward_xp} XP`]
    .filter(Boolean)
    .join(' and ');

  return (
    <Card>
      <View style={styles.titleRow}>
        <View style={styles.fill}>
          <AppText variant="bodyStrong">{q.title}</AppText>
          {q.description && (
            <AppText variant="small" color="textMuted">
              {q.description}
            </AppText>
          )}
        </View>
        <AppText variant="small" color="textMuted">
          +{reward}
        </AppText>
      </View>
      {signedIn && (
        <>
          <ProgressBar value={done} max={q.target_actions} label={`${q.title} progress`} />
          {row?.claimed_at ? (
            <View style={styles.doneRow}>
              <Feather name="check-circle" size={16} color={colors.success} />
              <AppText variant="small" color="success">
                Done · reward claimed
              </AppText>
            </View>
          ) : row?.completed_at ? (
            <Button label={`Claim ${reward}`} loading={claiming} onPress={() => onClaim(q, row)} />
          ) : (
            // UC 4.1 step 4: what specifically remains.
            <AppText variant="small" color="textMuted">
              {done} of {drops(q.target_actions)} · {left} more needed
            </AppText>
          )}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', gap: spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
