import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { api, toApiError } from '@/shared/api';
import { AppText, Banner, Button } from '@/shared/components';
import { colors, radius, spacing } from '@/shared/theme';

/**
 * Log out (REQ-1.6, dialog map: ProfileUI / SettingsUI —Log out→ LoginUI).
 * Ends the session, then replaces the stack with Log in so Back can't return to a signed-in screen.
 * Confirms inline because web has no native dialogs.
 */
export function LogoutButton({ disabled }: { disabled?: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const logOut = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await api.auth.signOut();
      router.replace('/login');
    } catch (e) {
      setError(toApiError(e).message);
      setBusy(false);
    }
  };

  if (!confirming) {
    return <Button label="Log out" icon="log-out" variant="secondary" onPress={() => setConfirming(true)} disabled={disabled} />;
  }

  return (
    <View style={styles.box} accessibilityLiveRegion="polite">
      <AppText variant="bodyStrong">Log out of RecycleSG?</AppText>
      <AppText variant="small" color="textMuted">
        You'll go back to Log in. Your points and history stay on your account.
      </AppText>
      {error && <Banner tone="error">{error}</Banner>}
      <Button label="Yes, log out" onPress={logOut} loading={busy} />
      <Button label="Cancel" variant="ghost" onPress={() => setConfirming(false)} disabled={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, padding: spacing.md },
});
