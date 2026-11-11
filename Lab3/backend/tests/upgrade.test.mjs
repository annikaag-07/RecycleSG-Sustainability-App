import { PGlite } from "@electric-sql/pglite";
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMigrations, applyTestDatabase } from "./fixture.mjs";

test("upgrade an existing contributor with seven days of verified history", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  const first = "20261111133136";
  await applyTestDatabase(db, (name) => name < first);
  const id = "11111111-1111-4111-8111-111111111111";
  await db.query("INSERT INTO auth.users(id,email_confirmed_at) VALUES ($1,now())", [id]);
  await db.exec(
    "INSERT INTO recycling_points(name,address,latitude,longitude) VALUES('Legacy','Campus',1.3,103.8)",
  );
  await db.query(
    `INSERT INTO check_ins(user_id,recycling_point_id,latitude,longitude,checked_in_at)
    SELECT $1,1,1.3,103.8,now()-days_ago*interval '1 day' FROM generate_series(6,0,-1) days_ago`,
    [id],
  );
  await db.query(
    `INSERT INTO recycling_actions(user_id,check_in_id,material_type_id,created_at)
    SELECT $1,id,1,checked_in_at FROM check_ins`,
    [id],
  );
  await db.exec("UPDATE recycling_actions SET verification_status='Verified',verified_at=now()");
  const before = (await db.query("SELECT eco_points, xp FROM profiles")).rows;
  await applyMigrations(db, (name) => name >= first);
  assert.deepEqual((await db.query("SELECT eco_points,xp FROM profiles")).rows, before);
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("SET ROLE authenticated");
  const { rows } = await db.query("SELECT * FROM list_my_badge_progress()");
  assert.ok(rows.find((b) => b.criterion === "streak" && b.earned_at));
  assert.equal((await db.query("SELECT get_my_streak() AS n")).rows[0].n, 7);
  assert.equal((await db.query("SELECT recycling_point_open_now(1) AS state")).rows[0].state, null);
});
