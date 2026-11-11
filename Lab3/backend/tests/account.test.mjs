import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { fixture } from "./fixture.mjs";

test("Auth configuration enforces the frontend password rule", async () => {
  const config = await readFile(new URL("../supabase/config.toml", import.meta.url), "utf8");
  assert.match(config, /^minimum_password_length = 8$/m);
  assert.match(config, /^password_requirements = "letters_digits"$/m);
});

test("deleting a contributor freezes uploads, scopes cleanup and preserves milestone amounts", async () => {
  const { db, a, b, asUser } = await fixture();
  try {
    await db.query("UPDATE profiles SET available_eco_points = 20 WHERE id=$1", [a]);
    await asUser(a);
    await db.query("SELECT * FROM contribute_to_milestone(1,10,gen_random_uuid())");
    await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES ('recycling-photos',$1)", [
      a + "/demo.jpg",
    ]);
    await assert.rejects(db.query("SELECT * FROM deletion_media_batch($1)", [b]), /permission denied/);
    await db.query("SELECT set_follow($1,true)", [b]);
    await db.exec("SELECT begin_account_deletion(); SELECT begin_account_deletion();");
    await assert.rejects(
      db.query("INSERT INTO storage.objects(bucket_id,name) VALUES ('recycling-photos',$1)", [
        a + "/late.jpg",
      ]),
      /policy/,
    );
    await asUser(b);
    await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES ('recycling-photos',$1)", [
      b + "/keep.jpg",
    ]);
    await db.exec("RESET ROLE; SET ROLE service_role");
    const { rows } = await db.query("SELECT * FROM deletion_media_batch($1)", [a]);
    assert.deepEqual(rows, [{ bucket_id: "recycling-photos", name: a + "/demo.jpg" }]);
    await db.exec("RESET ROLE");
    await db.query("DELETE FROM auth.users WHERE id=$1", [a]);
    assert.deepEqual((await db.query("SELECT user_id,amount FROM milestone_contributions")).rows, [{
      user_id: null,
      amount: 10,
    }]);
    assert.equal(
      (await db.query("SELECT current_points FROM milestones WHERE id=1")).rows[0].current_points,
      10,
    );
    assert.equal(
      (await db.query("SELECT count(*)::int AS n FROM notifications WHERE payload->>'actor_id'=$1", [a]))
        .rows[0].n,
      0,
    );
    await asUser(a);
    await assert.rejects(
      db.query("INSERT INTO storage.objects(bucket_id,name) VALUES ('recycling-photos',$1)", [
        a + "/stale.jpg",
      ]),
      /policy/,
    );
  } finally {
    await db.close();
  }
});
