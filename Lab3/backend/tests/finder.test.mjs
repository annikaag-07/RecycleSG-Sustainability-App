import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {fixture} from './fixture.mjs';

test('point administration, Singapore schedules, history and impact statistics', async t => {
  const {db,a,b,asUser} = await fixture();
  t.after(() => db.close());
  const rows = async (sql,args=[]) => (await db.query(sql,args)).rows;
  const value = async (sql,args=[]) => Object.values((await rows(sql,args))[0])[0];
  const save = (id, data) => value('select admin_save_point($1,$2::jsonb)',[id,JSON.stringify(data)]);
  const point = {name:'Test station',address:'Test street',latitude:1.3,longitude:103.8,
    status:'Available',material_ids:[],region:'West',weekly_hours:[{day:1,start:1320,end:120}]};
  const when = async (id,time) => value('select recycling_point_open_now($1,$2)',[id,time]);
  const material = await value("select id from material_types where name='Plastic'");
  point.material_ids = [material];
  await db.query('insert into app_admins(user_id) values ($1)',[a]);
  await asUser(b);
  await assert.rejects(save(null,point), {code:'42501'});
  await assert.rejects(rows("select admin_usage_stats('2026-01-01','2026-01-02')"),{code:'42501'});
  await asUser(a);
  const linkedPoint = await save(null,{...point,name:'Community point'});
  const picture = a + '/station.jpg';
  await rows("insert into storage.objects(bucket_id,name) values('post-photos',$1)",[picture]);
  const post = await value("select create_post(gen_random_uuid(),$1,'A recycling station',array[]::text[],$2,'public')",[[picture],linkedPoint]);
  assert.equal(await value('select admin_remove_point($1)',[linkedPoint]),'archived');
  assert.equal(await value("select recycling_point_id from list_posts(p_post_id=>$1)",[post]),linkedPoint);
  const unknown = await save(null,{...point,name:'Unknown hours',weekly_hours:null});
  const id = await save(null,point);
  const request = 'abcd1111-0000-4000-8000-000000000000';
  const report = (owner) => value("select submit_owned_point_report($1,$2,'full',null,$3)",[owner,id,request]);
  await assert.rejects(report(b),{code:'42501'});
  const reportId = await report(a);
  assert.equal(await report(a),reportId);
  assert.equal(await when(unknown,'2026-01-06 01:00+08'),null);
  assert.equal(await when(id,'2026-01-06 01:59+08'),true);
  assert.equal(await when(id,'2026-01-06 02:00+08'),false);
  assert.equal(await when(id,'2026-01-07 01:00+08'),false);
  const search = async () => rows("select id from find_recycling_points(1.3,103.8,1,1,true,'2026-01-06 01:00+08')");
  assert.deepEqual(await search(),[{id}]);
  await assert.rejects(save(id,{...point,name:'Invalid edit',material_ids:[999999999]}),{code:'23503'});
  assert.equal(await value('select name from recycling_points where id=$1',[id]),point.name);
  await assert.rejects(save(id,{...point,weekly_hours:[{day:8,start:0,end:90}]}),{code:'22023'});
  await save(id,{...point,weekly_hours:[],name:'Renamed'});
  assert.equal(await when(id,'2026-01-06 01:30+08'),false);
  await save(id,{...point,is_active:false});
  assert.deepEqual(await rows('select id from recycling_points where id=$1',[id]),[]);
  const [inactive] = await rows('select * from admin_list_points(null,100,false) where id=$1',[id]);
  assert.equal(inactive.name,point.name);
  assert.deepEqual(inactive.material_ids,[material]);
  await save(id,{...point,is_active:true});
  await db.exec('reset role');
  const checkin = await value("insert into check_ins(user_id,recycling_point_id,latitude,longitude,checked_in_at) values($1,$2,1.3,103.8,'2026-01-01 00:00+08') returning id",[b,id]);
  await db.query("insert into recycling_actions(user_id,check_in_id,material_type_id,quantity,created_at,verification_status,verified_at) values ($1,$2,$3,4,'2026-01-01 00:00+08','Verified','2026-01-01 00:00+08')",[b,checkin,material]);
  await asUser(a);
  const stats = await value("select admin_usage_stats('2026-01-01','2026-01-02')");
  assert.equal(stats.active_users,1);
  assert.equal(stats.verified_actions,1);
  assert.equal(stats.items_by_material[0].quantity,4);
  assert.equal(stats.most_used_points[0].id,id);
  assert.equal((await value("select admin_usage_stats('2025-12-31','2026-01-01')")).active_users,0);
  assert.equal(await value("select admin_remove_point($1)",[id]),'archived');
  assert.equal(await value("select admin_remove_point($1)",[unknown]),'deleted');
  await asUser(b);
  assert.deepEqual(await rows("select id from recycling_points where id=$1",[id]),[]);
  assert.deepEqual(await rows("select id from search_recycling_points_by_material('Plastic') where id=$1",[id]),[]);
  assert.equal(await value("select count(*)::int from check_ins where id=$1",[checkin]),1);
  await assert.rejects(rows('select create_gps_checkin($1,1.3,103.8)',[id]),{code:'P0002'});
});

test('published monthly collection schedule remains separate from the blue bin at the same block', async t => {
  const {db} = await fixture();
  t.after(() => db.close());
  const seed = await readFile(new URL('../supabase/demo/cash_for_trash.sql',import.meta.url),'utf8');
  await db.exec("insert into recycling_points(name,address,latitude,longitude) values ('Blue bin','456 Jurong West Street 41, Singapore 640456',1.3506757,103.7200224)");
  await db.exec(seed);
  await db.exec(seed);
  const existing = await db.query("select weekly_hours from recycling_points where name='Blue bin'");
  assert.equal(existing.rows[0].weekly_hours,null);
  const {rows} = await db.query(`select
    recycling_point_open_now(id,'2026-11-08 08:30+08') as scheduled,
    recycling_point_open_now(id,'2026-11-15 08:30+08') as following_sunday,
    recycling_point_open_now(id,'2026-11-08 11:30+08') as ended
    from recycling_points where name like 'ALBA Cash for Trash%' and address like '%640456%'`);
  assert.deepEqual(rows,[{scheduled:true,following_sunday:false,ended:false}]);
});
