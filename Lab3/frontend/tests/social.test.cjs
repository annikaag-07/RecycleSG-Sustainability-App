// Offline unit tests for posts, comments and likes (UC 5.1, 5.2). Same approach as components.test.cjs: transpile the
// real TS modules and stub only Supabase.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(relative, stubs = {}) {
  const filename = path.join(__dirname, '../src', relative);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', source)((name) => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    throw new Error(`Unexpected dependency ${name} in ${relative}`);
  }, module, module.exports);
  return module.exports;
}

const errors = load('shared/api/errors.ts');

function social(rpc, from) {
  return load('shared/api/social.ts', { './supabase': { supabase: { rpc, from } }, './errors': errors });
}

test('UI-2: hashtags are stored lowercase without "#", once each, and bad ones are named', () => {
  const r = load('screens/earn/postRules.ts');
  assert.deepEqual(r.parseTags('#Plastic, #angmokio zerowaste #plastic'), { tags: ['plastic', 'angmokio', 'zerowaste'], invalid: [] });
  assert.deepEqual(r.parseTags('  '), { tags: [], invalid: [] });
  assert.deepEqual(r.parseTags('#ok #not-ok #'), { tags: ['ok'], invalid: ['#not-ok', '#'] });
  assert.equal(r.parseTags('#' + 'a'.repeat(51)).invalid.length, 1);
});

test('UI-2: the composer says what stops a post before anything uploads', () => {
  const r = load('screens/earn/postRules.ts');
  const ok = { photoCount: 1, caption: 'Bottles', tagText: '#plastic' };
  assert.equal(r.postProblem(ok, 2000), null);
  assert.match(r.postProblem({ ...ok, photoCount: 0 }, 2000), /at least one photo/);
  assert.match(r.postProblem({ ...ok, caption: 'x'.repeat(2001) }, 2000), /2,000/);
  assert.match(r.postProblem({ ...ok, tagText: '#a-b' }, 2000), /#a-b/);
  assert.match(r.postProblem({ ...ok, tagText: Array.from({ length: 21 }, (_, i) => `#t${i}`).join(' ') }, 2000), /up to 20/);
});

test('UI-2: only a check-in with verified recycling can be linked, with its verified items and points', () => {
  const r = load('screens/earn/postRules.ts');
  const checkIns = [{ id: 3 }, { id: 2 }, { id: 1 }];
  const actions = [
    { id: 30, check_in_id: 3, quantity: 2, verification_status: 'Pending' },
    { id: 20, check_in_id: 2, quantity: 4, verification_status: 'Verified' },
    { id: 21, check_in_id: 2, quantity: 1, verification_status: 'Rejected' },
    { id: 10, check_in_id: 1, quantity: 1, verification_status: 'Verified' },
  ];
  const rewards = [
    { recycling_action_id: 20, eco_points_earned: 40 },
    { recycling_action_id: null, quest_progress_id: 5, eco_points_earned: 100 },
    { recycling_action_id: 10, eco_points_earned: 10 },
  ];
  // Nothing asked for: the latest verified one, not the newer pending one.
  assert.deepEqual(r.linkableCheckIn(checkIns, actions, rewards), { kind: 'verified', checkIn: checkIns[1], items: 4, points: 40 });
  // Asked for from a reward that is still pending.
  assert.deepEqual(r.linkableCheckIn(checkIns, actions, rewards, 3), { kind: 'pending', checkIn: checkIns[0] });
  assert.equal(r.linkableCheckIn(checkIns, actions, rewards, 99), null);
  assert.equal(r.linkableCheckIn([{ id: 3 }], actions.slice(0, 1), rewards), null);
});

test('UI-2: post and comment RPCs use the exact contract keys', async () => {
  const calls = [];
  const s = social(async (name, args) => {
    calls.push({ name, args });
    return { data: name === 'list_posts' || name === 'list_post_comments' || name === 'get_social_profile' ? [] : 7, error: null };
  });
  await s.listPosts({ feed: 'following', beforeId: 50 });
  assert.deepEqual(calls.at(-1), { name: 'list_posts', args: {
    p_feed: 'following', p_before_id: 50, p_author_id: null, p_hashtag: null, p_recycling_point_id: null, p_limit: 20,
  } });
  assert.equal(await s.getPost(9), null, 'a hidden or deleted post reads as null, not an error');
  assert.deepEqual(calls.at(-1).args, { p_post_id: 9, p_limit: 1 });
  assert.equal(await s.createPost({
    requestId: 'r1', photoPaths: ['u/a.jpg'], caption: 'Hi', tags: ['paper'], visibility: 'followers', checkInId: 4,
  }), 7);
  assert.deepEqual(calls.at(-1), { name: 'create_post', args: {
    p_request_id: 'r1', p_photo_paths: ['u/a.jpg'], p_caption: 'Hi', p_tags: ['paper'], p_visibility: 'followers', p_check_in_id: 4,
  } });
  await s.createPost({ requestId: 'r2', photoPaths: ['u/b.jpg'], caption: '', tags: [], visibility: 'public' });
  assert.equal(calls.at(-1).args.p_check_in_id, null);
  await s.setPostLike(7, false);
  assert.deepEqual(calls.at(-1), { name: 'set_post_like', args: { p_post_id: 7, p_liked: false } });
  await s.listComments(7, 3);
  assert.deepEqual(calls.at(-1), { name: 'list_post_comments', args: { p_post_id: 7, p_before_id: 3, p_limit: 20 } });
  await s.createComment(7, 'c1', 'Nice');
  assert.deepEqual(calls.at(-1), { name: 'create_comment', args: { p_post_id: 7, p_request_id: 'c1', p_body: 'Nice' } });
  await s.reportContent('comment', 3, 'Spam');
  assert.deepEqual(calls.at(-1), { name: 'report_social_content', args: { p_target_type: 'comment', p_target_id: 3, p_reason: 'Spam' } });
  await s.setFollow('u2', true);
  assert.deepEqual(calls.at(-1), { name: 'set_follow', args: { p_user_id: 'u2', p_follow: true } });
});

test('UI-2: social error codes become messages a person can act on', async () => {
  const fail = (code, message = 'raw') => social(async () => ({ data: null, error: { code, message } }));
  await assert.rejects(fail('42501').setPostLike(1, true), (e) => e.code === '42501' && /email is verified/.test(e.message));
  await assert.rejects(fail('P0002').createComment(1, 'r', 'x'), /no longer available/);
  await assert.rejects(fail('22023', 'Invalid hashtags').createPost({ requestId: 'r', photoPaths: [], caption: '', tags: [], visibility: 'public' }), /Invalid hashtags/);
  await assert.rejects(fail('PGRST301', 'JWT expired').listPosts(), /JWT expired/);
});

test('UI-2: post photos get a fresh path in the user folder and never overwrite', async () => {
  let n = 0;
  const uploads = [];
  const photos = load('shared/api/photos.ts', {
    './supabase': { supabase: { storage: { from: (bucket) => {
      assert.equal(bucket, 'post-photos');
      return { upload: async (...args) => { uploads.push(args); return { error: null }; } };
    } } } },
    './errors': errors,
    './proposed': { newRequestId: () => `id-${++n}` },
  });
  assert.equal(await photos.uploadPostPhoto('user', { base64: 'YQ==', mimeType: 'image/png' }), 'user/id-1.png');
  assert.equal(await photos.uploadPostPhoto('user', { base64: 'YQ==', mimeType: 'image/png' }), 'user/id-2.png');
  assert.equal(uploads[0][2].upsert, false);
  await assert.rejects(photos.uploadPostPhoto('user', { base64: 'YQ==', mimeType: 'image/heic' }), /JPEG/);
  assert.equal(uploads.length, 2, 'an unsupported type must not reach storage');
});

test('UI-2: default usernames never show as names', () => {
  const stub = () => null;
  const { personName } = load('screens/earn/Avatar.tsx', {
    'react/jsx-runtime': { jsx: stub, jsxs: stub },
    'react-native': { StyleSheet: { create: (s) => s }, View: stub },
    '@/shared/components': { AppText: stub },
    '@/shared/theme': { colors: {} },
  });
  assert.equal(personName({ display_name: ' Paarth ', username: 'user_' + 'a'.repeat(32) }), 'Paarth');
  assert.equal(personName({ display_name: null, username: 'user_' + '0123456789abcdef'.repeat(2) }), 'Anonymous Recycler');
  assert.equal(personName({ display_name: '', username: 'rachel.lim' }), 'rachel.lim');
});

test('UI-2: badge progress is worded by what each badge counts', () => {
  const b = load('screens/earn/badges.ts');
  const badge = (criterion, progress, target, extra = {}) => ({ id: 1, name: 'x', description: null, criterion, target, progress, earned_at: null, ...extra });
  assert.equal(b.progressText(badge('verified_actions', 3, 5)), '3 of 5 verified drops');
  assert.equal(b.progressText(badge('verified_actions', 9, 5)), '5 of 5 verified drops');
  assert.equal(b.progressText(badge('streak', 3, 7)), 'Best run: 3 of 7 days in a row');
  assert.equal(b.progressText(badge('regions', 1, 2)), '1 of 2 regions');
  assert.equal(b.nextStep(badge('verified_actions', 4, 5)), '1 more verified drop to go.');
  assert.equal(b.nextStep(badge('regions', 0, 2)), 'Recycle at a point in 2 more regions.');
  assert.equal(b.nextStep(badge('streak', 3, 7)), 'Recycle on 7 days in a row. Your best so far is 3 days.');
  assert.equal(b.nextStep(badge('streak', 0, 7)), 'Recycle on 7 days in a row.');
  assert.equal(b.nextStep(badge('streak', 7, 7)), 'Unlocks with your next verified drop.');
  assert.equal(b.defaultDescription(badge('regions', 0, 3)), 'Recycle in 3 regions of Singapore');
});

test('UI-2: the closest badge compares share of target across criteria and skips earned ones', () => {
  const b = load('screens/earn/badges.ts');
  const list = [
    { id: 1, criterion: 'verified_actions', target: 1, progress: 1, earned_at: '2026-11-01T00:00:00Z' },
    { id: 2, criterion: 'verified_actions', target: 10, progress: 4 },
    { id: 3, criterion: 'streak', target: 7, progress: 1 },
    { id: 4, criterion: 'regions', target: 2, progress: 1 },
  ];
  assert.equal(b.closestBadge(list).id, 4, '1 of 2 regions beats 4 of 10 drops');
  assert.equal(b.closestBadge([list[0]]), undefined);
  // Same share: fewer steps left wins.
  assert.equal(b.closestBadge([{ id: 5, target: 4, progress: 2 }, { id: 6, target: 2, progress: 1 }]).id, 6);
});

test('UI-2: the following leaderboard maps the app period to the server key', async () => {
  const calls = [];
  const s = social(async (name, args) => { calls.push({ name, args }); return { data: [], error: null }; });
  await s.getFollowingLeaderboard('week');
  await s.getFollowingLeaderboard('all_time', 10);
  assert.deepEqual(calls, [
    { name: 'get_following_leaderboard', args: { p_period: 'weekly', p_limit: 50 } },
    { name: 'get_following_leaderboard', args: { p_period: 'all_time', p_limit: 10 } },
  ]);
});

test('UI-2: inbox entries name the person or thing and know where to go', () => {
  const { describe, actorIds } = load('screens/earn/inbox.ts');
  const names = {
    people: new Map([['u1', 'Ben Lim']]),
    badges: new Map([[3, 'Eco Starter']]),
    quests: new Map([[2, 'Two drops']]),
    milestones: new Map([[7, 'Beach clean-up']]),
  };
  const n = (kind, payload) => ({ id: 1, category: 'social', kind, payload, created_at: '', read_at: null });
  assert.deepEqual(describe(n('like', { actor_id: 'u1', post_id: 9 }), names), { text: 'Ben Lim liked your post', icon: 'heart', target: { to: 'post', id: 9 } });
  assert.equal(describe(n('comment', { actor_id: 'gone', post_id: 9 }), names).text, 'Someone commented on your post');
  assert.deepEqual(describe(n('follow', { actor_id: 'u1' }), names).target, { to: 'user', id: 'u1' });
  assert.equal(describe(n('level_up', { level: 4 }), names).text, 'You reached level 4');
  assert.equal(describe(n('badge_earned', { badge_id: 3 }), names).text, 'You earned the Eco Starter badge');
  assert.equal(describe(n('badge_earned', { badge_id: 99 }), names).text, 'You earned a new badge');
  assert.equal(describe(n('quest_completed', { quest_id: 2 }), names).text, 'You completed “Two drops”. Claim your reward.');
  assert.deepEqual(describe(n('milestone_verified', { milestone_id: 7 }), names).target, { to: 'milestone', id: 7 });
  assert.deepEqual(describe(n('streak_at_risk', { local_date: '2026-11-11' }), names).target, { to: 'find' });
  assert.deepEqual(actorIds([n('like', { actor_id: 'a' }), n('follow', { actor_id: 'a' }), n('level_up', {})]), ['a']);
});

test('UI-2: people, follow request, block, privacy and inbox RPCs use the contract keys', async () => {
  const calls = [];
  const rpc = async (name, args) => { calls.push({ name, args }); return { data: name === 'get_my_notification_preferences' ? [] : [], error: null }; };
  const s = social(rpc);
  assert.deepEqual(await s.findPeople('   '), [], 'a blank search never reaches the server');
  await s.findPeople(' ben ');
  await s.listFollowRequests();
  await s.decideFollowRequest('u2', false);
  await s.setBlock('u2', true);
  await s.setProfileVisibility('followers');
  const n = load('shared/api/notifications.ts', { './supabase': { supabase: { rpc } }, './errors': errors });
  await n.listMyNotifications(40);
  await n.markNotificationRead(5);
  assert.deepEqual(await n.getNotificationPreferences(), { social: true, progress: true, streak_reminder: false }, 'defaults when there is no row');
  await n.setNotificationPreferences({ social: false, progress: true, streak_reminder: true });
  assert.deepEqual(calls, [
    { name: 'find_social_profiles', args: { p_query: 'ben', p_limit: 20 } },
    { name: 'list_follow_requests', args: {} },
    { name: 'decide_follow_request', args: { p_user_id: 'u2', p_accept: false } },
    { name: 'set_block', args: { p_user_id: 'u2', p_block: true } },
    { name: 'set_profile_visibility', args: { p_visibility: 'followers' } },
    { name: 'list_my_notifications', args: { p_before_id: 40, p_limit: 20 } },
    { name: 'mark_notification_read', args: { p_id: 5 } },
    { name: 'get_my_notification_preferences', args: undefined },
    { name: 'set_notification_preferences', args: { p_social: false, p_progress: true, p_streak_reminder: true } },
  ]);
});

test('UI-2: rewards and levels come from the server with the contract keys', async () => {
  const calls = [];
  const rpc = async (name, args) => {
    calls.push({ name, args });
    if (name === 'estimate_recycling_reward') return { data: [{ eco_points: 36, xp: 18 }], error: null };
    return { data: [{ level: 3, xp: 250, xp_step: 100, next_level_xp: 300, remaining_xp: 50 }], error: null };
  };
  const p = load('shared/api/progress.ts', { './supabase': { supabase: { rpc } }, './errors': errors });
  assert.deepEqual(await p.estimateRecyclingReward(4, 3), { eco_points: 36, xp: 18 });
  await p.estimateRecyclingReward(4, 3, '2026-11-12T01:00:00Z');
  assert.equal((await p.getMyLevelProgress()).remaining_xp, 50);
  assert.deepEqual(calls, [
    { name: 'estimate_recycling_reward', args: { p_material_type_id: 4, p_quantity: 3 } },
    { name: 'estimate_recycling_reward', args: { p_material_type_id: 4, p_quantity: 3, p_submitted_at: '2026-11-12T01:00:00Z' } },
    { name: 'get_my_level_progress', args: undefined },
  ]);
  const none = load('shared/api/progress.ts', { './supabase': { supabase: { rpc: async () => ({ data: [], error: null }) } }, './errors': errors });
  await assert.rejects(none.getMyLevelProgress(), (e) => e.code === 'P0002');
});

test('UI-2: the level bar follows the admin-set step, including after it changes', () => {
  const { levelBar } = load('screens/earn/level.ts');
  const lp = (level, xp, step) => ({ level, xp, xp_step: step, next_level_xp: level * step, remaining_xp: Math.max(0, level * step - xp) });
  assert.deepEqual(levelBar(lp(3, 250, 100)), { into: 50, step: 100, fraction: 0.5, text: '250 XP · 50 XP to level 4' });
  assert.equal(levelBar(lp(2, 300, 250)).text, '300 XP · 200 XP to level 3', 'a 250 XP step');
  // The step was raised to 500 after reaching level 3 at 250 XP: the level is kept and the bar starts empty.
  assert.deepEqual(levelBar(lp(3, 250, 500)), { into: 0, step: 500, fraction: 0, text: '250 XP · 1250 XP to level 4' });
  // The step was lowered to 50: already past level 4's start, so the next XP moves the level up.
  assert.deepEqual(levelBar(lp(3, 250, 50)), { into: 50, step: 50, fraction: 1, text: '250 XP · level 4 with your next XP' });
});
