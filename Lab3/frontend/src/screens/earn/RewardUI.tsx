import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';

import {
  api,
  toApiError,
  type ActivityImpact,
  type LevelProgress,
  type MaterialType,
  type RecyclingAction,
  type RewardEstimate,
  type RewardTransaction,
} from '@/shared/api';
import { useAuth } from '@/shared/auth/AuthProvider';
import { AppText, Banner, Button, Card, EmptyState, Header, Screen } from '@/shared/components';
import { materialMeta } from '@/shared/materials';
import { colors, radius, spacing } from '@/shared/theme';
import { pointTitle } from '@/screens/find/pointDisplay';
import { levelBar } from './level';
import { logDeadline } from './rules';
import { useNow } from './time';

type Data = {
  action: RecyclingAction;
  materialName: string;
  /** Null when the check-in is too old to look up (only the latest 20 are fetched). */
  placeTitle: string | null;
  /** Materials this point accepts that haven't been logged on this check-in yet (UC 3.2.AC.2). */
  unlogged: MaterialType[];
  checkInAt: string | null;
  level: LevelProgress;
  reward: RewardTransaction | null;
  /** What a drop without a reward row yet will earn, at today's rates. Null if it couldn't be worked out. */
  estimate: RewardEstimate | null;
};

type Load = { kind: 'loading' } | { kind: 'notFound' } | { kind: 'error'; message: string } | ({ kind: 'ready' } & Data);

/** UC 3.2 steps 9–11: what the drop earned, or will earn once it's verified. */
export default function RewardUI() {
  const { actionId: actionIdParam } = useLocalSearchParams<{ actionId: string }>();
  const actionId = Number(actionIdParam);
  const { user } = useAuth();
  const now = useNow();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [verifying, setVerifying] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState<string>();
  const [activityImpact, setActivityImpact] = useState<ActivityImpact | null>(null);
  const attempted = useRef<number | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    if (!Number.isInteger(actionId)) return setLoad({ kind: 'notFound' });
    setLoad({ kind: 'loading' });
    try {
      const [actions, level, reward, checkIns, materials] = await Promise.all([
        api.checkins.listMyRecyclingActions(50),
        api.progress.getMyLevelProgress(),
        api.checkins.getRewardForAction(actionId),
        api.checkins.listMyCheckIns(20),
        api.points.listMaterialTypes(),
      ]);
      const action = actions.find((a) => a.id === actionId);
      if (!action) return setLoad({ kind: 'notFound' });
      const checkIn = checkIns.find((c) => c.id === action.check_in_id);
      const [point, estimate] = await Promise.all([
        checkIn ? api.points.getPointDetail(checkIn.recycling_point_id).catch(() => null) : null,
        // The seasonal bonus depends on when the drop was logged, so pass that rather than now.
        reward ? null : api.progress.estimateRecyclingReward(action.material_type_id, action.quantity, action.created_at).catch(() => null),
      ]);
      const loggedHere = new Set(actions.filter((a) => a.check_in_id === action.check_in_id).map((a) => a.material_type_id));
      setLoad({
        kind: 'ready',
        action,
        materialName: materials.find((m) => m.id === action.material_type_id)?.name ?? 'Recycling',
        placeTitle: point ? pointTitle(point.name, point.address).title : null,
        unlogged: point ? point.materials.filter((m) => !loggedHere.has(m.id)) : [],
        checkInAt: checkIn?.checked_in_at ?? null,
        level,
        reward,
        estimate,
      });
    } catch (e) {
      setLoad({ kind: 'error', message: toApiError(e).message });
    }
  }, [actionId, user]);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const verify = useCallback(async () => {
    setVerifying(true);
    setVerificationMessage(undefined);
    try {
      const result = await api.verification.verifyActivity(actionId);
      setVerificationMessage(result.message);
      if (result.activity_impact?.estimated_co2_saved_kg) {
        setActivityImpact(result.activity_impact);
      }
    } catch (e) {
      setVerificationMessage(toApiError(e).message);
    } finally {
      // Reconcile even a lost response: the server may already have finalized.
      await fetchData();
      setVerifying(false);
    }
  }, [actionId, fetchData]);

  useEffect(() => {
    if (load.kind === 'ready' && load.action.verification_status === 'Pending' && attempted.current !== actionId) {
      attempted.current = actionId;
      void verify();
    }
  }, [load, actionId, verify]);

  const done = () => (router.canGoBack() ? router.back() : router.replace('/find'));

  if (!user) {
    return (
      <Screen>
        <Header leading="close" onLeadingPress={done} />
        <EmptyState icon="user" title="Log in to see your rewards" />
        <Button label="Log in" onPress={() => router.push('/login')} />
      </Screen>
    );
  }
  if (load.kind === 'loading') {
    return (
      <Screen>
        <Header leading="close" onLeadingPress={done} />
        <View style={styles.centered}>
          <ActivityIndicator color={colors.text} />
        </View>
      </Screen>
    );
  }
  if (load.kind === 'notFound') {
    return (
      <Screen>
        <Header leading="close" onLeadingPress={done} />
        <EmptyState icon="gift" title="This reward isn't available" message="Your recent recycling and its status are on the You tab." />
        <Button label="Done" onPress={done} />
      </Screen>
    );
  }
  if (load.kind === 'error') {
    return (
      <Screen>
        <Header leading="close" onLeadingPress={done} />
        <Banner tone="error" title="Couldn't load your reward">
          {load.message}
        </Banner>
        <Button label="Try again" onPress={fetchData} />
      </Screen>
    );
  }

  const { action, materialName, placeTitle, unlogged, checkInAt, level, reward, estimate } = load;
  const status = action.verification_status;
  const meta = materialMeta(materialName);
  // Verified rewards come from reward_transactions; before that, the server's estimate at the current rates.
  const points = reward?.eco_points_earned ?? estimate?.eco_points;
  const xp = reward?.xp_earned ?? estimate?.xp;
  const what = `${action.quantity} ${materialName.toLowerCase()} item${action.quantity === 1 ? '' : 's'}${placeTitle ? ` at ${placeTitle}` : ''}`;
  const bar = levelBar(level);
  const canLogAnother = unlogged.length > 0 && !!checkInAt && now < logDeadline(checkInAt);

  return (
    <Screen scroll>
      <Header leading="close" onLeadingPress={done} />

      <View style={styles.hero}>
        <View style={[styles.materialTile, { backgroundColor: meta.color }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <MaterialCommunityIcons name={meta.icon} size={44} color={colors.text} />
        </View>
        <AppText variant="title" accessibilityRole="header" style={styles.center}>
          {status === 'Verified'
            ? points != null
              ? `+${points} Eco Points`
              : 'Recycling verified'
            : status === 'Rejected'
              ? 'Couldn’t be verified'
              : 'Recycling logged'}
        </AppText>
        <AppText color="textMuted" style={styles.center}>
          {what}
        </AppText>
        {status === 'Verified' && activityImpact && activityImpact.estimated_co2_saved_kg > 0 && (
          <View style={styles.co2Row}>
            <Feather name="wind" size={16} color={colors.success} />
            <AppText variant="bodyStrong" style={{ color: colors.success }}>
              {activityImpact.estimated_co2_saved_kg} kg CO₂ saved
            </AppText>
            <AppText variant="caption" color="textFaint">(illustrative estimate)</AppText>
          </View>
        )}
      </View>

      {status === 'Pending' && (
        // UC 3.2: points aren't shown as earned until verified. Crediting them and taking them back is worse than waiting.
        <Card label="Waiting for verification">
          <AppText variant="heading">{points != null ? `${points} Eco Points · ${xp} XP` : 'Eco Points and XP'}</AppText>
          <AppText color="textMuted">
            These are added once the drop is verified, at the rates set then. Until then they don't count towards your balance,
            level, quests or badges.
            You'll see them here and on the You tab when it's done.
          </AppText>
          <AppText variant="small" color="textFaint">
            Once verified, you can share it as a post, and it appears under Verified drops in the feed with your display name, or
            as Anonymous Recycler if you haven't set one.
          </AppText>
          {verificationMessage && <AppText color="warning">{verificationMessage}</AppText>}
          <Button label={verifying ? 'Checking photo…' : 'Retry verification'} loading={verifying} onPress={verify} />
          <Button label="Refresh status" variant="secondary" disabled={verifying} onPress={fetchData} />
          <AppText variant="small" color="textFaint">Prototype check: recognized material must match your selection. This is not proof of physical disposal.</AppText>
        </Card>
      )}
      {status === 'Rejected' && (
        // UC 3.2.EX.5: no points, said plainly, and the action stays in your history rather than vanishing.
        <Banner tone="error" title="No points were credited">
          This drop didn't pass verification. It stays in your recycling history on the You tab.
        </Banner>
      )}

      <Card label={`Level ${level.level}`}>
        <View
          style={styles.barTrack}
          accessibilityRole="progressbar"
          accessibilityLabel="Progress to next level"
          accessibilityValue={{ min: 0, max: bar.step, now: bar.into }}
        >
          <View style={[styles.barFill, { width: `${bar.fraction * 100}%` }]} />
        </View>
        <AppText variant="small" color="textMuted">
          {bar.text}
          {status === 'Pending' && xp != null ? ` · +${xp} XP once verified` : ''}
        </AppText>
        {/* UC 3.2 step 10. */}
        <AppText variant="small" color="textFaint">
          Point values are set on the server, not fixed in the app.
        </AppText>
      </Card>

      {canLogAnother && (
        <Button
          label={`Log another material (${unlogged.map((m) => m.name).join(', ')})`}
          variant="secondary"
          onPress={() => router.replace({ pathname: '/find/log/[checkInId]', params: { checkInId: String(action.check_in_id) } })}
        />
      )}
      {status === 'Verified' && (
        // UC 3.2.AC.5: a post linked to this drop. Only verified drops can be linked, so there's no button while pending.
        <Button
          label="Share as a post"
          icon="share"
          variant="secondary"
          onPress={() => router.push({ pathname: '/feed/compose', params: { checkInId: String(action.check_in_id) } })}
        />
      )}
      <Button label="Done" onPress={done} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hero: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  materialTile: {
    width: 88,
    height: 88,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  barTrack: { height: 10, borderRadius: 5, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: colors.success },
  co2Row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
