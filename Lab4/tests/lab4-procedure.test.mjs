import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture } from '../../Lab3/backend/tests/fixture.mjs';

test('Lab 4: submission quantity boundaries and verification paths for UC 3.2', async t => {
  const { db, a, b, asUser } = await fixture();
  t.after(() => db.close());
  const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  const material = await one("select id from material_types where name='Plastic'");
  const activities = [];
  for (const quantity of [null, 0, 1, 2, 99, 100, 101]) {
    await t.test('quantity ' + quantity, async () => {
      await db.exec('reset role');
      const point = await one("insert into recycling_points(name,address,latitude,longitude) values('Lab','N4',1.35,103.68) returning id");
      await db.query('insert into recycling_point_materials(recycling_point_id,material_type_id) values($1,$2)', [point.id,material.id]);
      const check = await one('insert into check_ins(user_id,recycling_point_id,latitude,longitude) values($1,$2,1.35,103.68) returning id', [a,point.id]);
      await asUser(a);
      const submit = () => one('select submit_recycling_activity($1,$2,$3,null) as id', [check.id,material.id,quantity]);
      if (quantity === null || quantity < 1 || quantity > 100) {
        await assert.rejects(submit(), /Quantity must be between 1 and 100/);
        assert.equal((await one('select count(*) as n from recycling_actions where check_in_id=$1', [check.id])).n, 0);
      } else {
        const { id } = await submit();
        assert.deepEqual(await one('select quantity,verification_status from recycling_actions where id=$1', [id]),
          { quantity, verification_status: 'Pending' });
        activities.push(id);
      }
    });
  }

  await db.exec('reset role; set role service_role');
  const [first, second] = activities;
  const finish = (id, owner, status, label, score) => one(
    'select verification_status,verified_at from finalize_recycling_activity($1,$2,$3,$4,$5)', [id,owner,status,label,score]);
  await t.test('wrong owner', () => assert.rejects(finish(first,b,'Verified','plastic',0.9), /Activity not found/));
  await t.test('invalid result', () => assert.rejects(finish(first,a,'Verified','plastic',1.01), /Invalid verification result/));
  await t.test('claimed match contradicts material', () => assert.rejects(finish(first,a,'Verified','glass',0.9), /Material mismatch/));
  const ledgerCount = async id => {
    await asUser(a);
    try {
      return (await one('select count(*) as n from reward_transactions where recycling_action_id=$1', [id])).n;
    } finally {
      await db.exec('reset role; set role service_role');
    }
  };
  await t.test('valid match', async () => {
    const row = await finish(first,a,'Verified','plastic',0.9);
    assert.equal(row.verification_status,'Verified');
    assert.ok(row.verified_at);
    assert.equal(await ledgerCount(first),1);
  });
  await t.test('terminal retry', async () => {
    assert.equal((await finish(first,a,'Rejected','glass',0.9)).verification_status,'Verified');
    assert.equal(await ledgerCount(first),1);
  });
  await t.test('valid rejection', async () => {
    assert.deepEqual(await finish(second,a,'Rejected','glass',0.9), {verification_status:'Rejected',verified_at:null});
    assert.equal(await ledgerCount(second),0);
  });
});
