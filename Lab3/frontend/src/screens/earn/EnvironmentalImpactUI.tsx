import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';

import { api, toApiError, type EnvironmentalImpact, type MaterialType, type Profile, type RecyclingAction } from '@/shared/api';
import type { Milestone, MilestoneStatus } from '@/shared/api/proposed';
import { useAuth } from '@/shared/auth/AuthProvider';
import { AppText, Banner, Button, Card, EmptyState, Header, Screen } from '@/shared/components';
import { colors, radius, spacing } from '@/shared/theme';
import { MaterialTile } from '@/screens/find/PointBits';

type Data = { profile: Profile; impact: EnvironmentalImpact; actions: RecyclingAction[]; materials: MaterialType[] };
type Milestones =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; items: Milestone[] };

/** UC 3.3 steps 1–3: what your recycling has done, your Eco Point balance, and the milestones you can put it towards. */
export default function EnvironmentalImpactUI() {
  const { user } = useAuth();
  const [data, setData] = useState<Data>();
  const [error, setError] = useState<string>();
  const [milestones, setMilestones] = useState<Milestones>({ kind: 'loading' });

  const load = useCallback(async () => {
    if (!user) return;
    setError(undefined);
    try {
      const [profile, impact, actions, materials] = await Promise.all([
        api.profile.getMyProfile(user.id),
        api.profile.getMyEnvironmentalImpact(user.id),
        api.checkins.listMyRecyclingActions(200),
        api.points.listMaterialTypes(),
      ]);
      setData({ profile, impact, actions, materials });
    } catch (e) {
      setError(toApiError(e).message);
    }
  }, [user]);

  const loadMilestones = useCallback(async () => {
    if (!user) return;
    setMilestones({ kind: 'loading' });
    try {
      setMilestones({ kind: 'ready', items: await api.proposed.listMilestones() });
    } catch (e) {
      const err = toApiError(e);
      setMilestones(err.code === 'not_available' ? { kind: 'unavailable' } : { kind: 'error', message: err.message });
    }
  }, [user]);

  // Refresh on every visit, so a contribution made on the milestone screen shows up here.
  useFocusEffect(
    useCallback(() => {
      load();
      loadMilestones();
    }, [load, loadMilestones]),
  );

  if (!user) {
    return (
      <Screen>
        <Header title="Your impact" leading="back" />
        <EmptyState icon="globe" title="Log in to see your impact" message="Your recycling, Eco Points and milestone contributions are tied to your account." />
        <Button label="Log in" onPress={() => router.push('/login')} />
      </Screen>
    );
  }
  if (error) {
    return (
      <Screen>
        <Header title="Your impact" leading="back" />
        <Banner tone="error" title="Couldn't load your impact">
          {error}
        </Banner>
        <Button label="Try again" onPress={load} />
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen>
        <Header title="Your impact" leading="back" />
        <View style={styles.centered}>
          <ActivityIndicator color={colors.text} />
        </View>
      </Screen>
    );
  }

  const { profile, impact, actions, materials } = data;
  const pending = actions.filter((a) => a.verification_status === 'Pending');
  const pendingItems = pending.reduce((n, a) => n + a.quantity, 0);
  const byMaterial = verifiedItemsByMaterial(actions, materials);

  return (
    <Screen scroll>
      <Header title="Your impact" leading="back" />

      <View style={styles.stats}>
        <Stat label="Available" value={profile.available_eco_points} hint="Eco Points to contribute" />
        {/* UC 3.3 postcondition 3: contributing spends the available balance, never the lifetime total. */}
        <Stat label="Lifetime" value={profile.eco_points} hint="Eco Points, never reduced" />
      </View>

      <Card label="Environmental impact (estimate)">
        <AppText variant="title">{impact.estimated_co2_saved_kg} kg CO₂</AppText>
        <AppText color="textMuted">
          saved ≈ {impact.tree_equivalents} tree equivalents, from {impact.total_recycled_units} item
          {impact.total_recycled_units === 1 ? '' : 's'} in {impact.total_verified_actions} verified drop
          {impact.total_verified_actions === 1 ? '' : 's'}.
        </AppText>
        {pending.length > 0 && (
          <AppText variant="small" color="warning">
            {pending.length} drop{pending.length === 1 ? '' : 's'} ({pendingItems} item{pendingItems === 1 ? '' : 's'}) waiting for
            verification {pending.length === 1 ? "isn't" : "aren't"} counted yet.
          </AppText>
        )}
        <AppText variant="small" color="textFaint">
          Illustrative estimate from verified recycling only (0.1 kg per item). Not a measured outcome.
        </AppText>
      </Card>

      {byMaterial.length > 0 && (
        <Card label="Verified by material">
          {byMaterial.map(({ name, items }) => (
            <View key={name} style={styles.materialRow}>
              <MaterialTile name={name} />
              <AppText style={styles.fill}>{name}</AppText>
              <AppText variant="bodyStrong">
                {items} item{items === 1 ? '' : 's'}
              </AppText>
            </View>
          ))}
        </Card>
      )}

      <Card label="Community milestones">
        {milestones.kind === 'loading' && <ActivityIndicator color={colors.text} />}
        {milestones.kind === 'unavailable' && (
          <AppText color="textMuted">
            Community milestones aren't available on the server yet. When they are, you'll be able to put your available Eco Points
            towards them here.
          </AppText>
        )}
        {milestones.kind === 'error' && (
          <>
            <AppText color="danger">{milestones.message}</AppText>
            <Button label="Try again" variant="secondary" onPress={loadMilestones} />
          </>
        )}
        {milestones.kind === 'ready' && milestones.items.length === 0 && (
          <AppText color="textMuted">No milestones are open right now.</AppText>
        )}
        {milestones.kind === 'ready' &&
          milestones.items.map((m) => <MilestoneRow key={m.id} milestone={m} onPress={() => router.push(`/you/milestone/${m.id}`)} />)}
      </Card>
    </Screen>
  );
}

function verifiedItemsByMaterial(actions: RecyclingAction[], materials: MaterialType[]) {
  const totals = new Map<number, number>();
  for (const a of actions) {
    if (a.verification_status === 'Verified') totals.set(a.material_type_id, (totals.get(a.material_type_id) ?? 0) + a.quantity);
  }
  return [...totals]
    .map(([id, items]) => ({ name: materials.find((m) => m.id === id)?.name ?? 'Other', items }))
    .sort((a, b) => b.items - a.items);
}

// NFR-QUAL-12: open, awaiting-verification and verified milestones must be clearly told apart — by text, not colour alone.
const STATUS: Record<MilestoneStatus, { label: string; color: string }> = {
  Active: { label: 'Open', color: colors.success },
  AwaitingVerification: { label: 'Awaiting verification', color: colors.warning },
  Verified: { label: 'Verified', color: colors.blueBin },
  VerificationRejected: { label: 'Not verified', color: colors.danger },
};

function MilestoneRow({ milestone: m, onPress }: { milestone: Milestone; onPress: () => void }) {
  const status = STATUS[m.status];
  const progress = m.target_points > 0 ? Math.min(1, m.current_points / m.target_points) : 0;
  const closes = m.closing_date
    ? ` · closes ${new Date(m.closing_date).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}`
    : '';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${m.name}, ${status.label}. ${m.current_points} of ${m.target_points} Eco Points.`}
      style={({ pressed }) => [styles.milestone, pressed && { opacity: 0.7 }]}
    >
      <View style={styles.milestoneHead}>
        <View style={styles.fill}>
          <AppText variant="bodyStrong">{m.name}</AppText>
          <AppText variant="small" color="textMuted">
            {m.organisation}
          </AppText>
        </View>
        <View style={[styles.badge, { borderColor: status.color }]}>
          <AppText variant="caption" style={{ color: status.color }}>
            {status.label}
          </AppText>
        </View>
        <Feather name="chevron-right" size={20} color={colors.textMuted} />
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${progress * 100}%` }]} />
      </View>
      <AppText variant="small" color="textMuted">
        {m.current_points} of {m.target_points} Eco Points{closes}
      </AppText>
    </Pressable>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <View style={styles.stat}>
      <AppText variant="caption" color="textMuted">
        {label}
      </AppText>
      <AppText variant="title">{value}</AppText>
      <AppText variant="small" color="textFaint">
        {hint}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', gap: spacing.md },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: 2 },
  materialRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  milestone: { gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  milestoneHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badge: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: colors.success },
});
