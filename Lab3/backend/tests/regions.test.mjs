import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { applyMigrations, applyTestDatabase, fixture } from './fixture.mjs';

const regionMigration = (name) => name.endsWith('_populate_recycling_regions.sql');
const west = { name: 'Jurong East', address: 'Jurong East MRT', latitude: 1.3331, longitude: 103.7422 };
const east = { name: 'Tampines', address: 'Tampines MRT', latitude: 1.3533, longitude: 103.9452 };

test('upgrade awards Regional Recycler for existing verified actions in two distinct regions', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await applyTestDatabase(db, (name) => !regionMigration(name));
  const user = '11111111-1111-4111-8111-111111111111';
  await db.query('insert into auth.users(id,email_confirmed_at) values ($1,now())', [user]);
  for (const point of [west, east]) {
    const { rows: [bin] } = await db.query(`insert into recycling_points(name,address,latitude,longitude)
      values ($1,$2,$3,$4) returning id`, [point.name,point.address,point.latitude,point.longitude]);
    const { rows: [check] } = await db.query(`insert into check_ins(user_id,recycling_point_id,latitude,longitude)
      values ($1,$2,$3,$4) returning id`, [user,bin.id,point.latitude,point.longitude]);
    await db.query('insert into recycling_actions(user_id,check_in_id,material_type_id) values ($1,$2,1)', [user,check.id]);
  }
  await db.exec("update recycling_actions set verification_status='Verified',verified_at=now()");
  const progress = async () => (await db.query(
    "select progress, earned_at from badge_progress($1) where name='Regional Recycler'", [user])).rows[0];
  assert.deepEqual(await progress(), { progress: 0, earned_at: null });
  const rewards = async () => (await db.query('select eco_points,xp from profiles where id=$1', [user])).rows[0];
  const before = await rewards();
  await applyMigrations(db, regionMigration);
  const badge = await progress();
  assert.equal(badge.progress, 2);
  assert.ok(badge.earned_at);
  assert.deepEqual(await rewards(), before);
  const notifications = await db.query(`select n.id from notifications n join badges b
    on n.event_key=b.id::text where n.user_id=$1 and n.kind='badge_earned' and b.name='Regional Recycler'`, [user]);
  assert.equal(notifications.rows.length, 1);
});

test('region lookup covers imports, leaves unmatched coordinates blank and follows admin point edits', async (t) => {
  const { db, a, asUser } = await fixture();
  t.after(() => db.close());
  const result = await db.query(`insert into recycling_points(name,address,latitude,longitude)
    values ('Import','Jurong East MRT',$1,$2), ('Unmatched','At sea',0,0) returning region`, [west.latitude,west.longitude]);
  assert.deepEqual(result.rows, [{ region: 'West' }, { region: null }]);
  const moved = await db.query(`update recycling_points set latitude=$1,longitude=$2 where name='Import'
    returning region`, [east.latitude,east.longitude]);
  assert.deepEqual(moved.rows, [{ region: 'East' }]);
  await db.query('insert into app_admins(user_id) values($1)', [a]);
  await asUser(a);
  const save = async (id, point) => (await db.query('select admin_save_point($1,$2) as id',
    [id,JSON.stringify({ ...point, material_ids: [1] })])).rows[0].id;
  const region = async (id) => (await db.query('select region from recycling_points where id=$1', [id])).rows[0].region;
  const id = await save(null,west);
  assert.equal(await region(id),'West');
  await save(id,east);
  assert.equal(await region(id),'East');
  await save(id,{ ...east, region: 'Manual region' });
  await save(id,{ ...east, name: 'Renamed' });
  assert.equal(await region(id),'Manual region');
});
