// A post as the feed shows it, and the pieces PostDetailUI reuses: who and where, the like button and the caption.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';

import type { Post } from '@/shared/api';
import { AppText } from '@/shared/components';
import { colors, radius, spacing } from '@/shared/theme';
import { Avatar, personName } from './Avatar';
import { PostPhoto } from './PostPhoto';
import { countLabel } from './postRules';
import { timeAgo } from './time';

export const openPost = (id: number) => router.push({ pathname: '/feed/post/[id]', params: { id: String(id) } });

/** Author, place and time, and the Eco Points the linked check-in earned (UC 5.1: a post carries where it happened). */
export function PostAuthor({ post, place, now, trailing }: { post: Post; place?: string; now: Date; trailing?: ReactNode }) {
  const name = personName(post);
  const when = timeAgo(new Date(post.created_at), now);
  return (
    <View style={styles.author}>
      <Avatar name={name} />
      <View style={styles.fill}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {name}
        </AppText>
        <AppText variant="small" color="textMuted" numberOfLines={1}>
          {[place, when, post.visibility === 'followers' ? 'Followers' : null].filter(Boolean).join(' · ')}
        </AppText>
      </View>
      {post.check_in_points != null && (
        <View style={styles.points} accessibilityLabel={`Earned ${post.check_in_points} Eco Points`}>
          <AppText variant="small" style={styles.bold}>
            +{post.check_in_points} pts
          </AppText>
        </View>
      )}
      {trailing}
    </View>
  );
}

export function LikeButton({ post, onPress }: { post: Post; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={styles.action}
      accessibilityRole="button"
      accessibilityState={{ selected: post.liked }}
      accessibilityLabel={`${post.liked ? 'Unlike' : 'Like'}, ${countLabel(post.like_count, 'like')}`}
    >
      <Feather name="heart" size={22} color={post.liked ? colors.danger : colors.text} />
      <AppText variant="small" style={post.liked && { color: colors.danger }}>
        {post.like_count}
      </AppText>
    </Pressable>
  );
}

export function Caption({ post }: { post: Post }) {
  if (!post.caption.trim() && post.tags.length === 0 && !post.edited_at) return null;
  return (
    <AppText>
      <AppText variant="bodyStrong">{personName(post)}</AppText>
      {post.caption.trim() ? ` ${post.caption.trim()}` : ''}
      {post.tags.map((t) => (
        <AppText key={t} color="textMuted">{` #${t}`}</AppText>
      ))}
      {post.edited_at && <AppText color="textFaint">{' · edited'}</AppText>}
    </AppText>
  );
}

/** UC 5.2 steps 2–4: one post in the feed. The photo and "comments" open the post; the heart likes it here. */
export function PostCard({ post, place, now, onLike }: { post: Post; place?: string; now: Date; onLike: () => void }) {
  const more = post.photo_paths.length - 1;
  return (
    <View style={styles.card}>
      <PostAuthor post={post} place={place} now={now} />
      <Pressable onPress={() => openPost(post.id)} accessibilityRole="button" accessibilityLabel={`Open ${personName(post)}'s post`}>
        <PostPhoto path={post.photo_paths[0]!} label={`Photo from ${personName(post)}`} style={styles.photo} />
        {more > 0 && (
          <View style={styles.more}>
            <AppText variant="small" style={styles.bold}>
              +{more}
            </AppText>
          </View>
        )}
      </Pressable>
      <View style={styles.actions}>
        <LikeButton post={post} onPress={onLike} />
        <Pressable
          onPress={() => openPost(post.id)}
          hitSlop={8}
          style={styles.action}
          accessibilityRole="button"
          accessibilityLabel={`Comments, ${countLabel(post.comment_count, 'comment')}`}
        >
          <Feather name="message-circle" size={22} color={colors.text} />
          <AppText variant="small">{post.comment_count}</AppText>
        </Pressable>
      </View>
      <Caption post={post} />
      {post.comment_count > 0 && (
        <Pressable onPress={() => openPost(post.id)} accessibilityRole="button">
          <AppText variant="small" color="textMuted">
            {post.comment_count === 1 ? 'View 1 comment' : `View all ${post.comment_count} comments`}
          </AppText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bold: { fontWeight: '700' },
  card: { gap: spacing.sm, paddingBottom: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  author: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  points: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.chipSelected },
  photo: { borderRadius: radius.md },
  more: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(14,20,18,0.75)',
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 32 },
});
