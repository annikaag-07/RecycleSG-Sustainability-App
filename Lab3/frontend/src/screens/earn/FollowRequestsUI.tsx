import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { api, toApiError, type PersonSummary } from '@/shared/api';
import { useAuth } from '@/shared/auth/AuthProvider';
import { AppText, Banner, Button, EmptyState, Header, Screen } from '@/shared/components';
import { colors, spacing } from '@/shared/theme';
import { Avatar, personName } from './Avatar';

/** Requests to follow a followers-only account. Accepting lets them see your posts; declining just removes the request. */
export default function FollowRequestsUI() {
  const { user, isVerified } = useAuth();
  const [people, setPeople] = useState<PersonSummary[]>();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  const fetchRequests = useCallback(async () => {
    if (!user) return;
    try {
      setPeople(await api.social.listFollowRequests());
      setError(undefined);
    } catch (e) {
      setError(toApiError(e).message);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void fetchRequests();
    }, [fetchRequests]),
  );

  if (!user) {
    return (
      <Screen>
        <Header title="Follow requests" leading="back" />
        <Button label="Log in" onPress={() => router.push('/login')} />
      </Screen>
    );
  }

  const decide = async (p: PersonSummary, accept: boolean) => {
    if (!isVerified) return setError(`Verify your email first. Open the link we sent to ${user.email}.`);
    setBusy(p.user_id);
    setError(undefined);
    try {
      await api.social.decideFollowRequest(p.user_id, accept);
      setPeople((list) => list?.filter((x) => x.user_id !== p.user_id));
    } catch (e) {
      setError(toApiError(e).message);
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <Screen scroll>
      <Header title="Follow requests" leading="back" />
      {error && <Banner tone="error">{error}</Banner>}
      {!people ? (
        !error && <ActivityIndicator color={colors.text} style={styles.spinner} />
      ) : people.length === 0 ? (
        <EmptyState icon="user-check" title="No requests" message="When your profile is followers-only, requests to follow you wait here." />
      ) : (
        people.map((p) => {
          const name = personName(p);
          return (
            <View key={p.user_id} style={styles.row}>
              <Avatar name={name} />
              <AppText variant="bodyStrong" style={styles.fill} numberOfLines={1}>
                {name}
              </AppText>
              <Button label="Accept" loading={busy === p.user_id} disabled={!!busy} onPress={() => decide(p, true)} style={styles.button} />
              <Button label="Decline" variant="secondary" disabled={!!busy} onPress={() => decide(p, false)} style={styles.button} />
            </View>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  spinner: { marginTop: spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  button: { minHeight: 40, paddingHorizontal: spacing.md },
});
