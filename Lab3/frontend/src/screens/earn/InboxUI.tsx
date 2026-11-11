import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';

import { api, toApiError, type AppNotification } from '@/shared/api';
import { useAuth } from '@/shared/auth/AuthProvider';
import { AppText, Banner, Button, EmptyState, Header, Screen } from '@/shared/components';
import { colors, radius, spacing } from '@/shared/theme';
import { personName } from './Avatar';
import { describe, actorIds, type InboxNames, type InboxTarget } from './inbox';
import { openPost, openProfile } from './PostCard';
import { timeAgo, useNow } from './time';

const PAGE = 20;
const emptyNames = (): InboxNames => ({ people: new Map(), badges: new Map(), quests: new Map(), milestones: new Map() });

function go(t: InboxTarget) {
  switch (t.to) {
    case 'post':
      return openPost(t.id);
    case 'user':
      return openProfile(t.id);
    case 'milestone':
      return router.push({ pathname: '/you/milestone/[id]', params: { id: String(t.id) } });
    case 'collection':
      return router.push('/quests/collection');
    case 'quests':
      return router.push('/quests');
    case 'you':
      return router.push('/you');
    case 'find':
      return router.push('/find');
  }
}

/**
 * REQ-10: likes, comments and follows, level-ups, badges, quests and milestones, newest first. Which kinds arrive is
 * set in Settings. Follow requests for a followers-only account are listed at the top.
 */
export default function InboxUI() {
  const { user } = useAuth();
  const now = useNow(60_000);
  const [items, setItems] = useState<AppNotification[]>();
  const [hasMore, setHasMore] = useState(false);
  const [requests, setRequests] = useState(0);
  const [names, setNames] = useState<InboxNames>(emptyNames);
  const [error, setError] = useState<string>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  // Names already looked up, so paging doesn't fetch them again.
  const known = useRef<{ people: Set<string>; catalogues: boolean }>({ people: new Set(), catalogues: false });

  const addNames = useCallback(async (list: AppNotification[]) => {
    const people = actorIds(list).filter((id) => !known.current.people.has(id));
    people.forEach((id) => known.current.people.add(id));
    const needCatalogues = !known.current.catalogues && list.some((n) => n.category === 'progress');
    if (needCatalogues) known.current.catalogues = true;
    const [profiles, badges, quests, milestones] = await Promise.all([
      Promise.all(people.map((id) => api.social.getSocialProfile(id).catch(() => null))),
      needCatalogues ? api.progress.listBadges().catch(() => []) : Promise.resolve([]),
      needCatalogues ? api.progress.listQuests().catch(() => []) : Promise.resolve([]),
      needCatalogues ? api.milestones.listMilestones().catch(() => []) : Promise.resolve([]),
    ]);
    setNames((prev) => {
      const next = { people: new Map(prev.people), badges: new Map(prev.badges), quests: new Map(prev.quests), milestones: new Map(prev.milestones) };
      for (const p of profiles) if (p) next.people.set(p.user_id, personName(p));
      for (const b of badges) next.badges.set(b.id, b.name);
      for (const q of quests) next.quests.set(q.id, q.title);
      for (const m of milestones) next.milestones.set(m.id, m.name);
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!user) return;
    setError(undefined);
    try {
      const [list, pending] = await Promise.all([
        api.notifications.listMyNotifications(undefined, PAGE),
        api.social.listFollowRequests().catch(() => []),
      ]);
      setItems(list);
      setHasMore(list.length === PAGE);
      setRequests(pending.length);
      void addNames(list);
    } catch (e) {
      setError(toApiError(e).message);
    }
  }, [user, addNames]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  if (!user) {
    return (
      <Screen>
        <Header title="Inbox" leading="back" />
        <EmptyState icon="bell" title="Log in to see your inbox" message="Likes, comments, follows and your progress show up here." />
        <Button label="Log in" onPress={() => router.push('/login')} />
      </Screen>
    );
  }

  const loadMore = async () => {
    const last = items?.at(-1);
    if (!last) return;
    setLoadingMore(true);
    try {
      const page = await api.notifications.listMyNotifications(last.id, PAGE);
      setItems((l) => [...(l ?? []), ...page]);
      setHasMore(page.length === PAGE);
      void addNames(page);
    } catch (e) {
      setError(toApiError(e).message);
    } finally {
      setLoadingMore(false);
    }
  };

  const markRead = (ids: number[]) => {
    const at = new Date().toISOString();
    setItems((l) => l?.map((n) => (ids.includes(n.id) && !n.read_at ? { ...n, read_at: at } : n)));
    // Best effort: the dot comes back on the next refresh if the server didn't take it.
    return Promise.all(ids.map((id) => api.notifications.markNotificationRead(id).catch(() => undefined)));
  };

  const open = (n: AppNotification) => {
    if (!n.read_at) void markRead([n.id]);
    const { target } = describe(n, names);
    if (target) go(target);
  };

  const unread = items?.filter((n) => !n.read_at) ?? [];
  const markAll = async () => {
    setMarkingAll(true);
    await markRead(unread.map((n) => n.id));
    setMarkingAll(false);
  };

  return (
    <Screen scroll>
      <Header
        title="Inbox"
        leading="back"
        trailing={
          unread.length > 0 ? (
            <Pressable onPress={markAll} disabled={markingAll} hitSlop={8} accessibilityRole="button" accessibilityLabel="Mark all as read">
              <AppText variant="small" color="textMuted" style={styles.bold}>
                {markingAll ? 'Marking…' : 'Mark all read'}
              </AppText>
            </Pressable>
          ) : undefined
        }
      />

      {requests > 0 && (
        <Pressable onPress={() => router.push('/feed/requests')} style={styles.requests} accessibilityRole="button">
          <Feather name="user-plus" size={20} color={colors.text} />
          <AppText variant="bodyStrong" style={styles.fill}>
            {requests === 1 ? '1 follow request' : `${requests} follow requests`}
          </AppText>
          <Feather name="chevron-right" size={20} color={colors.textMuted} />
        </Pressable>
      )}

      {error && (
        <>
          <Banner tone={items ? 'warning' : 'error'} title={items ? "Couldn't refresh" : "Couldn't load your inbox"}>
            {error}
          </Banner>
          <Button label="Try again" variant={items ? 'secondary' : 'primary'} onPress={refresh} />
        </>
      )}

      {!items ? (
        !error && <ActivityIndicator color={colors.text} style={styles.spinner} />
      ) : items.length === 0 ? (
        <EmptyState icon="bell" title="Nothing yet" message="Likes, comments, new followers, level-ups and badges show up here." />
      ) : (
        <View>
          {items.map((n) => {
            const d = describe(n, names);
            return (
              <Pressable
                key={n.id}
                onPress={() => open(n)}
                style={styles.row}
                accessibilityRole="button"
                accessibilityLabel={`${n.read_at ? '' : 'Unread. '}${d.text}, ${timeAgo(new Date(n.created_at), now)}`}
              >
                <View style={styles.icon}>
                  <Feather name={d.icon} size={18} color={colors.text} />
                </View>
                <View style={styles.fill}>
                  <AppText variant={n.read_at ? 'body' : 'bodyStrong'}>{d.text}</AppText>
                  <AppText variant="small" color="textMuted">
                    {timeAgo(new Date(n.created_at), now)}
                  </AppText>
                </View>
                {!n.read_at && <View style={styles.dot} />}
              </Pressable>
            );
          })}
        </View>
      )}

      {hasMore && <Button label="Load more" variant="secondary" loading={loadingMore} onPress={loadMore} />}
      <AppText variant="small" color="textFaint">
        Choose which kinds you get in Settings. Notifications show here when the app is open; nothing is sent to your phone.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bold: { fontWeight: '700' },
  spinner: { marginTop: spacing.xl },
  requests: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.userDot },
});
