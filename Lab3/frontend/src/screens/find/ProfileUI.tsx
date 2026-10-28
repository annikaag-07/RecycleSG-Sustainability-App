import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';

import { api, toApiError, type EnvironmentalImpact, type Profile, type RecyclingAction } from '@/shared/api';
import { useAuth } from '@/shared/auth/AuthProvider';
import { AppText, Banner, Button, Card, EmptyState, Header, Screen, TextField } from '@/shared/components';
import { colors, radius, spacing } from '@/shared/theme';

/** Backend reward trigger: level = 1 + floor(xp / 100) (20261014090646_gamification_rewards.sql). */
const XP_PER_LEVEL = 100;
/** handle_new_user() trigger: 'user_' || uuid without dashes. */
const AUTO_USERNAME = /^user_[0-9a-f]{32}$/;

type Data = {
  profile: Profile;
  impact: EnvironmentalImpact;
  actions: RecyclingAction[];
  pointsVisited: number;
  badgesEarned: number;
};

/** You tab (UC 6.1 step 1, REQ-2.1, REQ-2.5). */
export default function ProfileUI() {
  const { user, isAdmin, isModerator } = useAuth();
  const [data, setData] = useState<Data>();
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setError(undefined);
    try {
      const [profile, impact, actions, checkIns, badges] = await Promise.all([
        api.profile.getMyProfile(user.id),
        api.profile.getMyEnvironmentalImpact(user.id),
        api.checkins.listMyRecyclingActions(200),
        api.checkins.listMyCheckIns(1000),
        api.progress.listMyBadges(),
      ]);
      setData({ profile, impact, actions, pointsVisited: new Set(checkIns.map((c) => c.recycling_point_id)).size, badgesEarned: badges.length });
    } catch (e) {
      setError(toApiError(e).message);
    }
  }, [user]);

  // Refresh whenever the tab is shown, so points earned elsewhere appear.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!user) {
    return (
      <Screen>
        <Header title="You" />
        <EmptyState
          icon="user"
          title="Track your recycling"
          message="Create an account to earn Eco Points and XP, keep a streak, and see your environmental impact."
        />
        <Button label="Create an account" onPress={() => router.push('/register')} />
        <Button label="Log in" variant="secondary" onPress={() => router.push('/login')} />
      </Screen>
    );
  }

  const settingsButton = (
    <Pressable onPress={() => router.push('/you/settings')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Settings">
      <Feather name="settings" size={22} color={colors.text} />
    </Pressable>
  );

  if (error && !data) {
    return (
      <Screen>
        <Header title="You" trailing={settingsButton} />
        <Banner tone="error" title="Couldn't load your profile">
          {error}
        </Banner>
        <Button label="Try again" onPress={load} />
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen>
        <Header title="You" trailing={settingsButton} />
        <ActivityIndicator color={colors.text} />
      </Screen>
    );
  }

  const { profile, impact, actions, pointsVisited } = data;
  const name = profile.display_name || profile.username;
  const xpInto = profile.xp % XP_PER_LEVEL;
  const pending = actions.filter((a) => a.verification_status === 'Pending');

  if (editing) {
    return <EditProfile profile={profile} onDone={(p) => { if (p) setData({ ...data, profile: p }); setEditing(false); }} />;
  }

  return (
    <Screen scroll>
      <Header title="You" trailing={settingsButton} />

      <View style={styles.identity}>
        <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <AppText variant="heading">{initials(name)}</AppText>
        </View>
        <View style={styles.fill}>
          <AppText variant="heading" accessibilityRole="header">
            {name}
          </AppText>
          <AppText variant="small" color="textMuted" numberOfLines={1}>
            {/* The backend's auto-generated "user_<uuid>" is noise until the user picks a username. */}
            {AUTO_USERNAME.test(profile.username) ? '' : `@${profile.username} · `}Level {profile.level}
          </AppText>
        </View>
        <Button label="Edit" variant="secondary" onPress={() => setEditing(true)} style={styles.editBtn} />
      </View>
      {profile.bio ? <AppText color="textMuted">{profile.bio}</AppText> : null}

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
        </AppText>
      </Card>

      <View style={styles.stats}>
        <Stat label="Eco Points" value={profile.eco_points} hint="lifetime" />
        <Stat label="Available" value={profile.available_eco_points} hint="to contribute" />
        <Stat label="Items recycled" value={impact.total_recycled_units} hint="verified" />
        <Stat label="Points visited" value={pointsVisited} />
        <Stat label="Current streak" value="—" hint="not tracked yet" />
        <Stat label="Badges" value={data.badgesEarned} hint="earned" />
      </View>

      <Card label="Environmental impact (estimate)">
        <AppText>
          About <AppText style={styles.bold}>{impact.estimated_co2_saved_kg} kg</AppText> of CO₂ saved ≈{' '}
          <AppText style={styles.bold}>{impact.tree_equivalents}</AppText> tree equivalents.
        </AppText>
        <AppText variant="small" color="textFaint">
          Illustrative estimate from verified recycling only (0.1 kg per item). Not a measured outcome.
        </AppText>
        <Button label="See impact and milestones" variant="secondary" onPress={() => router.push('/you/impact')} />
      </Card>

      <Card label="Recent recycling">
        {actions.length === 0 ? (
          <AppText color="textMuted">No recycling logged yet. Check in at a point from Find to get started.</AppText>
        ) : (
          actions.slice(0, 5).map((a) => (
            <View key={a.id} style={styles.actionRow}>
              <AppText style={styles.fill}>
                {a.quantity} item{a.quantity === 1 ? '' : 's'} · {new Date(a.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}
              </AppText>
              <StatusBadge status={a.verification_status} />
            </View>
          ))
        )}
        {pending.length > 0 && (
          <AppText variant="small" color="textFaint">
            Pending items earn points once they're verified.
          </AppText>
        )}
      </Card>

      {(isAdmin || isModerator) && (
        <Card label="Administrator tools">
          {isAdmin && <Button label="Verify environmental milestones" variant="secondary" onPress={() => router.push('/admin/milestones')} />}
          {isModerator && <Button label="Moderation queue" variant="secondary" onPress={() => router.push('/admin/moderation')} />}
        </Card>
      )}

      {error && <Banner tone="warning">Couldn't refresh: {error}</Banner>}
    </Screen>
  );
}

/** UC 6.1.AC.1 — display name, username and bio are the only editable profile fields on the backend. */
function EditProfile({ profile, onDone }: { profile: Profile; onDone: (p?: Profile) => void }) {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState(profile.display_name ?? '');
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio ?? '');
  const [usernameError, setUsernameError] = useState<string>();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const u = username.trim().toLowerCase();
    // Only validate a changed username: the backend's auto-generated one ("user_" + 32 hex) is 37 characters.
    if (u !== profile.username && !/^[a-z0-9_.]{3,40}$/.test(u)) {
      setUsernameError('3–40 characters: letters, numbers, dots or underscores');
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const updated = await api.profile.updateMyProfile(user!.id, {
        display_name: clean(displayName, 40),
        username: u,
        bio: clean(bio, 160),
      });
      onDone(updated);
    } catch (e) {
      const err = toApiError(e);
      if (err.code === '23505') setUsernameError('That username is taken');
      else setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll>
      <Header title="Edit profile" leading="close" onLeadingPress={() => onDone()} />
      <TextField label="Display name" value={displayName} onChangeText={setDisplayName} maxLength={40} placeholder="How others see you" />
      <TextField
        label="Username"
        value={username}
        onChangeText={(t) => {
          setUsername(t);
          setUsernameError(undefined);
        }}
        error={usernameError}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={40}
      />
      <TextField label="Bio" value={bio} onChangeText={setBio} maxLength={160} hint={`${bio.length}/160`} multiline style={styles.multiline} />
      <AppText variant="small" color="textFaint">
        Profile photos aren't supported yet — the server has no image storage.
      </AppText>
      {error && <Banner tone="error">{error}</Banner>}
      <Button label="Save" onPress={save} loading={saving} />
      <Button label="Cancel" variant="ghost" onPress={() => onDone()} disabled={saving} />
    </Screen>
  );
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value}${hint ? `, ${hint}` : ''}`}>
      <AppText variant="heading">{typeof value === 'number' ? value.toLocaleString('en-SG') : value}</AppText>
      <AppText variant="small" color="textMuted">
        {label}
      </AppText>
      {hint && (
        <AppText variant="caption" color="textFaint">
          {hint}
        </AppText>
      )}
    </View>
  );
}

function StatusBadge({ status }: { status: RecyclingAction['verification_status'] }) {
  // Text + colour, never colour alone (NFR-QUAL-04 / UC 4.1 note).
  const color = status === 'Verified' ? colors.success : status === 'Rejected' ? colors.danger : colors.warning;
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <AppText variant="caption" style={{ color }}>
        {status}
      </AppText>
    </View>
  );
}

const initials = (s: string) =>
  s
    .replace(/^user_/, '')
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';

const clean = (s: string, max: number) => {
  const t = s.replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
  return t ? t.slice(0, max) : null;
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bold: { fontWeight: '700' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtn: { minHeight: 40, paddingHorizontal: spacing.md },
  barTrack: { height: 10, borderRadius: 5, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: colors.success },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  stat: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 96,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  badge: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
});
