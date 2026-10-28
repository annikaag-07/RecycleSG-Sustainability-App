import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { api, toApiError, type CommunityFeedItem } from '@/shared/api';
import { AppText, Banner, Button, EmptyState, Header, Screen } from '@/shared/components';
import { colors, spacing } from '@/shared/theme';
import { MaterialTile } from '@/screens/find/PointBits';
import { Avatar, personName } from './Avatar';
import { clockTime, timeAgo, useNow } from './time';

const PAGE = 20;
/** get_community_feed returns at most 100 and has no paging, so "load more" asks for a longer list up to that. */
const MAX = 100;

type Feed = { items: CommunityFeedItem[]; limit: number; loadedAt: Date };

/**
 * UC 5.2, as far as the server goes: verified recycling from across Singapore, newest first, by display name (usernames
 * are never shown). The server has no posts, follows, likes or comments yet, so there's no Following tab and nothing to open or reply to.
 */
export default function FeedUI() {
  const now = useNow(60_000);
  const [feed, setFeed] = useState<Feed>();
  const [error, setError] = useState<string>();
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchFeed = useCallback(async (limit: number) => {
    setError(undefined);
    try {
      setFeed({ items: await api.community.getCommunityFeed(limit), limit, loadedAt: new Date() });
    } catch (e) {
      // UC 5.2.EX.1: a clear error and a retry, keeping anything already loaded.
      setError(toApiError(e).message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchFeed(PAGE);
    }, [fetchFeed]),
  );

  const loadMore = async () => {
    if (!feed) return;
    setLoadingMore(true);
    await fetchFeed(Math.min(MAX, feed.limit + PAGE));
    setLoadingMore(false);
  };

  if (!feed) {
    return (
      <Screen>
        <Header title="Community" />
        {error ? (
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
        )}
      </Screen>
    );
  }

  const { items, limit, loadedAt } = feed;
  const hasMore = items.length === limit && limit < MAX;

  return (
    <Screen scroll>
      <Header title="Community" />
      <AppText color="textMuted">Verified recycling from across Singapore</AppText>

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
            <FeedRow key={item.activity_id} item={item} now={now} />
          ))}
        </View>
      )}

      {hasMore && <Button label="Load more" variant="secondary" loading={loadingMore} onPress={loadMore} />}
      {items.length >= MAX && (
        <AppText variant="small" color="textFaint" style={styles.center}>
          Showing the latest {MAX}.
        </AppText>
      )}

      <AppText variant="small" color="textFaint">
        Every verified drop is shown here under the recycler's display name, or as Anonymous Recycler if they haven't set
        one. Posts, photos, likes and comments aren't available yet.
      </AppText>
    </Screen>
  );
}

function FeedRow({ item, now }: { item: CommunityFeedItem; now: Date }) {
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
