import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';

import { api, toApiError, type PersonSummary } from '@/shared/api';
import { useAuth } from '@/shared/auth/AuthProvider';
import { AppText, Banner, Button, EmptyState, Header, Screen, TextField } from '@/shared/components';
import { colors, spacing } from '@/shared/theme';
import { Avatar, personName } from './Avatar';
import { openProfile } from './PostCard';

const DEFAULT_USERNAME = /^user_[0-9a-f]{32}$/;
/** Wait for a pause in typing before searching. */
const DEBOUNCE_MS = 300;

/** Find people by the start of their display name or username, then open their profile to follow them. */
export default function PeopleSearchUI() {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ query: string; people: PersonSummary[] }>();
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string>();
  const latest = useRef('');

  useEffect(() => {
    const q = query.trim();
    latest.current = q;
    if (!q || !user) {
      setResults(undefined);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const people = await api.social.findPeople(q);
        if (latest.current !== q) return;
        setResults({ query: q, people: people.filter((p) => p.user_id !== user.id) });
        setError(undefined);
      } catch (e) {
        if (latest.current === q) setError(toApiError(e).message);
      } finally {
        if (latest.current === q) setSearching(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, user]);

  if (!user) {
    return (
      <Screen>
        <Header title="Find people" leading="back" />
        <EmptyState icon="search" title="Log in to find people" message="Following people needs an account." />
        <Button label="Log in" onPress={() => router.push('/login')} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Header title="Find people" leading="back" />
      <TextField
        icon="search"
        value={query}
        onChangeText={setQuery}
        placeholder="Name or username"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        returnKeyType="search"
        accessibilityLabel="Search people"
      />
      {error && <Banner tone="error">{error}</Banner>}
      {searching && <ActivityIndicator color={colors.text} />}
      {results && results.people.length === 0 && !searching && (
        <EmptyState icon="user-x" title="No one found" message={`No names start with “${results.query}”.`} />
      )}
      {results && results.people.length > 0 && (
        <View>
          {results.people.map((p) => {
            const name = personName(p);
            const detail = [DEFAULT_USERNAME.test(p.username) ? null : `@${p.username}`, p.visibility === 'followers' ? 'Followers only' : null]
              .filter(Boolean)
              .join(' · ');
            return (
              <Pressable key={p.user_id} onPress={() => openProfile(p.user_id)} style={styles.row} accessibilityRole="button" accessibilityLabel={`${name}${detail ? `, ${detail}` : ''}`}>
                <Avatar name={name} />
                <View style={styles.fill}>
                  <AppText variant="bodyStrong" numberOfLines={1}>
                    {name}
                  </AppText>
                  {!!detail && (
                    <AppText variant="small" color="textMuted" numberOfLines={1}>
                      {detail}
                    </AppText>
                  )}
                </View>
                <Feather name="chevron-right" size={20} color={colors.textMuted} />
              </Pressable>
            );
          })}
        </View>
      )}
      {!query.trim() && (
        <AppText variant="small" color="textFaint">
          Type the start of someone's display name or username. People who've blocked you, or whom you've blocked, don't show up.
        </AppText>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
