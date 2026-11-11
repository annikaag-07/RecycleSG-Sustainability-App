# Community and moderation API

UI-2 uses these calls for social profiles, leaderboards, the post composer, feeds, comments and follows. UI-1 uses the settings and moderation calls. Call each RPC through `supabase.rpc(name, args)` with the user's access token. A successful void RPC returns null. Row-returning RPCs return arrays. All named parameters below use the exact PostgREST keys. A default value means that the key can be omitted.

## Profiles, follows and blocks

| RPC and arguments | Result |
|---|---|
| `set_profile_visibility(p_visibility)` | Void. Accepts `public` or `followers`. Existing profiles default to public. Profile privacy limits every post, including older posts. |
| `find_social_profiles(p_query, p_limit=20)` | Prefix search on username or display name. Returns `user_id, username, display_name, visibility`. Blocked users are omitted. |
| `get_social_profile(p_user_id)` | One row with the search fields plus `follow_state, bio, avatar_url, follower_count, following_count`. A stranger may see a followers-only account's name to request a follow. Its bio, avatar, and counts are null until approval. |
| `set_follow(p_user_id, p_follow)` | Returns `accepted`, `pending`, or `none`. A public follow takes effect immediately. A private profile owner approves it. Passing false withdraws a request or unfollows. |
| `list_follow_requests()` | Pending incoming requests with `user_id, username, display_name`. |
| `decide_follow_request(p_user_id, p_accept)` | Void. Only the recipient can decide their incoming request. |
| `set_block(p_user_id, p_block)` | Void. Blocking removes follows in both directions and hides the two accounts' content from one another. Unblocking leaves both unfollowed. |
| `get_following_leaderboard(p_period='all_time', p_limit=20)` | Own account and accepted follows with positive scores. Each row has `rank, user_id, username, display_name, level, eco_points`. Use `weekly` for recycling points since Monday at 00:00 Singapore time. |

## Posts and images

The private `post-photos` bucket accepts JPEG, PNG and WebP up to 5 MiB per file. Upload each photo to a unique path such as `<auth-user-uuid>/<random-uuid>.jpg`. Supply one to eight uploaded paths when creating a post. Read the bytes with an authenticated Storage download so each request checks current visibility. A public URL cannot serve this bucket.

| RPC and arguments | Result |
|---|---|
| `create_post(p_request_id, p_photo_paths, p_caption='', p_tags=[], p_recycling_point_id=null, p_visibility='public')` | New numeric post ID. Reuse the UUID and payload on transport retries. Photos stay in supplied order. The caption accepts up to 2,000 characters. Hashtags accept letters, numbers and underscore, up to 50 characters each and 20 per post. |
| `edit_post(p_post_id, p_caption, p_tags, p_recycling_point_id, p_visibility, p_photo_paths=null)` | Void. The owner supplies replacement fields. Omit the photo list to preserve it. Hashtags are stored lowercase without the leading hash. |
| `delete_post(p_post_id)` | Void. Removes the owner's post, likes, comments and post-image associations. The underlying uploaded objects remain private to the owner until storage cleanup. |
| `list_posts(p_feed='discover', p_before_id=null, p_author_id=null, p_hashtag=null, p_recycling_point_id=null, p_post_id=null, p_limit=20)` | Newest visible posts first. Use `following` for accepted follows, `p_author_id` for a profile grid, or `p_post_id` for detail. Filters combine. Each row has `id, author_id, username, display_name, caption, tags, photo_paths, recycling_point_id, visibility, created_at, like_count, comment_count, liked`. |
| `set_post_like(p_post_id, p_liked)` | Void. Setting the same state twice preserves the count. |
| `create_comment(p_post_id, p_request_id, p_body)` | Numeric comment ID. Retries with the same request UUID return the original ID. Bodies must contain text and fit within 2,000 characters. |
| `edit_comment(p_comment_id, p_body)` or `delete_comment(p_comment_id)` | Void. The owner edits or deletes their own comment. |
| `list_post_comments(p_post_id, p_before_id=null, p_limit=20)` | Rows with `id, author_id, username, display_name, body, created_at`, newest first. |

Post and comment pages accept a maximum of 100 rows. Pass the last returned ID as `p_before_id` for the next page. A detail call for hidden, deleted or inaccessible content returns an empty array. Counts exclude interactions from blocked users.

```ts
const { data: id, error } = await supabase.rpc('create_post', {
  p_request_id: requestId,
  p_photo_paths: [uploadedObjectPath],
  p_caption: 'Dropped off paper at N4',
  p_tags: ['paper'],
  p_recycling_point_id: pointId,
});
if (error) throw error;
const { data: detail } = await supabase.rpc('list_posts', { p_post_id: id });
```

## Reports and moderation

| RPC and arguments | Result |
|---|---|
| `report_social_content(p_target_type, p_target_id, p_reason)` | Void. Use `post` or `comment` with a reason of 1 to 500 characters. A reporter contributes once to a target's pending count. |
| `is_content_moderator()` | Boolean. A trusted operator grants access through `social.moderators` or `public.app_admins`. Use this call to show the moderation screen to moderator-only accounts. |
| `admin_moderation_queue()` | Rows match the existing frontend wrapper. Fields are `target_type, target_id, author_id, author_name, excerpt, report_count, reasons, first_reported_at`. The largest report count comes first. |
| `admin_moderate_content(p_target_type, p_target_id, p_content_action, p_user_action, p_note)` | Void. Content action is `dismiss`, `hide`, or `delete`. User action is `none`, `warn`, `suspend`, or `ban`. Closes the pending reports and records the actor, action and note. A suspension lasts seven days. A ban restricts social writes indefinitely. The Auth user also receives a ban expiry. |
| `list_my_moderation_notices()` | Warnings and restrictions for the caller with `id, target_type, target_id, content_action, user_action, note, created_at`. Read on app open to show the moderator's note. |

The backend checks roles on every moderation call. Existing unexpired access tokens still require server-side write checks. Auth refresh and signed-in Storage requests need verification on the target Supabase stack.

## Errors and local evidence

| Code | Client action |
|---|---|
| `22023`, `23514`, `23502` | Fix the invalid field or missing input. A reused request UUID with different content returns `22023`. |
| `23503`, `23505` | Refresh the referenced record or replace a duplicate or already-attached image path. |
| `42501` | The caller lacks permission or has a social restriction. |
| `P0002` | The content or open moderation report is unavailable. Refresh the feed or queue. |

Run `node --test social.test.mjs` in `Lab3/backend/tests`. The tests cover authenticated RPC calls and database Storage policies. Deployment and hosted Auth/Storage HTTP checks are separate.
