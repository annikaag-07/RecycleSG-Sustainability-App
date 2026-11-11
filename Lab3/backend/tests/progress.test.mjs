import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture.mjs';

test('milestone decisions, inbox ownership and preferences', async () => {
  const { db, a, b, asUser } = await fixture();
  const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
  const decide = (id, decision, reason) => rows(
    "select admin_decide_milestone($1,$2,$3,'AwaitingVerification') as status", [id,decision,reason]);
  try {
    await db.query('insert into app_admins values ($1,now())', [b]);
    await db.exec("update milestones set status='AwaitingVerification',current_points=target_points");
    for (const id of [1, 1, 2]) await db.query(
      'insert into milestone_contributions(milestone_id,user_id,client_request_id,requested_amount,amount) values ($1,$2,gen_random_uuid(),10,10)', [id,a]);
    await asUser(a);
    await assert.rejects(decide(1,'verify',null), { code: '42501' });
    assert.deepEqual(await rows('select * from get_my_notification_preferences()'),
      [{ social: true, progress: true, streak_reminder: false }]);
    await asUser(b);
    await assert.rejects(decide(1,'reject','  '), { code: '22023' });
    assert.equal((await decide(1,'request_evidence','Supply receipt'))[0].status,'AwaitingVerification');
    assert.equal((await decide(1,'verify',null))[0].status,'Verified');
    await assert.rejects(decide(1,'reject','Too late'), { code: '40001' });
    assert.equal((await rows('select * from list_my_notifications()')).length,0);
    await asUser(a);
    const inbox = await rows('select * from list_my_notifications()');
    assert.equal(inbox.length,1);
    assert.equal(inbox[0].kind,'milestone_verified');
    await rows('select mark_notification_read($1)', [inbox[0].id]);
    assert.ok((await rows('select * from list_my_notifications()'))[0].read_at);
    await rows('select set_notification_preferences(true,false,false)');
    await asUser(b);
    await assert.rejects(rows('select mark_notification_read($1)', [inbox[0].id]), { code: 'P0002' });
    await decide(2,'verify',null);
    assert.equal((await decide(3,'reject','Missing receipt'))[0].status,'Rejected');
    const rejected = (await rows('select * from admin_list_milestones_for_review()')).find(m => m.id===3);
    assert.equal(rejected.decision_reason,'Missing receipt');
    assert.ok(rejected.decided_at);
    await asUser(a);
    assert.equal((await rows('select * from list_my_notifications()')).length,1);
    await assert.rejects(rows("select enqueue_notification($1,'progress','fake','fake','{}')", [a]), { code: '42501' });
    await db.exec('reset role');
    await rows("select enqueue_notification($1,'social','follow',$2::uuid::text,jsonb_build_object('actor_id',$2::uuid))",[a,b]);
    await asUser(a);
    assert.equal((await rows('select * from list_my_notifications()')).length,2);
    await rows('select set_block($1,true)',[b]);
    assert.equal((await rows('select * from list_my_notifications()')).length,1);
  } finally { await db.close(); }
});

test('verified action history, configurable awards and deduplicated reminders', async () => {
  const { db, a, b, asUser } = await fixture();
  const rows = async (sql, args = []) => (await db.query(sql,args)).rows;
  try {
    await db.query('insert into app_admins values ($1,now())',[b]);
    await asUser(a);
    await assert.rejects(rows('select admin_set_level_step(30)'),{code:'42501'});
    await asUser(b);
    await rows('select admin_set_level_step(30)');
    await rows('select admin_set_material_reward(1,12,6)');
    await rows("select admin_save_season(null,'Festival',now()-interval '20 days',now()+interval '1 day',2)");
    const quest = (await rows("select admin_save_quest(null,'One action','', 'one_time',1,2,0,true) as id"))[0].id;
    await rows("select admin_save_badge(null,'Weekend pair','Recycle two days in a row','streak',2)");
    await db.exec('reset role');
    const today = "(now() at time zone 'Asia/Singapore')::date";
    for (const [i, daysAgo] of [3,2,2,1].entries()) {
      const pt = (await rows("insert into recycling_points(name,address,latitude,longitude,region) values ('Bin','Campus',1.3,103.5,$1) returning id", [i%2 ? 'West' : 'East']))[0].id;
      const check = (await rows("insert into check_ins(user_id,recycling_point_id,latitude,longitude) values ($1,$2,1.3,103.5) returning id",[a,pt]))[0].id;
      const action = (await rows(`insert into recycling_actions(user_id,check_in_id,material_type_id,created_at) values ($1,$2,1,(${today}-$3::integer+time '12:00') at time zone 'Asia/Singapore') returning id`,[a,check,daysAgo]))[0].id;
      await db.query("update recycling_actions set verification_status='Verified',verified_at=now() where id=$1",[action]);
    }
    await asUser(a);
    assert.equal((await rows('select get_my_streak() as n'))[0].n,3);
    const badges = await rows('select * from list_my_badge_progress()');
    assert.ok(badges.find(x=>x.name==='Weekend pair').earned_at);
    assert.ok(badges.find(x=>x.criterion==='regions').earned_at);
    const weekBadge = badges.find(x=>x.name==='One Green Week');
    assert.equal(weekBadge.earned_at,null);
    assert.equal(weekBadge.progress,3);
    const earned = (await rows('select eco_points,xp,level from profiles'))[0];
    assert.deepEqual(earned,{eco_points:96,xp:48,level:2});
    const claimed = await rows("select * from claim_quest_reward($1,'1970-01-01')",[quest]);
    assert.equal(claimed[0].new_level,2);
    await asUser(b);
    await rows("select admin_save_badge(null,'Four drops','Verify four actions','verified_actions',4)");
    const config = (await rows('select admin_get_game_rules() as config'))[0].config;
    assert.equal(config.xp_step,30);
    await rows('select admin_set_material_reward(1,10,10)');
    await rows('select admin_set_level_step(100)');
    assert.equal(config.materials.find(material => material.material_id===1).points_per_unit,12);
    await asUser(a);
    assert.ok((await rows('select * from list_my_badge_progress()')).find(badge=>badge.name==='Four drops').earned_at);
    assert.deepEqual((await rows('select xp,level from profiles'))[0],{xp:48,level:2});
    assert.equal((await rows('select sum(eco_points_earned) as points from reward_transactions'))[0].points,98);
    const kinds = new Set((await rows('select * from list_my_notifications(null,100)')).map(item=>item.kind));
    for(const kind of ['level_up','badge_earned','quest_completed']) assert.ok(kinds.has(kind),kind);
    await rows('select set_notification_preferences(true,true,true)');
    await db.exec('reset role');
    const evening = `(${today}+time '20:00') at time zone 'Asia/Singapore'`;
    await rows(`select send_streak_reminders(${evening})`);
    await rows(`select send_streak_reminders(${evening})`);
    await asUser(a);
    assert.equal((await rows('select * from list_my_notifications(null,100)')).filter(n=>n.kind==='streak_at_risk').length,1);
    await db.exec('reset role');
    assert.equal((await rows(`select current_streak from progress_stats($1,${today}+1)`,[a]))[0].current_streak,0);
  } finally { await db.close(); }
});
