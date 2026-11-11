// Posts, comments, likes, follows and reports (Lab3/backend/SOCIAL_API.md). Guests can read public posts and their
// comments; every write needs a signed-in account with a confirmed email.
import { supabase } from './supabase';
import { ApiError, toApiError, unwrap } from './errors';
import type { FeedKind, FollowState, Post, PostComment, PostVisibility, ReportTarget, SocialProfile } from './types';

/** The server caps every page at 100. */
export const MAX_PAGE = 100;
export const MAX_PHOTOS = 8;
export const MAX_CAPTION = 2000;
export const MAX_COMMENT = 2000;
export const MAX_REPORT_REASON = 500;

/**
 * The backend's error codes, in words a person can act on. Postgres codes only: anything else (network, storage)
 * keeps its own message.
 */
export function socialError(err: unknown): ApiError {
  const e = toApiError(err);
  switch (e.code) {
    case '42501':
      return new ApiError(
        'Your account can’t do that right now. Check that your email is verified, or see if a moderator has restricted your account.',
        e.code,
      );
    case 'P0002':
      return new ApiError('This is no longer available. It may have been deleted or hidden.', e.code);
    case '22023':
    case '23514':
    case '23502':
      return new ApiError(`The server didn’t accept that: ${e.message}.`, e.code);
    case '23503':
    case '23505':
      return new ApiError('Something changed in the meantime. Refresh and try again.', e.code);
    default:
      return e;
  }
}

async function call<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw socialError(error);
  return data as T;
}

export type ListPostsOptions = {
  feed?: FeedKind;
  /** The last ID already shown, to load the page after it. */
  beforeId?: number;
  authorId?: string;
  hashtag?: string;
  recyclingPointId?: number;
  limit?: number;
};

/** Newest first. Discover is public posts on public profiles; Following needs an account. */
export async function listPosts(o: ListPostsOptions = {}): Promise<Post[]> {
  return call<Post[]>('list_posts', {
    p_feed: o.feed ?? 'discover',
    p_before_id: o.beforeId ?? null,
    p_author_id: o.authorId ?? null,
    p_hashtag: o.hashtag ?? null,
    p_recycling_point_id: o.recyclingPointId ?? null,
    p_limit: o.limit ?? 20,
  });
}

/** One post, or null when it's deleted, hidden or not visible to this viewer. */
export async function getPost(id: number): Promise<Post | null> {
  const rows = await call<Post[]>('list_posts', { p_post_id: id, p_limit: 1 });
  return rows[0] ?? null;
}

export type NewPost = {
  /** Reuse it, with the same fields, when retrying after a lost response. */
  requestId: string;
  photoPaths: string[];
  caption: string;
  tags: string[];
  visibility: PostVisibility;
  /** A verified check-in of the caller's. The server takes the point and the Eco Points earned from it. */
  checkInId?: number | null;
};

/** Returns the new post's ID. A retry with the same request ID and fields returns the same ID. */
export async function createPost(p: NewPost): Promise<number> {
  return call<number>('create_post', {
    p_request_id: p.requestId,
    p_photo_paths: p.photoPaths,
    p_caption: p.caption,
    p_tags: p.tags,
    p_visibility: p.visibility,
    p_check_in_id: p.checkInId ?? null,
  });
}

export async function deletePost(id: number): Promise<void> {
  await call('delete_post', { p_post_id: id });
}

/** Setting the same state twice leaves the count as it is. */
export async function setPostLike(id: number, liked: boolean): Promise<void> {
  await call('set_post_like', { p_post_id: id, p_liked: liked });
}

/** Newest first. Pass the smallest ID already shown as `beforeId` for older comments. */
export async function listComments(postId: number, beforeId?: number, limit = 20): Promise<PostComment[]> {
  return call<PostComment[]>('list_post_comments', { p_post_id: postId, p_before_id: beforeId ?? null, p_limit: limit });
}

/** Returns the comment's ID. A retry with the same request ID and body returns the same ID. */
export async function createComment(postId: number, requestId: string, body: string): Promise<number> {
  return call<number>('create_comment', { p_post_id: postId, p_request_id: requestId, p_body: body });
}

export async function editComment(id: number, body: string): Promise<void> {
  await call('edit_comment', { p_comment_id: id, p_body: body });
}

export async function deleteComment(id: number): Promise<void> {
  await call('delete_comment', { p_comment_id: id });
}

/** Each person counts once towards a post's or comment's pending reports. */
export async function reportContent(target: ReportTarget, id: number, reason: string): Promise<void> {
  await call('report_social_content', { p_target_type: target, p_target_id: id, p_reason: reason });
}

/** Null when the account doesn't exist or one of the two has blocked the other. */
export async function getSocialProfile(userId: string): Promise<SocialProfile | null> {
  const rows = await call<SocialProfile[]>('get_social_profile', { p_user_id: userId });
  return rows[0] ?? null;
}

/** Following a followers-only account sends a request and returns 'pending'. False unfollows or withdraws it. */
export async function setFollow(userId: string, follow: boolean): Promise<FollowState> {
  return call<FollowState>('set_follow', { p_user_id: userId, p_follow: follow });
}

/** Display names for the recycling points posts are linked to. Points are public, so guests can read them. */
export async function getPointNames(ids: number[]): Promise<Map<number, { name: string; address: string }>> {
  const result = new Map<number, { name: string; address: string }>();
  if (ids.length === 0) return result;
  const rows = unwrap(await supabase.from('recycling_points').select('id, name, address').in('id', ids)) as {
    id: number;
    name: string;
    address: string;
  }[];
  for (const r of rows) result.set(r.id, { name: r.name, address: r.address });
  return result;
}
