import { useCallback, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { api, toApiError, type FollowState, type Post, type PostComment, type ReportTarget } from '@/shared/api';
import { MAX_COMMENT } from '@/shared/api/social';
import { useAuth } from '@/shared/auth/AuthProvider';
import { AppText, Banner, Button, Chip, EmptyState, Header } from '@/shared/components';
import { colors, radius, spacing, typography } from '@/shared/theme';
import { pointTitle } from '@/screens/find/pointDisplay';
import { Avatar, personName } from './Avatar';
import { Caption, LikeButton, PostAuthor } from './PostCard';
import { PostPhoto } from './PostPhoto';
import { countLabel } from './postRules';
import { timeAgo, useNow } from './time';

const PAGE = 20;
const REASONS = ['Spam', 'Offensive or inappropriate', 'Not about recycling', 'Something else'];

type Load =
  | { kind: 'loading' }
  | { kind: 'gone' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; post: Post; place?: string };

/**
 * UC 5.2 steps 5–6: one post with all its photos, likes and comments. Your own comments can be edited or deleted,
 * and your own post deleted; anyone signed in can follow the author and report a post or comment.
 */
export default function PostDetailUI() {
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const postId = Number(idParam);
  const { user, isVerified } = useAuth();
  const now = useNow(60_000);

  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  // Oldest first, as a thread reads; the server pages newest first.
  const [comments, setComments] = useState<PostComment[]>([]);
  const [hasEarlier, setHasEarlier] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [follow, setFollowState] = useState<FollowState>();
  const [followBusy, setFollowBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'info' | 'warning'; text: string }>();
  const [reporting, setReporting] = useState<{ target: ReportTarget; id: number }>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState<{ id: number; text: string; saving?: boolean }>();
  const [confirmDeleteComment, setConfirmDeleteComment] = useState<number>();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  // Kept until the comment is accepted, so a retry after a lost response doesn't post it twice.
  const draftRequest = useRef<{ body: string; requestId: string } | null>(null);
  const liking = useRef(false);
  const [photoWidth, setPhotoWidth] = useState(0);
  const [photoIndex, setPhotoIndex] = useState(0);

  const userId = user?.id;
  const fetchAll = useCallback(async () => {
    if (!Number.isInteger(postId)) return setLoad({ kind: 'gone' });
    try {
      const [post, page] = await Promise.all([api.social.getPost(postId), api.social.listComments(postId, undefined, PAGE)]);
      if (!post) return setLoad({ kind: 'gone' });
      setComments(page.slice().reverse());
      setHasEarlier(page.length === PAGE);
      setLoad((l) => ({ kind: 'ready', post, place: l.kind === 'ready' ? l.place : undefined }));
      if (post.recycling_point_id != null) {
        api.social
          .getPointNames([post.recycling_point_id])
          .then((names) => {
            const p = names.get(post.recycling_point_id!);
            if (p) setLoad((l) => (l.kind === 'ready' ? { ...l, place: pointTitle(p.name, p.address).title } : l));
          })
          .catch(() => undefined);
      }
      if (userId && userId !== post.author_id) {
        api.social
          .getSocialProfile(post.author_id)
          .then((profile) => setFollowState(profile?.follow_state))
          .catch(() => undefined);
      }
    } catch (e) {
      // Keep a post already on screen; only say so.
      const message = toApiError(e).message;
      setLoad((l) => (l.kind === 'ready' ? l : { kind: 'error', message }));
      setNotice({ tone: 'warning', text: `Couldn't refresh. ${message}` });
    }
  }, [postId, userId]);

  useFocusEffect(
    useCallback(() => {
      void fetchAll();
    }, [fetchAll]),
  );

  const header = (trailing?: ReactNode) => <Header title="Post" leading="back" trailing={trailing} />;

  if (load.kind !== 'ready') {
    return (
      <SafeAreaView edges={['top']} style={styles.root}>
        <View style={styles.padded}>
          {header()}
          {load.kind === 'loading' ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.text} />
            </View>
          ) : load.kind === 'gone' ? (
            <EmptyState icon="slash" title="This post isn't available" message="It may have been deleted or hidden, or it's only for the author's followers.">
              <Button label="Back to the feed" variant="secondary" onPress={() => router.replace('/feed')} />
            </EmptyState>
          ) : (
            <>
              <Banner tone="error" title="Couldn't load the post">
                {load.message}
              </Banner>
              <Button label="Try again" onPress={fetchAll} />
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const { post, place } = load;
  const mine = userId === post.author_id;
  const canWrite = !!user && isVerified;
  const setPost = (patch: Partial<Post>) => setLoad((l) => (l.kind === 'ready' ? { ...l, post: { ...l.post, ...patch } } : l));
  const needAccount = (what: string) => {
    if (!user) {
      router.push('/login');
      return true;
    }
    if (!isVerified) {
      setNotice({ tone: 'warning', text: `Verify your email to ${what}. Open the link we sent to ${user.email}.` });
      return true;
    }
    return false;
  };

  const like = async () => {
    if (needAccount('like posts') || liking.current) return;
    liking.current = true;
    const before = { liked: post.liked, like_count: post.like_count };
    setPost({ liked: !post.liked, like_count: post.like_count + (post.liked ? -1 : 1) });
    try {
      await api.social.setPostLike(post.id, !before.liked);
    } catch (e) {
      setPost(before);
      setNotice({ tone: 'warning', text: `Couldn't update the like. ${toApiError(e).message}` });
    } finally {
      liking.current = false;
    }
  };

  const toggleFollow = async () => {
    if (needAccount('follow people')) return;
    setFollowBusy(true);
    try {
      setFollowState(await api.social.setFollow(post.author_id, follow === 'none'));
    } catch (e) {
      setNotice({ tone: 'warning', text: toApiError(e).message });
    } finally {
      setFollowBusy(false);
    }
  };

  const deletePost = async () => {
    setDeleting(true);
    try {
      await api.social.deletePost(post.id);
      router.replace('/feed');
    } catch (e) {
      setNotice({ tone: 'warning', text: `Couldn't delete the post. ${toApiError(e).message}` });
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const loadEarlier = async () => {
    const oldest = comments[0];
    if (!oldest) return;
    setLoadingEarlier(true);
    try {
      const page = await api.social.listComments(post.id, oldest.id, PAGE);
      setComments((c) => [...page.slice().reverse(), ...c]);
      setHasEarlier(page.length === PAGE);
    } catch (e) {
      setNotice({ tone: 'warning', text: `Couldn't load earlier comments. ${toApiError(e).message}` });
    } finally {
      setLoadingEarlier(false);
    }
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || needAccount('comment')) return;
    if (draftRequest.current?.body !== body) draftRequest.current = { body, requestId: api.proposed.newRequestId() };
    setSending(true);
    setNotice(undefined);
    try {
      await api.social.createComment(post.id, draftRequest.current.requestId, body);
      draftRequest.current = null;
      setDraft('');
      // Newest page again, merged in, so the new comment and any others posted meanwhile all show.
      const latest = await api.social.listComments(post.id, undefined, PAGE).catch(() => [] as PostComment[]);
      setComments((c) => mergeComments(c, latest));
      setPost({ comment_count: post.comment_count + 1 });
    } catch (e) {
      const err = toApiError(e);
      setNotice({
        tone: 'warning',
        text: err.isNetwork
          ? 'Couldn’t reach the server, so the comment may or may not have gone through. Send it again: it won’t be posted twice.'
          : `Comment not posted. ${err.message}`,
      });
    } finally {
      setSending(false);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    const body = editing.text.trim();
    if (!body) return;
    setEditing({ ...editing, saving: true });
    try {
      await api.social.editComment(editing.id, body);
      setComments((c) => c.map((x) => (x.id === editing.id ? { ...x, body } : x)));
      setEditing(undefined);
    } catch (e) {
      setEditing({ ...editing, saving: false });
      setNotice({ tone: 'warning', text: `Couldn't save the comment. ${toApiError(e).message}` });
    }
  };

  const removeComment = async (id: number) => {
    setConfirmDeleteComment(undefined);
    try {
      await api.social.deleteComment(id);
      setComments((c) => c.filter((x) => x.id !== id));
      setPost({ comment_count: Math.max(0, post.comment_count - 1) });
    } catch (e) {
      setNotice({ tone: 'warning', text: `Couldn't delete the comment. ${toApiError(e).message}` });
    }
  };

  const startReport = (target: ReportTarget, id: number) => {
    if (needAccount('report content')) return;
    setReporting({ target, id });
  };

  const followLabel = follow === 'accepted' ? 'Following' : follow === 'pending' ? 'Requested' : 'Follow';

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.padded} keyboardShouldPersistTaps="handled">
          {header(
            mine ? (
              <IconButton icon="trash-2" label="Delete post" onPress={() => setConfirmDelete(true)} />
            ) : (
              <IconButton icon="flag" label="Report post" onPress={() => startReport('post', post.id)} />
            ),
          )}

          {confirmDelete && (
            <Banner tone="warning" title="Delete this post?">
              {`Its photos, likes and comments go too. This can't be undone.`}
            </Banner>
          )}
          {confirmDelete && (
            <View style={styles.row}>
              <Button label="Delete" variant="danger" loading={deleting} onPress={deletePost} style={styles.fill} />
              <Button label="Cancel" variant="secondary" onPress={() => setConfirmDelete(false)} style={styles.fill} />
            </View>
          )}
          {reporting?.target === 'post' && (
            <ReportPanel
              target="post"
              id={post.id}
              onClose={(sent) => {
                setReporting(undefined);
                if (sent) setNotice({ tone: 'info', text: 'Reported. A moderator will take a look.' });
              }}
            />
          )}
          {notice && (
            <Banner tone={notice.tone} title={notice.tone === 'info' ? 'Thanks' : undefined}>
              {notice.text}
            </Banner>
          )}

          <PostAuthor
            post={post}
            place={place}
            now={now}
            trailing={
              !mine && user && follow ? (
                <Chip label={followBusy ? '…' : followLabel} selected={follow !== 'none'} onPress={followBusy ? undefined : toggleFollow} />
              ) : undefined
            }
          />

          <View onLayout={(e) => setPhotoWidth(e.nativeEvent.layout.width)}>
            {photoWidth > 0 && (
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => setPhotoIndex(Math.round(e.nativeEvent.contentOffset.x / photoWidth))}
                onScroll={Platform.OS === 'web' ? (e) => setPhotoIndex(Math.round(e.nativeEvent.contentOffset.x / photoWidth)) : undefined}
                scrollEventThrottle={100}
                style={styles.photos}
              >
                {post.photo_paths.map((path, i) => (
                  <PostPhoto
                    key={path}
                    path={path}
                    label={`Photo ${i + 1} of ${post.photo_paths.length} from ${personName(post)}`}
                    style={{ width: photoWidth }}
                  />
                ))}
              </ScrollView>
            )}
            {post.photo_paths.length > 1 && (
              <View style={styles.counter}>
                <AppText variant="small" style={styles.bold}>
                  {photoIndex + 1} / {post.photo_paths.length}
                </AppText>
              </View>
            )}
          </View>

          <View style={styles.row}>
            <LikeButton post={post} onPress={like} />
            <View style={styles.action}>
              <Feather name="message-circle" size={22} color={colors.text} />
              <AppText variant="small">{post.comment_count}</AppText>
            </View>
          </View>
          <Caption post={post} />

          <AppText variant="label" color="textMuted">
            {countLabel(post.comment_count, 'comment')}
          </AppText>
          {hasEarlier && <Button label="Show earlier comments" variant="ghost" loading={loadingEarlier} onPress={loadEarlier} />}
          {comments.length === 0 && (
            <AppText variant="small" color="textMuted">
              No comments yet.
            </AppText>
          )}
          {comments.map((c) => {
            const own = c.author_id === userId;
            const name = personName(c);
            if (editing?.id === c.id) {
              return (
                <View key={c.id} style={styles.gap}>
                  <TextInput
                    value={editing.text}
                    onChangeText={(text) => setEditing({ ...editing, text })}
                    maxLength={MAX_COMMENT}
                    multiline
                    autoFocus
                    style={styles.editInput}
                    accessibilityLabel="Edit your comment"
                  />
                  <View style={styles.row}>
                    <Button label="Save" loading={editing.saving} disabled={!editing.text.trim()} onPress={saveEdit} style={styles.fill} />
                    <Button label="Cancel" variant="secondary" onPress={() => setEditing(undefined)} style={styles.fill} />
                  </View>
                </View>
              );
            }
            return (
              <View key={c.id} style={styles.gap}>
                <View style={styles.comment}>
                  <Avatar name={name} />
                  <View style={styles.fill}>
                    <AppText>
                      <AppText variant="bodyStrong">{name}</AppText> {c.body}
                    </AppText>
                    <View style={styles.meta}>
                      <AppText variant="small" color="textFaint">
                        {timeAgo(new Date(c.created_at), now)}
                      </AppText>
                      {own && canWrite && confirmDeleteComment !== c.id && (
                        <>
                          <TextAction label="Edit" onPress={() => setEditing({ id: c.id, text: c.body })} />
                          <TextAction label="Delete" onPress={() => setConfirmDeleteComment(c.id)} />
                        </>
                      )}
                      {own && confirmDeleteComment === c.id && (
                        <>
                          <TextAction label="Delete comment" danger onPress={() => removeComment(c.id)} />
                          <TextAction label="Cancel" onPress={() => setConfirmDeleteComment(undefined)} />
                        </>
                      )}
                      {!own && user && <TextAction label="Report" onPress={() => startReport('comment', c.id)} />}
                    </View>
                  </View>
                </View>
                {reporting?.target === 'comment' && reporting.id === c.id && (
                  <ReportPanel
                    target="comment"
                    id={c.id}
                    onClose={(sent) => {
                      setReporting(undefined);
                      if (sent) setNotice({ tone: 'info', text: 'Reported. A moderator will take a look.' });
                    }}
                  />
                )}
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.composer}>
          {canWrite ? (
            <>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Add a comment…"
                placeholderTextColor={colors.textFaint}
                maxLength={MAX_COMMENT}
                multiline
                style={styles.composerInput}
                accessibilityLabel="Add a comment"
              />
              <Pressable
                onPress={send}
                disabled={!draft.trim() || sending}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Post comment"
                accessibilityState={{ disabled: !draft.trim() || sending }}
              >
                {sending ? (
                  <ActivityIndicator color={colors.text} />
                ) : (
                  <AppText variant="bodyStrong" color={draft.trim() ? 'text' : 'textFaint'}>
                    Post
                  </AppText>
                )}
              </Pressable>
            </>
          ) : user ? (
            <AppText variant="small" color="textMuted" style={styles.fill}>
              Verify your email to comment.
            </AppText>
          ) : (
            <Button label="Log in to comment" variant="secondary" onPress={() => router.push('/login')} style={styles.fill} />
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Comments by ID, oldest first, without duplicates. */
function mergeComments(current: PostComment[], latest: PostComment[]) {
  const byId = new Map(current.map((c) => [c.id, c]));
  for (const c of latest) byId.set(c.id, c);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

/** Pick a reason and send (report_social_content). Each person counts once per post or comment. */
function ReportPanel({ target, id, onClose }: { target: ReportTarget; id: number; onClose: (sent: boolean) => void }) {
  const [reason, setReason] = useState<string>();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async () => {
    if (!reason) return;
    setSending(true);
    setError(undefined);
    try {
      await api.social.reportContent(target, id, reason);
      onClose(true);
    } catch (e) {
      setError(toApiError(e).message);
      setSending(false);
    }
  };

  return (
    <View style={styles.panel}>
      <AppText variant="bodyStrong">Report this {target}</AppText>
      <AppText variant="small" color="textMuted">
        A moderator reviews it. The author isn't told who reported it.
      </AppText>
      <View style={styles.chips}>
        {REASONS.map((r) => (
          <Chip key={r} label={r} selected={reason === r} onPress={() => setReason(r)} />
        ))}
      </View>
      {error && <Banner tone="error">{error}</Banner>}
      <View style={styles.row}>
        <Button label="Send report" disabled={!reason} loading={sending} onPress={submit} style={styles.fill} />
        <Button label="Cancel" variant="secondary" onPress={() => onClose(false)} style={styles.fill} />
      </View>
    </View>
  );
}

function IconButton({ icon, label, onPress }: { icon: 'trash-2' | 'flag'; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={12} accessibilityRole="button" accessibilityLabel={label}>
      <Feather name={icon} size={22} color={colors.text} />
    </Pressable>
  );
}

function TextAction({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label}>
      <AppText variant="small" color={danger ? 'danger' : 'textMuted'} style={styles.bold}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  padded: { paddingHorizontal: spacing.xl, paddingVertical: spacing.lg, gap: spacing.lg },
  centered: { paddingVertical: spacing.xxl, alignItems: 'center' },
  fill: { flex: 1 },
  bold: { fontWeight: '700' },
  gap: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 32 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photos: { borderRadius: radius.md },
  counter: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(14,20,18,0.75)',
  },
  comment: { flexDirection: 'row', gap: spacing.md },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md, marginTop: 2 },
  panel: { gap: spacing.md, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  editInput: {
    ...typography.body,
    color: colors.text,
    minHeight: 64,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.text,
    backgroundColor: colors.surface,
    textAlignVertical: 'top',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  composerInput: { ...typography.body, flex: 1, color: colors.text, maxHeight: 120, paddingVertical: spacing.sm },
});
