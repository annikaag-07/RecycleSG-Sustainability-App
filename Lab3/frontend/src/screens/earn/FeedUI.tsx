import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';

import { api, toApiError, type CommunityFeedItem, type FeedKind, type Post } from '@/shared/api';
import { MAX_PAGE } from '@/shared/api/social';
import { useAuth } from '@/shared/auth/AuthProvider';
import { AppText, Banner, Button, Chip, EmptyState, Header, Screen } from '@/shared/components';
import { colors, spacing } from '@/shared/theme';
import { MaterialTile } from '@/screens/find/PointBits';
import { pointTitle } from '@/screens/find/pointDisplay';
import { Avatar, personName } from './Avatar';
import { PostCard } from './PostCard';
import { clockTime, timeAgo, useNow } from './time';

type Tab = FeedKind | 'drops';
const TABS: { key: Tab; label: string }[] = [
  { key: 'discover', label: 'Discover' },
  { key: 'following', label: 'Following' },
  { key: 'drops', label: 'Verified drops' },
];

const PAGE = 20;

/**
 * UC 5.2: posts from everyone (Discover) or from people you follow (Following), newest first, plus the verified
 * recycling that appears by itself (Verified drops). Guests can read Discover and Verified drops.
 */
export default function FeedUI() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('discover');
  const [unread, setUnread] = useState(0);

  // The bell's count: unread among the latest page, which is enough to say "something new".
  useFocusEffect(
    useCallback(() => {
      if (!user) return setUnread(0);
      api.notifications
        .listMyNotifications(undefined, 20)
        .then((list) => setUnread(list.filter((n) => !n.read_at).length))
        .catch(() => undefined);
    }, [user]),
  );

  return (
    <Screen scroll>
      <Header
        title="Feed"
        trailing={
          <View style={styles.icons}>
            {user && (
              <Pressable onPress={() => router.push('/feed/people')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Find people">
                <Feather name="search" size={22} color={colors.text} />
              </Pressable>
            )}
            {user && (
              <Pressable
                onPress={() => router.push('/feed/inbox')}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={unread ? `Inbox, ${unread} unread` : 'Inbox'}
              >
                <Feather name="bell" size={22} color={colors.text} />
                {unread > 0 && (
                  <View style={styles.badge}>
                    <AppText variant="caption" style={styles.badgeText}>
                      {unread > 9 ? '9+' : unread}
                    </AppText>
                  </View>
                )}
              </Pressable>
            )}
            <Pressable onPress={() => router.push('/feed/compose')} hitSlop={10} accessibilityRole="button" accessibilityLabel="New post">
              <Feather name="plus-square" size={22} color={colors.text} />
            </Pressable>
          </View>
        }
      />
      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Chip key={t.key} label={t.label} selected={tab === t.key} onPress={() => setTab(t.key)} />
        ))}
      </View>

      {tab === 'drops' ? (
        <DropsFeed />
      ) : tab === 'following' && !user ? (
        <EmptyState
          icon="users"
          title="Following needs an account"
          message="Sign in to follow people and see their posts here. Discover works without an account."
        >
          <Button label="Log in" onPress={() => router.push('/login')} />
          <Button label="Create an account" variant="secondary" onPress={() => router.push('/register')} />
        </EmptyState>
      ) : (
        <PostFeed key={tab} feed={tab} onBrowseDiscover={() => setTab('discover')} />
      )}
    </Screen>
  );
}

type Loaded = { posts: Post[]; hasMore: boolean; loadedAt: Date };

function PostFeed({ feed, onBrowseDiscover }: { feed: FeedKind; onBrowseDiscover: () => void }) {
  const { user, isVerified } = useAuth();
  const now = useNow(60_000);
  const [loaded, setLoaded] = useState<Loaded>();
  const [error, setError] = useState<string>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [likeError, setLikeError] = useState<string>();
  const [places, setPlaces] = useState<Map<number, string>>(new Map());
  // How many posts are on screen, so refreshing on focus doesn't drop pages already loaded.
  const shown = useRef(0);
  // Only the latest request may update the list (a refresh can overtake "load more").
  const request = useRef(0);
  const liking = useRef(new Set<number>());

  const addPlaces = useCallback(async (posts: Post[]) => {
    const ids = [...new Set(posts.flatMap((p) => (p.recycling_point_id == null ? [] : [p.recycling_point_id])))];
    if (ids.length === 0) return;
    try {
      const names = await api.social.getPointNames(ids);
      setPlaces((prev) => {
        const next = new Map(prev);
        for (const [id, p] of names) next.set(id, pointTitle(p.name, p.address).title);
        return next;
      });
    } catch {
      // The place is extra detail; the post shows without it.
    }
  }, []);

  const refresh = useCallback(async () => {
    const id = ++request.current;
    setError(undefined);
    const limit = Math.min(MAX_PAGE, Math.max(PAGE, shown.current));
    try {
      const posts = await api.social.listPosts({ feed, limit });
      if (id !== request.current) return;
      shown.current = posts.length;
      setLoaded({ posts, hasMore: posts.length === limit, loadedAt: new Date() });
      void addPlaces(posts);
    } catch (e) {
      // UC 5.2.EX.1: a clear error and a retry, keeping anything already loaded.
      if (id === request.current) setError(toApiError(e).message);
    }
  }, [feed, addPlaces]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const loadMore = async () => {
    const last = loaded?.posts.at(-1);
    if (!loaded || !last) return;
    const id = ++request.current;
    setLoadingMore(true);
    try {
      const page = await api.social.listPosts({ feed, beforeId: last.id, limit: PAGE });
      if (id !== request.current) return;
      shown.current = loaded.posts.length + page.length;
      // A like tapped while this page loaded is already in the list, so add to the list rather than replace it.
      setLoaded((l) => l && { ...l, posts: [...l.posts, ...page], hasMore: page.length === PAGE });
      void addPlaces(page);
    } catch (e) {
      if (id === request.current) setError(toApiError(e).message);
    } finally {
      setLoadingMore(false);
    }
  };

  // Shown straight away, then put back if the server says no.
  const like = async (post: Post) => {
    if (!user) return router.push('/login');
    if (!isVerified) return setLikeError(`Verify your email to like posts. Open the link we sent to ${user.email}.`);
    if (liking.current.has(post.id)) return;
    liking.current.add(post.id);
    const set = (liked: boolean, like_count: number) =>
      setLoaded((l) => l && { ...l, posts: l.posts.map((p) => (p.id === post.id ? { ...p, liked, like_count } : p)) });
    const liked = !post.liked;
    set(liked, post.like_count + (liked ? 1 : -1));
    setLikeError(undefined);
    try {
      await api.social.setPostLike(post.id, liked);
    } catch (e) {
      set(post.liked, post.like_count);
      setLikeError(toApiError(e).message);
    } finally {
      liking.current.delete(post.id);
    }
  };

  if (!loaded) {
    return error ? (
      <>
        <Banner tone="error" title="Couldn't load the feed">
          {error}
        </Banner>
        <Button label="Try again" onPress={refresh} />
      </>
    ) : (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  const { posts, hasMore, loadedAt } = loaded;
  return (
    <>
      {error && (
        <>
          <Banner tone="warning" title="Couldn't refresh">
            {`Showing the feed from ${clockTime(loadedAt)}. ${error}`}
          </Banner>
          <Button label="Try again" variant="secondary" onPress={refresh} />
        </>
      )}
      {likeError && (
        <Banner tone="warning" title="Couldn't update the like">
          {likeError}
        </Banner>
      )}

      {posts.length === 0 ? (
        feed === 'following' ? (
          <EmptyState
            icon="users"
            title="No posts from people you follow"
            message="Follow people from their posts in Discover, or search for them by name, to see what they're recycling here."
          >
            <Button label="Browse Discover" variant="secondary" onPress={onBrowseDiscover} />
            <Button label="Find people" icon="search" variant="secondary" onPress={() => router.push('/feed/people')} />
          </EmptyState>
        ) : (
          <EmptyState icon="image" title="No posts yet" message="Share a photo of your recycling and it shows up here for everyone.">
            <Button label="New post" icon="plus" onPress={() => router.push('/feed/compose')} />
          </EmptyState>
        )
      ) : (
        posts.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            place={p.recycling_point_id == null ? undefined : places.get(p.recycling_point_id)}
            now={now}
            onLike={() => like(p)}
          />
        ))
      )}

      {hasMore && <Button label="Load more" variant="secondary" loading={loadingMore} onPress={loadMore} />}

      <AppText variant="small" color="textFaint">
        {feed === 'discover'
          ? 'Discover shows public posts from public profiles. Posts for followers only appear to the people they’ve approved.'
          : 'Posts from people you follow, including any they share with followers only.'}
      </AppText>
    </>
  );
}

/** get_community_feed returns at most 100 and has no paging, so "load more" asks for a longer list up to that. */
const MAX_DROPS = 100;

type Drops = { items: CommunityFeedItem[]; limit: number; loadedAt: Date };

/** Verified recycling from across Singapore, newest first. It fills itself; nobody has to post. */
function DropsFeed() {
  const now = useNow(60_000);
  const [feed, setFeed] = useState<Drops>();
  const [error, setError] = useState<string>();
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchFeed = useCallback(async (limit: number) => {
    setError(undefined);
    try {
      setFeed({ items: await api.community.getCommunityFeed(limit), limit, loadedAt: new Date() });
    } catch (e) {
      setError(toApiError(e).message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void fetchFeed(PAGE);
    }, [fetchFeed]),
  );

  const loadMore = async () => {
    if (!feed) return;
    setLoadingMore(true);
    await fetchFeed(Math.min(MAX_DROPS, feed.limit + PAGE));
    setLoadingMore(false);
  };

  if (!feed) {
    return error ? (
      <>
        <Banner tone="error" title="Couldn't load the feed">
          {error}
        </Banner>
        <Button label="Try again" onPress={() => fetchFeed(PAGE)} />
      </>
    ) : (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  const { items, limit, loadedAt } = feed;
  const hasMore = items.length === limit && limit < MAX_DROPS;

  return (
    <>
      {error && (
        <>
          <Banner tone="warning" title="Couldn't refresh">
            {`Showing the feed from ${clockTime(loadedAt)}. ${error}`}
          </Banner>
          <Button label="Try again" variant="secondary" onPress={() => fetchFeed(limit)} />
        </>
      )}

      {items.length === 0 ? (
        <EmptyState icon="users" title="Nothing here yet" message="Recycling appears here once it's verified." />
      ) : (
        <View>
          {items.map((item) => (
            <DropRow key={item.activity_id} item={item} now={now} />
          ))}
        </View>
      )}

      {hasMore && <Button label="Load more" variant="secondary" loading={loadingMore} onPress={loadMore} />}
      {items.length >= MAX_DROPS && (
        <AppText variant="small" color="textFaint" style={styles.center}>
          Showing the latest {MAX_DROPS}.
        </AppText>
      )}

      <AppText variant="small" color="textFaint">
        Verified drops appear here by themselves, under the recycler's display name, or as Anonymous Recycler if they haven't
        set one. Drops from followers-only profiles appear only to their followers.
      </AppText>
    </>
  );
}

function DropRow({ item, now }: { item: CommunityFeedItem; now: Date }) {
  const name = personName(item);
  const what = `${item.quantity} ${item.material.toLowerCase()} item${item.quantity === 1 ? '' : 's'}`;
  const when = timeAgo(new Date(item.recycled_at), now);
  return (
    <View style={styles.row} accessible accessibilityLabel={`${name} recycled ${what}, ${when}`}>
      <Avatar name={name} />
      <View style={styles.fill}>
        <AppText numberOfLines={2}>
          <AppText variant="bodyStrong">{name}</AppText> recycled {what}
        </AppText>
        <AppText variant="small" color="textMuted">
          {when}
        </AppText>
      </View>
      <MaterialTile name={item.material} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { textAlign: 'center' },
  centered: { paddingVertical: spacing.xxl, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  icons: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  badge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
  },
  badgeText: { color: '#FFFFFF', letterSpacing: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
