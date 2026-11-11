import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';

test('members publish, approve followers, interact, block, and moderate through the social API', async t => {
  const {db, a, b, asUser} = await fixture();
  t.after(() => db.close());
  const mod = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const request = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const photo = a + '/test.jpg';
  const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
  const value = async (sql, args = []) => Object.values((await rows(sql, args))[0])[0];
  await db.query('INSERT INTO auth.users(id,email_confirmed_at) VALUES($1,now())', [mod]);
  const point = await value("INSERT INTO recycling_points(name,address,latitude,longitude) VALUES('N4','NTU',1.35,103.68) RETURNING id");

  await asUser(a);
  await rows("SELECT set_profile_visibility('followers')");
  await rows("INSERT INTO storage.objects(bucket_id,name) VALUES('post-photos',$1)", [photo]);
  const create = "SELECT create_post($1,$2,'Paper day',array['#Paper'],$3,'public')";
  const params = [request, [photo], point];
  const post = await value(create, params);
  assert.equal(await value(create, params), post);
  await assert.rejects(rows("SELECT create_post($1,$2,'Changed',array['paper'],$3,'public')",params), /different post/);
  await asUser(b);
  assert.equal((await rows('SELECT * FROM list_posts()')).length, 0);
  assert.equal((await rows('SELECT * FROM storage.objects WHERE name=$1',[photo])).length, 0);
  const username = 'user_' + a.replaceAll('-','');
  assert.equal(await value('SELECT user_id FROM find_social_profiles($1)', [username]), a);
  assert.equal(await value('SELECT set_follow($1,true)', [a]), 'pending');
  await asUser(a);
  assert.equal((await rows('SELECT * FROM list_follow_requests()'))[0].user_id, b);
  await rows('SELECT decide_follow_request($1,true)', [b]);
  await asUser(b);
  assert.equal(await value('SELECT follower_count FROM get_social_profile($1)', [a]), 1);
  const feed = await rows("SELECT * FROM list_posts('following',null,null,'#PAPER',$1)", [point]);
  assert.equal(feed[0].id, post);
  assert.deepEqual(feed[0].photo_paths, [photo]);
  assert.equal((await rows('SELECT * FROM storage.objects WHERE name=$1',[photo])).length, 1);
  await rows('SELECT set_post_like($1,true)', [post]);
  await rows('SELECT set_post_like($1,true)', [post]);
  assert.equal(await value("SELECT like_count FROM list_posts('following')"), 1);
  await rows('SELECT set_post_like($1,false)', [post]);
  const comment = await value('SELECT create_comment($1,$2,$3)', [post,request,'Nice']);
  assert.equal(await value('SELECT create_comment($1,$2,$3)', [post,request,'Nice']),comment);
  await rows('SELECT edit_comment($1,$2)',[comment,'Thanks']);
  assert.equal(await value('SELECT body FROM list_post_comments($1)',[post]),'Thanks');
  await asUser(a);
  await assert.rejects(rows("SELECT edit_comment($1,'mine')",[comment]),/unavailable/);
  await rows('SELECT set_block($1,true)',[b]);
  await asUser(b);
  assert.equal((await rows('SELECT * FROM list_posts()')).length,0);
  await assert.rejects(rows('SELECT set_follow($1,true)',[a]),/unavailable/);
  await assert.rejects(rows('SELECT set_post_like($1,true)',[post]),/unavailable/);
  assert.equal((await rows('SELECT * FROM get_social_profile($1)',[a])).length,0);
  assert.equal((await rows('SELECT * FROM find_social_profiles($1)',[username])).length,0);
  await asUser(a);
  await rows('SELECT set_block($1,false)',[b]);
  await rows("SELECT set_profile_visibility('public')");
  await asUser(b);
  assert.equal(await value('SELECT set_follow($1,true)', [a]), 'accepted');
  await rows("SELECT report_social_content('post',$1,'spam')",[post]);
  await assert.rejects(rows('SELECT * FROM admin_moderation_queue()'), /Moderator required/);
  await db.exec('RESET ROLE');
  await db.query('INSERT INTO social.moderators(user_id) VALUES($1)',[mod]);
  await asUser(mod);
  assert.equal(await value('SELECT report_count FROM admin_moderation_queue()'),1);
  await rows("SELECT admin_moderate_content('post',$1,'hide','suspend','Spam')",[post]);
  assert.equal((await rows('SELECT * FROM admin_moderation_queue()')).length,0);
  await db.exec('RESET ROLE');
  assert.equal(await value('SELECT banned_until > now() FROM auth.users WHERE id=$1',[a]), true);
  await asUser(a);
  assert.equal(await value('SELECT user_action FROM list_my_moderation_notices()'), 'suspend');
  await assert.rejects(rows(create,params),/restricted/);
  assert.equal((await rows('SELECT * FROM list_posts()')).length,0);
});

test('legacy rankings and verified drops respect current viewer privacy', async t => {
  const {db,a,b,asUser} = await fixture();
  t.after(() => db.close());
  const rows = async sql => (await db.query(sql)).rows;
  await db.exec(`
    INSERT INTO recycling_points(name,address,latitude,longitude) VALUES('N4','NTU',1.35,103.68);
    INSERT INTO check_ins(user_id,recycling_point_id,latitude,longitude) VALUES('${a}',1,1.35,103.68);
    INSERT INTO recycling_actions(user_id,check_in_id,material_type_id) SELECT '${a}',1,min(id) FROM material_types;
    UPDATE recycling_actions SET verification_status='Verified',verified_at=now();
  `);
  async function expectVisibility(expected) {
    for (const fn of ['get_community_feed','get_weekly_leaderboard','get_leaderboard']) {
      assert.equal((await rows(`SELECT * FROM ${fn}()`)).length,expected,fn);
    }
  }
  await asUser(b);
  await expectVisibility(1);
  await asUser(a);
  await rows("SELECT set_profile_visibility('followers')");
  await asUser(b);
  await expectVisibility(0);
  await rows(`SELECT set_follow('${a}',true)`);
  await asUser(a);
  await rows(`SELECT decide_follow_request('${b}',true)`);
  await asUser(b);
  await expectVisibility(1);
  for (const period of ['weekly','all_time']) {
    assert.equal((await rows(`SELECT * FROM get_following_leaderboard('${period}')`))[0].user_id,a);
  }
  await asUser(a);
  await rows(`SELECT set_block('${b}',true)`);
  await rows("SELECT set_profile_visibility('public')");
  await asUser(b);
  await expectVisibility(0);
  assert.equal((await rows('SELECT * FROM get_following_leaderboard()')).length,0);
});

test('post detail, editing, comment deletion, and moderation outcomes use the client contracts', async t => {
  const {db,a,b,asUser} = await fixture();
  t.after(() => db.close());
  const rows = async (sql,args=[]) => (await db.query(sql,args)).rows;
  const value = async (sql,args=[]) => Object.values((await rows(sql,args))[0])[0];
  const key='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  await rows('INSERT INTO app_admins(user_id) VALUES($1)',[b]);
  await asUser(a);
  const images=[a+'/first.jpg',a+'/second.png'];
  for (const image of images) await rows("INSERT INTO storage.objects(bucket_id,name) VALUES('post-photos',$1)",[image]);
  const post=await value("SELECT create_post($1,$2,'Before')",[key,[images[0]]]);
  await rows("SELECT edit_post($1,'After',array['glass'],null,'followers',$2)",[post,images]);
  assert.deepEqual((await rows('SELECT caption,tags,photo_paths FROM list_posts(p_post_id => $1)',[post]))[0],
    {caption:'After',tags:['glass'],photo_paths:images});
  await asUser(b);
  assert.equal((await rows('SELECT * FROM list_posts(p_post_id => $1)',[post])).length,0);
  await rows('SELECT delete_post($1)',[post]);
  await asUser(a);
  await rows("SELECT edit_post($1,'After',array['glass'],null,'public')",[post]);
  await asUser(b);
  const comment=await value("SELECT create_comment($1,$2,'hello')",[post,key]);
  await rows("SELECT report_social_content('comment',$1,'reported')",[comment]);
  await rows("SELECT admin_moderate_content('comment',$1,'dismiss','warn','Please be kind')",[comment]);
  assert.equal(await value('SELECT note FROM list_my_moderation_notices()'),'Please be kind');
  await rows('SELECT delete_comment($1)',[comment]);
  assert.equal(await value('SELECT comment_count FROM list_posts(p_post_id => $1)',[post]),0);
  await rows("SELECT report_social_content('post',$1,'reported')",[post]);
  await rows("SELECT admin_moderate_content('post',$1,'delete','ban','Removed')",[post]);
  assert.equal((await rows('SELECT * FROM list_posts(p_post_id => $1)',[post])).length,0);
  assert.equal((await rows("SELECT * FROM storage.objects WHERE bucket_id='post-photos'")).length,0);
  await asUser(a);
  assert.equal(await value('SELECT user_action FROM list_my_moderation_notices()'),'ban');
  await assert.rejects(rows("INSERT INTO storage.objects(bucket_id,name) VALUES('post-photos',$1)",[a+'/third.jpg']),/security/);
});

test('guests read public Discover posts and photos while private posts stay in Following', async t => {
  const {db,a,b,asUser} = await fixture();
  t.after(() => db.close());
  const rows = async (sql,args=[]) => (await db.query(sql,args)).rows;
  await asUser(a);
  for(const visibility of ['public','followers']){
    const photo=a+'/'+visibility+'.jpg';
    await rows("insert into storage.objects(bucket_id,name) values('post-photos',$1)",[photo]);
    await rows("select create_post(gen_random_uuid(),$1,'Demo',array['demo'],null,$2)",[[photo],visibility]);
  }
  await asUser(b);
  await rows('select set_follow($1,true)',[a]);
  assert.deepEqual((await rows("select visibility from list_posts('discover')")).map(p=>p.visibility),['public']);
  assert.equal((await rows("select id from list_posts('following')")).length,2);
  await db.exec("reset role; select set_config('request.jwt.claim.sub','',false); set role anon");
  assert.equal((await rows('select id from list_posts()')).length,1);
  assert.deepEqual(await rows("select name from storage.objects where bucket_id='post-photos'"),[{name:a+'/public.jpg'}]);
  await db.exec('reset role');
  await rows('update auth.users set email_confirmed_at=null where id=$1',[b]);
  await asUser(b);
  await assert.rejects(rows('select set_follow($1,true)',[a]),{code:'42501'});
});

test('reward sharing attaches only the caller’s verified check-in and its awarded points', async t => {
  const {db,a,b,asUser} = await fixture();
  t.after(() => db.close());
  const rows = async (sql,args=[]) => (await db.query(sql,args)).rows;
  const point=(await rows("insert into recycling_points(name,address,latitude,longitude) values('N4','NTU',1.35,103.68) returning id"))[0].id;
  const checkin=(await rows('insert into check_ins(user_id,recycling_point_id,latitude,longitude) values($1,$2,1.35,103.68) returning id',[a,point]))[0].id;
  const action=(await rows('insert into recycling_actions(user_id,check_in_id,material_type_id,quantity) select $1,$2,min(id),2 from material_types returning id',[a,checkin]))[0].id;
  const share=async(user,request)=>rows('select create_post(p_request_id=>$1,p_photo_paths=>$2,p_check_in_id=>$3) as id',[request,[user+'/share.jpg'],checkin]);
  const request='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  for(const user of [a,b]){
    await asUser(user);
    await rows("insert into storage.objects(bucket_id,name) values('post-photos',$1)",[user+'/share.jpg']);
    await assert.rejects(share(user,request),{code:'P0002'});
  }
  await db.exec('reset role');
  await rows("update recycling_actions set verification_status='Verified',verified_at=now() where id=$1",[action]);
  await asUser(b);
  await assert.rejects(share(b,request),{code:'P0002'});
  await asUser(a);
  const [{id}] = await share(a,request);
  assert.deepEqual(await share(a,request),[{id}]);
  assert.deepEqual(await rows('select recycling_point_id,check_in_id,check_in_points,edited_at from list_posts(p_post_id=>$1)',[id]),
    [{recycling_point_id:point,check_in_id:checkin,check_in_points:20,edited_at:null}]);
  await rows("select edit_post($1,'Edited',array[]::text[],$2,'public')",[id,point]);
  assert.ok((await rows('select edited_at from list_posts(p_post_id=>$1)',[id]))[0].edited_at);
});
