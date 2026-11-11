import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';

import {
  api,
  toApiError,
  type ActivityImpact,
  type MaterialType,
  type Profile,
  type RecyclingAction,
  type RewardTransaction,
} from '@/shared/api';
import { useAuth } from '@/shared/auth/AuthProvider';
import { AppText, Banner, Button, Card, EmptyState, Header, Screen } from '@/shared/components';
import { materialMeta } from '@/shared/materials';
import { colors, radius, spacing } from '@/shared/theme';
import { pointTitle } from '@/screens/find/pointDisplay';
import { POINTS_PER_ITEM, XP_PER_LEVEL, logDeadline } from './rules';
import { useNow } from './time';

type Data = {
  action: RecyclingAction;
  materialName: string;
  /** Null when the check-in is too old to look up (only the latest 20 are fetched). */
  placeTitle: string | null;
  /** Materials this point accepts that haven't been logged on this check-in yet (UC 3.2.AC.2). */
  unlogged: MaterialType[];
  checkInAt: string | null;
  profile: Profile;
  reward: RewardTransaction | null;
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
      const [actions, profile, reward, checkIns, materials] = await Promise.all([
        api.checkins.listMyRecyclingActions(50),
        api.profile.getMyProfile(user.id),
        api.checkins.getRewardForAction(actionId),
        api.checkins.listMyCheckIns(20),
        api.points.listMaterialTypes(),
      ]);
      const action = actions.find((a) => a.id === actionId);
      if (!action) return setLoad({ kind: 'notFound' });
      const checkIn = checkIns.find((c) => c.id === action.check_in_id);
      const point = checkIn ? await api.points.getPointDetail(checkIn.recycling_point_id).catch(() => null) : null;
      const loggedHere = new Set(actions.filter((a) => a.check_in_id === action.check_in_id).map((a) => a.material_type_id));
      setLoad({
        kind: 'ready',
        action,
        materialName: materials.find((m) => m.id === action.material_type_id)?.name ?? 'Recycling',
        placeTitle: point ? pointTitle(point.name, point.address).title : null,
        unlogged: point ? point.materials.filter((m) => !loggedHere.has(m.id)) : [],
        checkInAt: checkIn?.checked_in_at ?? null,
        profile,
        reward,
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

  const { action, materialName, placeTitle, unlogged, checkInAt, profile, reward } = load;
  const status = action.verification_status;
  const meta = materialMeta(materialName);
  // Verified rewards come from reward_transactions; before that, show what the server's rule will award.
  const points = reward?.eco_points_earned ?? action.quantity * POINTS_PER_ITEM;
  const xp = reward?.xp_earned ?? action.quantity * POINTS_PER_ITEM;
  const what = `${action.quantity} ${materialName.toLowerCase()} item${action.quantity === 1 ? '' : 's'}${placeTitle ? ` at ${placeTitle}` : ''}`;
  const xpInto = profile.xp % XP_PER_LEVEL;
  const canLogAnother = unlogged.length > 0 && !!checkInAt && now < logDeadline(checkInAt);

  return (
    <Screen scroll>
      <Header leading="close" onLeadingPress={done} />

      <View style={styles.hero}>
        <View style={[styles.materialTile, { backgroundColor: meta.color }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <MaterialCommunityIcons name={meta.icon} size={44} color={colors.text} />
        </View>
        <AppText variant="title" accessibilityRole="header" style={styles.center}>
          {status === 'Verified' ? `+${points} Eco Points` : status === 'Rejected' ? 'Couldn’t be verified' : 'Recycling logged'}
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
          <AppText variant="heading">
            {points} Eco Points · {xp} XP
          </AppText>
          <AppText color="textMuted">
            These are added once the drop is verified. Until then they don't count towards your balance, level, quests or badges.
            You'll see them here and on the You tab when it's done.
          </AppText>
          <AppText variant="small" color="textFaint">
            Once verified, the drop also appears in the community feed under your display name, or as Anonymous Recycler if you
            haven't set one.
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

      <Card label={`Level ${profile.level}`}>
        <View
          style={styles.barTrack}
          accessibilityRole="progressbar"
          accessibilityLabel="Progress to next level"
          accessibilityValue={{ min: 0, max: XP_PER_LEVEL, now: xpInto }}
        >
          <View style={[styles.barFill, { width: `${(xpInto / XP_PER_LEVEL) * 100}%` }]} />
        </View>
        <AppText variant="small" color="textMuted">
          {profile.xp} XP · {XP_PER_LEVEL - xpInto} XP to level {profile.level + 1}
          {status === 'Pending' ? ` · +${xp} XP once verified` : ''}
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
        // UC 3.2.AC.5 asks for a post linked to this drop. The server has no posts, but it lists every verified drop in the
        // community feed by itself, so this one is there already.
        <Button label="See it in the community feed" icon="users" variant="secondary" onPress={() => router.push('/feed')} />
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
