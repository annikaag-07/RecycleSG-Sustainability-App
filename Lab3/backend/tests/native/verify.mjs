import EmbeddedPostgres from "embedded-postgres";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import assert from "node:assert/strict";
import { applyTestDatabase } from "../fixture.mjs";

const dir = await mkdtemp(join(tmpdir(), "recyclesg-db-"));
const password = randomBytes(18).toString("hex");
const secret = randomBytes(32).toString("hex");
const port = Number(process.env.TEST_DB_PORT || 55469);
const httpPort = Number(process.env.TEST_HTTP_PORT || 55470);
const server = new EmbeddedPostgres({
  databaseDir: dir + "/cluster",
  persistent: false,
  port,
  user: "postgres",
  password,
  autoRehydrateSymlinks: true,
  postgresFlags: ["-c", "listen_addresses=127.0.0.1", "-c", "unix_socket_directories=" + dir],
  onLog: () => {},
});
const a = randomUUID(), b = randomUUID();
function jwt(id) {
  const body = [{ alg: "HS256", typ: "JWT" }, {
    sub: id,
    role: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 300,
  }]
    .map((x) => Buffer.from(JSON.stringify(x)).toString("base64url")).join(".");
  return body + "." + createHmac("sha256", secret).update(body).digest("base64url");
}
const rpc = async (name, args = {}, user = a) => {
  const res = await fetch("http://127.0.0.1:" + httpPort + "/rpc/" + name, {
    method: "POST",
    headers: { ...(user ? { Authorization: "Bearer " + jwt(user) } : {}), "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
};
let client, rest;
try {
  await server.initialise();
  await server.start();
  client = server.getPgClient();
  await client.connect();
  console.log("Native PG:", (await client.query("select version()")).rows[0].version);
  console.log("Migrations:", await applyTestDatabase({ exec: (sql) => client.query(sql) }));
  await client.query("INSERT INTO auth.users(id,email_confirmed_at) VALUES($1,now()),($2,now())", [a, b]);
  await client.query("INSERT INTO app_admins(user_id) VALUES ($1)", [b]);
  await client.query(
    "INSERT INTO recycling_points(name,address,latitude,longitude) VALUES ('Probe','Test',1.3,103.8)",
  );
  await client.query("UPDATE milestones SET status='AwaitingVerification' WHERE id=1");
  await client.query(
    "INSERT INTO milestone_contributions (milestone_id,user_id,client_request_id,requested_amount,amount) VALUES(1,$1,gen_random_uuid(),1,1)",
    [a],
  );
  await client.query(
    "create role rest_authenticator login noinherit password '" + password +
      "'; grant anon,authenticated to rest_authenticator",
  );
  rest = spawn(process.env.POSTGREST_BIN || "postgrest", [], {
    stdio: ["ignore", "ignore", "pipe"],
    env: {
      ...process.env,
      ...(process.env.POSTGREST_LIB_DIR ? { DYLD_LIBRARY_PATH: process.env.POSTGREST_LIB_DIR } : {}),
      PGRST_SERVER_HOST: "127.0.0.1",
      PGRST_SERVER_PORT: String(httpPort),
      PGRST_DB_URI: "postgres://rest_authenticator:" + password + "@127.0.0.1:" + port + "/postgres",
      PGRST_DB_ANON_ROLE: "anon",
      PGRST_JWT_SECRET: secret,
    },
  });
  await once(rest, "spawn");
  rest.stderr.resume();
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) {
    assert.equal(rest.exitCode, null, "PostgREST exited before accepting requests");
    assert.equal(rest.signalCode, null, "PostgREST stopped before accepting requests");
    try {
      ready = (await fetch("http://127.0.0.1:" + httpPort + "/")).ok;
    } catch {}
    if (!ready) await new Promise((r) => setTimeout(r, 150));
  }
  assert.ok(ready, "PostgREST readiness");
  const args = {
    p_recycling_point_id: 1,
    p_category: "full",
    p_description: null,
    p_client_request_id: randomUUID(),
  };
  const result = await Promise.all(Array.from({ length: 8 }, () => rpc("submit_point_report", args)));
  for (const r of result) assert.deepEqual(r, { status: 200, data: 1 });
  const res = await Promise.all(
    ["Resolved", "Dismissed"].map((p_resolution) =>
      rpc("admin_review_point_report", { p_report_id: 1, p_resolution, p_note: null }, b)
    ),
  );
  assert.equal(res.filter((r) => r.status === 200).length, 1);
  assert.equal(res.filter((r) => r.data.code === "P0002").length, 1);
  const decisions = await Promise.all(
    ["verify", "verify"].map((p_decision) =>
      rpc("admin_decide_milestone", {
        p_milestone_id: 1,
        p_decision,
        p_reason: null,
        p_expected_status: "AwaitingVerification",
      }, b)
    ),
  );
  assert.equal(decisions.filter((r) => r.status === 200).length, 1);
  assert.equal(decisions.filter((r) => r.data.code === "40001").length, 1);
  assert.equal((await rpc("list_my_notifications")).data.length, 1);
  console.log(
    "HTTP passed: 8 report retries, 2 concurrent report reviews, 2 concurrent milestone decisions, one contributor notification",
  );
  for (
    const name of [
      "get_my_streak",
      "list_my_badge_progress",
      "get_my_notification_preferences",
      "list_posts",
      "list_follow_requests",
    ]
  ) {
    const r = await rpc(name);
    assert.equal(r.status, 200, JSON.stringify([name, r]));
  }
  const progress = await rpc("get_my_level_progress");
  assert.equal(progress.data[0].next_level_xp, 100);
  const estimate = await rpc("estimate_recycling_reward", { p_material_type_id: 1, p_quantity: 2 });
  assert.deepEqual(estimate.data, [{eco_points: 20, xp: 20}]);
  const following = await rpc("set_follow", { p_user_id: b, p_follow: true });
  assert.deepEqual(following, { status: 200, data: "accepted" });
  await client.query("insert into storage.objects(bucket_id,name) values('post-photos',$1)", [
    b + "/test.jpg",
  ]);
  const post = await rpc("create_post", {
    p_request_id: randomUUID(),
    p_photo_paths: [b + "/test.jpg"],
    p_caption: "HTTP test",
    p_tags: ["Paper"],
    p_recycling_point_id: 1,
  }, b);
  assert.equal(post.status, 200, JSON.stringify(post));
  const discover = await rpc("list_posts", { p_feed: "discover" }, null);
  assert.equal(discover.status, 200, JSON.stringify(discover));
  assert.equal(discover.data[0].id, post.data);
  const feed = await rpc("list_posts", { p_feed: "following", p_hashtag: "paper" });
  assert.equal(feed.data[0].id, post.data);
  const like = await rpc("set_post_like", { p_post_id: post.data, p_liked: true });
  assert.ok(like.status >= 200 && like.status < 300, JSON.stringify(like));
  const stats = await rpc("admin_usage_stats", { p_from: "2026-01-01", p_until: "2027-01-01" }, b);
  assert.equal(stats.status, 200, JSON.stringify(stats));
  const rules = await rpc("admin_get_game_rules", {}, b);
  assert.equal(rules.data.xp_step, 100);
  const blocked = await rpc("set_block", { p_user_id: a, p_block: true }, b);
  assert.ok(blocked.status >= 200 && blocked.status < 300);
  assert.deepEqual((await rpc("list_posts", { p_post_id: post.data })).data, []);
  console.log(
    "HTTP passed: social and progress reads, following feed, likes, blocks, admin stats and gamification rules",
  );
} finally {
  if (rest?.pid && rest.exitCode === null && rest.signalCode === null) {
    const exit = once(rest, "exit");
    rest.kill();
    await exit;
  }
  if (client) await client.end();
  await server.stop();
  await rm(dir, { recursive: true, force: true });
}
