// Actual migrations, ephemeral PostgreSQL-compatible database, minimal Supabase
// auth/storage stand-ins. Does NOT test GoTrue, Storage HTTP, PostgREST or concurrency.
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('backend migrations and authenticated RPC contracts', async (t) => {
  const db = new PGlite();
  const a = '11111111-1111-4111-8111-111111111111';
  const b = '33333333-3333-4333-8333-333333333333';
  const request = '22222222-2222-4222-8222-222222222222';
  const rows = async (sql) => (await db.query(sql)).rows;
  const one = async (sql) => (await rows(sql))[0];
  const rejects = (sql, message) => assert.rejects(db.query(sql), message);
  const asUser = async (uid) => db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','${uid}',false); SET ROLE authenticated;`);
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE SCHEMA storage;
      CREATE TABLE auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}', email_confirmed_at timestamptz);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE TABLE storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      CREATE TABLE storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
      GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated,service_role;
      GRANT SELECT,INSERT ON storage.objects TO authenticated;
    `);
    await t.test('all migrations apply in chronological order', async () => {
      const root = new URL('../supabase/migrations/', import.meta.url);
      const files = (await readdir(root)).filter(f => f.endsWith('.sql')).sort();
      assert.ok(files.length >= 30);
      for (const file of files) await db.exec(await readFile(new URL(file, root), 'utf8'));
      t.diagnostic(`${files.length} actual migrations applied`);
    });
    await t.test('private grants and trusted server reads are explicit', async () => {
      for (const table of ['user_badges', 'user_quest_progress']) {
        assert.equal((await one(`SELECT has_table_privilege('anon','public.${table}','SELECT') AS allowed`)).allowed, false);
      }
      for (const role of ['anon', 'authenticated']) {
        assert.equal((await one(`SELECT has_function_privilege('${role}','public.handle_new_user()','EXECUTE') AS allowed`)).allowed, false);
      }
      assert.equal((await one("SELECT has_table_privilege('service_role','public.recycling_actions','SELECT') AS allowed")).allowed, true);
    });
    await db.exec(`
      INSERT INTO auth.users(id,email_confirmed_at) VALUES('${a}',now()),('${b}',now());
      INSERT INTO recycling_points(name,address,latitude,longitude) VALUES('Demo','Classroom',1.35,103.68);
      INSERT INTO recycling_point_materials SELECT 1,id FROM material_types WHERE name IN ('Plastic','Paper','Glass','Metal');
      INSERT INTO storage.objects(bucket_id,name) VALUES('recycling-photos','${a}/demo.jpg');
    `);
    const plastic = (await one("SELECT id FROM material_types WHERE name='Plastic'")).id;
    const quest = (await one("SELECT id FROM quests WHERE quest_type='one_time' ORDER BY id LIMIT 1")).id;
    await asUser(a);
    let checkin, action;
    await t.test('public search and owned check-in', async () => {
      assert.equal((await rows("SELECT * FROM search_recycling_points_by_material('Plastic')")).length, 1);
      assert.equal((await rows('SELECT * FROM search_nearby_recycling_points(1.35,103.68,1,20)')).length, 1);
      checkin = (await one('SELECT create_gps_checkin(1,1.35,103.68) AS id')).id;
      assert.ok(checkin);
    });
    await t.test('distance, cooldown, quantity and photo validation', async () => {
      await rejects('SELECT create_gps_checkin(1,0,0)', /Too far/);
      await rejects('SELECT create_gps_checkin(1,1.35,103.68)', /30|cooldown|recent/i);
      await rejects(`SELECT submit_recycling_activity(${checkin},${plastic},0)`, /Quantity/);
      await rejects(`SELECT submit_recycling_activity(${checkin},${plastic},101)`, /Quantity/);
      await rejects(`SELECT submit_recycling_activity(${checkin},${plastic},1,'${b}/demo.jpg')`, /Invalid photo/);
      await rejects(`SELECT submit_recycling_activity(${checkin},${plastic},1,'${a}/absent.jpg')`, /photo not found/);
    });
    await t.test('another user cannot use the check-in or read owner rows', async () => {
      await asUser(b);
      await rejects(`SELECT submit_recycling_activity(${checkin},${plastic},1)`, /not owned/);
      assert.equal((await rows('SELECT * FROM check_ins')).length, 0);
      await asUser(a);
    });
    await t.test('photo submission starts Pending and cannot be duplicated', async () => {
      action = (await one(`SELECT submit_recycling_activity(${checkin},${plastic},2,'${a}/demo.jpg') AS id`)).id;
      assert.equal((await one('SELECT verification_status FROM recycling_actions')).verification_status, 'Pending');
      assert.equal((await one('SELECT eco_points FROM profiles')).eco_points, 0);
      await rejects(`SELECT submit_recycling_activity(${checkin},${plastic},2)`, /already submitted/);
    });
    await t.test('trusted verification awards once and unlocks progress', async () => {
      await db.exec(`RESET ROLE; UPDATE recycling_actions SET verification_status='Verified',verified_at=now() WHERE id=${action};`);
      await asUser(a);
      assert.deepEqual(await one('SELECT eco_points,available_eco_points,xp,level FROM profiles'),
        { eco_points: 20, available_eco_points: 20, xp: 20, level: 1 });
      assert.ok((await rows('SELECT progress FROM user_quest_progress')).every(p => p.progress === 1));
      assert.equal((await rows('SELECT * FROM user_badges')).length, 1);
      await db.exec(`RESET ROLE; UPDATE recycling_actions SET verification_status='Verified' WHERE id=${action};`);
      await asUser(a);
      assert.equal((await one('SELECT eco_points FROM profiles')).eco_points, 20);
    });
    await t.test('one-time quest reward cannot be claimed twice', async () => {
      assert.equal((await one(`SELECT * FROM claim_quest_reward(${quest},'1970-01-01')`)).new_balance, 30);
      await rejects(`SELECT * FROM claim_quest_reward(${quest},'1970-01-01')`, /already claimed/);
    });
    await t.test('contribution is idempotent and does not reduce lifetime points', async () => {
      const sql = `SELECT * FROM contribute_to_milestone(1,10,'${request}')`;
      const first = await one(sql);
      assert.equal(first.accepted_amount, 10);
      assert.deepEqual(await one(sql), first);
      await rejects(`SELECT * FROM contribute_to_milestone(1,11,'${request}')`, /different contribution/);
      await rejects("SELECT * FROM contribute_to_milestone(1,999,'44444444-4444-4444-8444-444444444444')", /Insufficient/);
      assert.deepEqual(await one('SELECT eco_points,available_eco_points FROM profiles'), { eco_points: 30, available_eco_points: 20 });
    });
    await t.test('impact, anonymous feed and weekly/all-time totals', async () => {
      const impact = await one(`SELECT * FROM get_user_environmental_impact('${a}')`);
      assert.equal(Number(impact.total_recycled_units), 2);
      assert.equal(Number(impact.estimated_co2_saved_kg), 0.2);
      assert.equal((await one('SELECT * FROM get_leaderboard(50)')).eco_points, 30);
      assert.equal((await one('SELECT * FROM get_weekly_leaderboard(50)')).eco_points, 20);
      const feed = await rows('SELECT * FROM get_community_feed(20)');
      assert.equal(feed.length, 1);
      assert.equal(feed[0].username, 'Anonymous Recycler');
      assert.ok(feed[0].recycled_at);
    });
    await t.test('teammate feed exposes trimmed display names, never usernames', async () => {
      await db.exec('RESET ROLE');
      for (const [value, expected] of [[null, 'Anonymous Recycler'], ['', 'Anonymous Recycler'], ['   ', 'Anonymous Recycler'], ['  Demo Recycler  ', 'Demo Recycler']]) {
        await db.query('UPDATE public.profiles SET display_name=$1 WHERE id=$2', [value, a]);
        await db.exec('SET ROLE anon');
        const feed = await rows('SELECT * FROM get_community_feed(20)');
        assert.equal(feed[0].display_name, expected);
        assert.equal(feed[0].username, 'Anonymous Recycler');
        await db.exec('RESET ROLE');
      }
      await asUser(a);
    });
    await t.test('finalizer refuses browser execution and wrong ownership', async () => {
      await rejects(`SELECT * FROM finalize_recycling_activity(${action},'${a}','Verified','plastic',0.9)`, /permission denied/);
      await db.exec('RESET ROLE');
      await rejects(`SELECT * FROM finalize_recycling_activity(${action},'${b}','Verified','plastic',0.9)`, /not found/);
    });
    await t.test('finalizer writes timestamp and repeated requests do not repeat quest progress', async () => {
      await db.exec('RESET ROLE');
      const paper = (await one("SELECT id FROM material_types WHERE name='Paper'")).id;
      const next = (await one(`INSERT INTO recycling_actions(user_id,check_in_id,material_type_id,quantity)
        VALUES('${a}',${checkin},${paper},1) RETURNING id`)).id;
      const sql = `SELECT * FROM finalize_recycling_activity(${next},'${a}','Verified','paper',0.9)`;
      const first = await one(sql);
      assert.ok(first.verified_at);
      const before = await rows('SELECT quest_id,progress FROM user_quest_progress ORDER BY quest_id');
      await Promise.all([db.query(sql), db.query(sql)]);
      assert.deepEqual(await rows('SELECT quest_id,progress FROM user_quest_progress ORDER BY quest_id'),before);
      // Terminal rejection/re-verification cannot be requested through this API.
      assert.equal((await one(`SELECT * FROM finalize_recycling_activity(${next},'${a}','Rejected','glass',0.9)`)).verification_status,'Verified');
      assert.equal((await rows('SELECT * FROM reward_transactions WHERE recycling_action_id='+next)).length,1);
    });
  } finally {
    await db.close();
  }
});
