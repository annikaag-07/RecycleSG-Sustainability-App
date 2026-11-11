import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import { api, toApiError } from '@/shared/api';
import type { AddressResult } from '@/shared/api/onemap';
import { useAuth } from '@/shared/auth/AuthProvider';
import { AppText, Banner, Button, Card, Header, Screen, TextField } from '@/shared/components';
import { getLocationPermission, openAppSettings, requestLocationPermission, type PermissionInfo } from '@/shared/location';
import { colors, radius, spacing } from '@/shared/theme';
import { LogoutButton } from './LogoutButton';
import { titleCase } from './pointDisplay';
import {
  DEFAULT_NOTIFICATION_PREFS,
  loadHomeLocation,
  loadNotificationPrefs,
  saveHomeLocation,
  saveNotificationPrefs,
  STREAK_REMINDER_TIME,
  type HomeLocation,
  type NotificationPrefs,
} from './settingsStore';

/** UC 6.1 — notifications, privacy, permissions and account. */
export default function SettingsUI() {
  const { user } = useAuth();

  if (!user) {
    return (
      <Screen>
        <Header title="Settings" leading="back" />
        <Banner tone="info">Log in to manage notifications, privacy and your account.</Banner>
        <Button label="Log in" onPress={() => router.replace('/login')} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Header title="Settings" leading="back" />
      <NotificationSection uid={user.id} />
      <PrivacySection uid={user.id} />
      <PermissionSection />
      <AccountSection email={user.email ?? ''} />
    </Screen>
  );
}

// ------------------------------------------------------------------------------------------------

function NotificationSection({ uid }: { uid: string }) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [saved, setSaved] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    loadNotificationPrefs(uid).then(setPrefs);
  }, [uid]);

  const toggle = async (key: keyof NotificationPrefs, value: boolean) => {
    const previous = prefs;
    const next = { ...prefs, [key]: value };
    setPrefs(next); // UC 6.1 step 5: applies in place, no separate save step
    setError(undefined);
    try {
      await saveNotificationPrefs(uid, next);
      setSaved('Saved');
    } catch {
      setPrefs(previous); // UC 6.1.EX.1: never claim a preference that wasn't stored
      setError("Couldn't save that change. Try again.");
    }
  };

  return (
    <Card label="Notifications">
      <ToggleRow label="Likes, comments and follows" value={prefs.social} onChange={(v) => toggle('social', v)} />
      <ToggleRow label="Level ups, badges and quests" value={prefs.progress} onChange={(v) => toggle('progress', v)} />
      <ToggleRow
        label="Streak at risk reminder"
        detail={`Sent at ${STREAK_REMINDER_TIME} if you haven't recycled that day`}
        value={prefs.streakReminder}
        onChange={(v) => toggle('streakReminder', v)}
      />
      {error && <Banner tone="error">{error}</Banner>}
      <AppText variant="small" color="textFaint" accessibilityLiveRegion="polite">
        {saved ? `${saved} on this device. ` : 'Saved on this device. '}
        The server doesn't send notifications yet, so these take effect once it does.
      </AppText>
    </Card>
  );
}

function PrivacySection({ uid }: { uid: string }) {
  const [home, setHome] = useState<HomeLocation | null>(null);
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<AddressResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    loadHomeLocation(uid).then(setHome);
  }, [uid]);

  const search = async () => {
    if (!q.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      setResults(await api.onemap.searchAddress(q));
    } catch (e) {
      setError(toApiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const choose = async (r: AddressResult | null) => {
    const next = r ? { latitude: r.latitude, longitude: r.longitude, label: titleCase(r.label) } : null;
    try {
      await saveHomeLocation(uid, next);
      setHome(next);
      setEditing(false);
      setResults(null);
      setQ('');
    } catch {
      setError("Couldn't save your home location. Try again.");
    }
  };

  return (
    <Card label="Privacy">
      <View style={styles.row}>
        <View style={styles.fill}>
          <AppText variant="bodyStrong">Profile and posts</AppText>
          <AppText variant="small" color="textMuted">
            Public by default (stated at sign-up).
          </AppText>
        </View>
      </View>
      <View style={styles.segment} accessibilityRole="radiogroup">
        {['Public', 'Followers only'].map((v, i) => (
          <View key={v} style={[styles.segmentItem, i === 0 && styles.segmentOn]} accessibilityRole="radio" accessibilityState={{ checked: i === 0, disabled: true }}>
            <AppText variant="small" color={i === 0 ? 'text' : 'textFaint'}>
              {v}
            </AppText>
          </View>
        ))}
      </View>
      <AppText variant="small" color="textFaint">
        Changing visibility needs posts on the server, which aren't available yet — so this can't be switched for now.
      </AppText>

      <View style={styles.divider} />
      <AppText variant="bodyStrong">Home location</AppText>
      <AppText variant="small" color="textMuted">
        {home ? home.label : 'Not set'} · used as a starting point when location is off. Never shown to other users.
      </AppText>
      {editing ? (
        <>
          <TextField
            label="Address or postal code"
            icon="search"
            value={q}
            onChangeText={setQ}
            onSubmitEditing={search}
            returnKeyType="search"
            placeholder="e.g. 560409"
          />
          <Button label="Search" variant="secondary" onPress={search} loading={busy} />
          {results?.length === 0 && <Banner tone="info">No matching address.</Banner>}
          {results?.map((r) => (
            <Pressable key={`${r.latitude},${r.longitude},${r.address}`} onPress={() => choose(r)} accessibilityRole="button" style={styles.result}>
              <AppText variant="small">{r.address}</AppText>
            </Pressable>
          ))}
          <Button label="Cancel" variant="ghost" onPress={() => setEditing(false)} />
        </>
      ) : (
        <View style={styles.inline}>
          <Button label={home ? 'Change' : 'Set home location'} variant="secondary" style={styles.fill} onPress={() => setEditing(true)} />
          {home && <Button label="Remove" variant="ghost" onPress={() => choose(null)} />}
        </View>
      )}
      {error && <Banner tone="error">{error}</Banner>}
    </Card>
  );
}

function PermissionSection() {
  const [location, setLocation] = useState<PermissionInfo>();
  const [camera, setCamera] = useState<PermissionInfo>();

  const refresh = useCallback(async () => {
    setLocation(await getLocationPermission());
    const c = await ImagePicker.getCameraPermissionsAsync();
    setCamera({ status: c.status as PermissionInfo['status'], canAskAgain: c.canAskAgain });
  }, []);

  useEffect(() => {
    refresh();
    // The OS is the authority on permissions; re-read when returning from Settings (UC 6.1 assumptions).
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]);

  const askLocation = async () => {
    if (location && !location.canAskAgain) return openAppSettings();
    setLocation(await requestLocationPermission());
  };
  const askCamera = async () => {
    if (camera && !camera.canAskAgain) return openAppSettings();
    const c = await ImagePicker.requestCameraPermissionsAsync();
    setCamera({ status: c.status as PermissionInfo['status'], canAskAgain: c.canAskAgain });
  };

  return (
    <Card label="Permissions">
      <PermissionRow
        label="Location"
        purpose="Sorts points by distance and checks you in at a bin. Without it, search by address still works."
        info={location}
        onAsk={askLocation}
      />
      <PermissionRow label="Camera" purpose="Photos of your recycling and of problems you report." info={camera} onAsk={askCamera} />
      {Platform.OS === 'web' && (
        <AppText variant="small" color="textFaint">
          In a browser, blocked permissions are changed in the site settings next to the address bar.
        </AppText>
      )}
    </Card>
  );
}

function AccountSection({ email }: { email: string }) {
  const [busy, setBusy] = useState<'reset' | 'delete'>();
  const [message, setMessage] = useState<{ tone: 'info' | 'error'; text: string }>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typed, setTyped] = useState('');

  const sendReset = async () => {
    setBusy('reset');
    setMessage(undefined);
    try {
      await api.auth.sendPasswordReset(email);
      setMessage({ tone: 'info', text: `A password reset link was sent to ${email}.` });
    } catch (e) {
      setMessage({ tone: 'error', text: toApiError(e).message });
    } finally {
      setBusy(undefined);
    }
  };

  const deleteAccount = async () => {
    setBusy('delete');
    setMessage(undefined);
    try {
      await api.proposed.deleteMyAccount();
      await api.auth.signOut().catch(() => undefined);
      router.replace('/login');
    } catch (e) {
      const err = toApiError(e);
      setMessage({ tone: 'error', text: `Account removal needs another attempt. ${err.message}` });
      setBusy(undefined);
    }
  };

  return (
    <Card label="Account">
      <AppText color="textMuted">Signed in as {email}</AppText>
      {message && <Banner tone={message.tone}>{message.text}</Banner>}
      <Button label="Change password" variant="secondary" onPress={sendReset} loading={busy === 'reset'} disabled={!!busy} />
      <LogoutButton disabled={!!busy} />
      {!confirmDelete ? (
        <Button label="Delete account and data" variant="ghost" onPress={() => setConfirmDelete(true)} disabled={!!busy} />
      ) : (
        <View style={styles.dangerBox}>
          <AppText variant="bodyStrong" style={{ color: colors.danger }}>
            Delete your account?
          </AppText>
          <AppText variant="small" color="textMuted">
            This removes your profile, check-ins, recycling history and Eco Points. It cannot be undone. Type DELETE to confirm.
          </AppText>
          <TextField accessibilityLabel="Type DELETE to confirm" value={typed} onChangeText={setTyped} autoCapitalize="characters" />
          <Button
            label="Delete permanently"
            variant="danger"
            onPress={deleteAccount}
            loading={busy === 'delete'}
            disabled={typed.trim() !== 'DELETE' || !!busy}
          />
          <Button label="Cancel" variant="ghost" onPress={() => { setConfirmDelete(false); setTyped(''); }} disabled={!!busy} />
        </View>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------------------------------------

function ToggleRow({ label, detail, value, onChange }: { label: string; detail?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.row}>
      <View style={styles.fill}>
        <AppText variant="bodyStrong">{label}</AppText>
        {detail && (
          <AppText variant="small" color="textMuted">
            {detail}
          </AppText>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ false: colors.borderStrong, true: colors.success }}
        thumbColor={colors.text}
      />
    </View>
  );
}

function PermissionRow({ label, purpose, info, onAsk }: { label: string; purpose: string; info?: PermissionInfo; onAsk: () => void }) {
  const granted = info?.status === 'granted';
  const status = !info ? 'Checking…' : granted ? 'Allowed' : info.status === 'denied' ? 'Not allowed' : 'Not asked yet';
  return (
    <View style={styles.row}>
      <View style={styles.fill}>
        <AppText variant="bodyStrong">
          {label} · <AppText color={granted ? 'success' : 'textMuted'}>{status}</AppText>
        </AppText>
        <AppText variant="small" color="textMuted">
          {purpose}
        </AppText>
      </View>
      {info && !granted && (
        <Button
          label={info.canAskAgain ? 'Allow' : Platform.OS === 'web' ? 'Blocked' : 'Open settings'}
          variant="secondary"
          onPress={onAsk}
          disabled={!info.canAskAgain && Platform.OS === 'web'}
          style={styles.smallBtn}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  inline: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  segment: { flexDirection: 'row', backgroundColor: colors.chip, borderRadius: radius.pill, padding: 3 },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.pill },
  segmentOn: { backgroundColor: colors.chipSelected },
  result: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceRaised },
  smallBtn: { minHeight: 40, paddingHorizontal: spacing.md },
  dangerBox: { gap: spacing.sm, borderWidth: 1, borderColor: colors.dangerBorder, borderRadius: radius.md, padding: spacing.md },
});
