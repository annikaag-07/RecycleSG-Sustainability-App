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
