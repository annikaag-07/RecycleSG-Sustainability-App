import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { api, toApiError, type PersonSummary } from '@/shared/api';
import { AppText, Banner, Button } from '@/shared/components';
import { colors, spacing } from '@/shared/theme';
import { Avatar, personName } from './Avatar';

/**
 * Settings → Privacy → Blocked accounts. A blocked account's profile is hidden from the blocker, so once they leave it
 * this list is the only way to unblock. Unblocking doesn't restore follows.
 */
export function BlockedAccounts() {
  const [people, setPeople] = useState<PersonSummary[]>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [unblocked, setUnblocked] = useState<string>();

  const fetchBlocks = useCallback(async () => {
    try {
      setPeople(await api.social.listMyBlocks());
      setError(undefined);
    } catch (e) {
      setError(toApiError(e).message);
    }
  }, []);

  // Blocking happens on a profile in the Feed tab, so re-read whenever Settings comes back into view.
  useFocusEffect(
    useCallback(() => {
      void fetchBlocks();
    }, [fetchBlocks]),
  );

  const unblock = async (p: PersonSummary) => {
    setBusy(p.user_id);
    setError(undefined);
    setUnblocked(undefined);
    try {
      await api.social.setBlock(p.user_id, false);
      setPeople((list) => list?.filter((x) => x.user_id !== p.user_id));
      setUnblocked(personName(p));
    } catch (e) {
      setError(toApiError(e).message);
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <View style={styles.root}>
      <AppText variant="bodyStrong">Blocked accounts</AppText>
      {error && (
        <Banner tone="error" title={people ? "Couldn't unblock" : "Couldn't load your blocked accounts"}>
          {error}
        </Banner>
      )}
      {error && !people && <Button label="Try again" variant="secondary" onPress={fetchBlocks} />}
      {unblocked && (
        <Banner tone="info">
          {`${unblocked} is unblocked. You don't follow each other any more; follow again from their profile if you want to.`}
        </Banner>
      )}
      {!people ? (
        !error && <ActivityIndicator color={colors.text} />
      ) : people.length === 0 ? (
        <AppText variant="small" color="textMuted">
          You haven't blocked anyone. Blocking someone from their profile hides their posts, comments and likes from you,
          and yours from them.
        </AppText>
      ) : (
        people.map((p) => {
          const name = personName(p);
          return (
            <View key={p.user_id} style={styles.row}>
              <Avatar name={name} />
              <AppText style={styles.fill} numberOfLines={1}>
                {name}
              </AppText>
              <Button
                label="Unblock"
                variant="secondary"
                loading={busy === p.user_id}
                disabled={!!busy}
                onPress={() => unblock(p)}
                accessibilityHint={`Unblocks ${name}`}
                style={styles.button}
              />
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  fill: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  button: { minHeight: 40, paddingHorizontal: spacing.md },
});
