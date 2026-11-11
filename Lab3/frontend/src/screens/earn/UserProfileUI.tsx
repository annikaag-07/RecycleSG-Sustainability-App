import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { api, toApiError, type Post, type SocialProfile } from '@/shared/api';
import { useAuth } from '@/shared/auth/AuthProvider';
import { AppText, Banner, Button, EmptyState, Header, Screen } from '@/shared/components';
import { colors, radius, spacing } from '@/shared/theme';
import { Avatar, personName } from './Avatar';
import { openPost } from './PostCard';
import { PostPhoto } from './PostPhoto';

const PAGE = 30;
/** Every account starts with "user_" and its ID; only a chosen username is worth showing. */
const DEFAULT_USERNAME = /^user_[0-9a-f]{32}$/;

type Load =
  | { kind: 'loading' }
  | { kind: 'gone' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; profile: SocialProfile; posts: Post[]; hasMore: boolean };

/**
 * Someone's profile: name, bio, followers and their posts, with Follow and Block. A followers-only account
 * shows its name to strangers so they can ask to follow, and the rest once they're approved.
 */
export default function UserProfileUI() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, isVerified } = useAuth();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [confirmBlock, setConfirmBlock] = useState(false);
  // Blocked from this screen. The server then hides the profile entirely, so this is the only place to undo it.
  const [blocked, setBlocked] = useState<string>();
  const [loadingMore, setLoadingMore] = useState(false);
  const mine = user?.id === id;

  const fetchProfile = useCallback(async () => {
    if (!user || !id) return;
    try {
      const [profile, posts] = await Promise.all([api.social.getSocialProfile(id), api.social.listPosts({ authorId: id, limit: PAGE })]);
      setLoad(profile ? { kind: 'ready', profile, posts, hasMore: posts.length === PAGE } : { kind: 'gone' });
    } catch (e) {
      setLoad({ kind: 'error', message: toApiError(e).message });
    }
  }, [id, user]);

  useFocusEffect(
    useCallback(() => {
      void fetchProfile();
    }, [fetchProfile]),
  );

  if (!user) {
    return (
      <Screen>
        <Header title="Profile" leading="back" />
        <EmptyState icon="user" title="Log in to see profiles" message="Profiles, follows and people search need an account. The feed works without one." />
        <Button label="Log in" onPress={() => router.push('/login')} />
      </Screen>
    );
  }

  const block = async (on: boolean, name: string) => {
    setBusy(true);
    setNotice(undefined);
    try {
      await api.social.setBlock(id, on);
      setConfirmBlock(false);
      if (on) setBlocked(name);
      else {
        setBlocked(undefined);
        setLoad({ kind: 'loading' });
        await fetchProfile();
      }
    } catch (e) {
      setNotice(toApiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  if (blocked) {
    return (
      <Screen>
        <Header title="Profile" leading="back" />
        <EmptyState
          icon="slash"
          title={`You blocked ${blocked}`}
          message="You won't see each other's posts, comments or likes, and you no longer follow each other. They aren't told."
        >
          <Button label="Unblock" variant="secondary" loading={busy} onPress={() => block(false, blocked)} />
        </EmptyState>
        {notice && <Banner tone="warning">{notice}</Banner>}
      </Screen>
    );
  }

  if (load.kind !== 'ready') {
    return (
      <Screen>
        <Header title="Profile" leading="back" />
        {load.kind === 'loading' ? (
          <ActivityIndicator color={colors.text} style={styles.spinner} />
        ) : load.kind === 'gone' ? (
          <EmptyState icon="user-x" title="This profile isn't available" message="The account may have been deleted, or one of you has blocked the other." />
        ) : (
          <>
            <Banner tone="error" title="Couldn't load the profile">
              {load.message}
            </Banner>
            <Button label="Try again" onPress={fetchProfile} />
          </>
        )}
      </Screen>
    );
  }

  const { profile, posts, hasMore } = load;
  const name = personName(profile);
  const state = profile.follow_state;
  // Bio, counts and posts are withheld from a followers-only account until the follow is approved.
  const locked = !mine && profile.visibility === 'followers' && state !== 'accepted';

  const toggleFollow = async () => {
    if (!isVerified) return setNotice(`Verify your email to follow people. Open the link we sent to ${user.email}.`);
    setBusy(true);
    setNotice(undefined);
    try {
      const next = await api.social.setFollow(id, state === 'none');
      // Approval can change what's visible, so reload rather than patch.
      if (next === 'accepted' || state === 'accepted') await fetchProfile();
      else setLoad({ ...load, profile: { ...profile, follow_state: next } });
    } catch (e) {
      setNotice(toApiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const loadMore = async () => {
    const last = posts.at(-1);
    if (!last) return;
    setLoadingMore(true);
    try {
      const page = await api.social.listPosts({ authorId: id, beforeId: last.id, limit: PAGE });
      setLoad({ ...load, posts: [...posts, ...page], hasMore: page.length === PAGE });
    } catch (e) {
      setNotice(toApiError(e).message);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <Screen scroll>
      <Header title="Profile" leading="back" />

      <View style={styles.top}>
        <Avatar name={name} />
        <View style={styles.fill}>
          <AppText variant="heading" numberOfLines={1}>
            {name}
          </AppText>
          <AppText variant="small" color="textMuted" numberOfLines={1}>
            {[DEFAULT_USERNAME.test(profile.username) ? null : `@${profile.username}`, profile.visibility === 'followers' ? 'Followers only' : 'Public']
              .filter(Boolean)
              .join(' · ')}
          </AppText>
        </View>
      </View>

      {!locked && (
        <View style={styles.counts}>
          <Count n={posts.length} more={hasMore} label="posts" />
          <Count n={profile.follower_count ?? 0} label={profile.follower_count === 1 ? 'follower' : 'followers'} />
          <Count n={profile.following_count ?? 0} label="following" />
        </View>
      )}
      {!!profile.bio?.trim() && <AppText>{profile.bio.trim()}</AppText>}

      {mine ? (
        <Button label="Edit your profile" variant="secondary" onPress={() => router.push('/you')} />
      ) : (
        <Button
          label={state === 'accepted' ? 'Following' : state === 'pending' ? 'Requested' : profile.visibility === 'followers' ? 'Request to follow' : 'Follow'}
          variant={state === 'none' ? 'primary' : 'secondary'}
          loading={busy && !confirmBlock}
          onPress={toggleFollow}
          accessibilityHint={state === 'accepted' ? 'Unfollows' : state === 'pending' ? 'Withdraws the request' : undefined}
        />
      )}
      {notice && <Banner tone="warning">{notice}</Banner>}

      {locked ? (
        <EmptyState
          icon="lock"
          title="This account is followers-only"
          message={state === 'pending' ? `${name} hasn't approved your request yet.` : `Ask to follow ${name} to see their posts.`}
        />
      ) : posts.length === 0 ? (
        <EmptyState icon="image" title="No posts yet" message={mine ? 'Your posts show up here.' : `${name} hasn't posted yet.`} />
      ) : (
        <View style={styles.grid}>
          {posts.map((p) => (
            <Pressable key={p.id} onPress={() => openPost(p.id)} style={styles.tile} accessibilityRole="button" accessibilityLabel={`Open post${p.caption ? `: ${p.caption}` : ''}`}>
              <PostPhoto path={p.photo_paths[0]!} label={`Post by ${name}`} style={styles.tilePhoto} />
            </Pressable>
          ))}
        </View>
      )}
      {hasMore && !locked && <Button label="Load more" variant="secondary" loading={loadingMore} onPress={loadMore} />}

      {!mine &&
        (confirmBlock ? (
          <View style={styles.panel}>
            <AppText variant="bodyStrong">Block {name}?</AppText>
            <AppText variant="small" color="textMuted">
              You'll stop following each other, and neither of you will see the other's posts, comments or likes. They aren't told.
            </AppText>
            <View style={styles.row}>
              <Button label="Block" variant="danger" loading={busy} onPress={() => block(true, name)} style={styles.fill} />
              <Button label="Cancel" variant="secondary" onPress={() => setConfirmBlock(false)} style={styles.fill} />
            </View>
          </View>
        ) : (
          <Button label={`Block ${name}`} variant="ghost" onPress={() => setConfirmBlock(true)} />
        ))}
    </Screen>
  );
}

function Count({ n, label, more }: { n: number; label: string; more?: boolean }) {
  return (
    <View style={styles.count} accessible accessibilityLabel={`${n}${more ? '+' : ''} ${label}`}>
      <AppText variant="heading">
        {n}
        {more ? '+' : ''}
      </AppText>
      <AppText variant="small" color="textMuted">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  spinner: { marginTop: spacing.xl },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  counts: { flexDirection: 'row', gap: spacing.md },
  count: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surface },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  tile: { width: '32.5%', aspectRatio: 1 },
  tilePhoto: { width: '100%', height: '100%', borderRadius: radius.sm },
  row: { flexDirection: 'row', gap: spacing.md },
  panel: { gap: spacing.md, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
});
