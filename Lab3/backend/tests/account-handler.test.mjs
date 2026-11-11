import { test } from "node:test";
import assert from "node:assert/strict";
import { deleteAccount } from "../supabase/functions/delete-my-account/workflow.mjs";

test("a failed storage delete retains the identity and a retry finishes remaining objects", async () => {
  const objects = [{ bucket_id: "post-photos", name: "me/post.jpg" }, {
    bucket_id: "recycling-photos",
    name: "me/drop.jpg",
  }];
  const deleted = [];
  let fail = true;
  const caller = { auth: { getUser: async () => ({ data: { user: { id: "me" } } }) }, rpc: async () => ({}) };
  const admin = {
    rpc: async (_name, args) => {
      assert.equal(args.p_user_id, "me");
      return { data: [...objects] };
    },
    storage: {
      from: (bucket) => ({
        remove: async (names) => {
          if (bucket === "recycling-photos" && fail) return { error: new Error("storage offline") };
          for (const name of names) {
            objects.splice(
              objects.findIndex((o) => o.name === name && o.bucket_id === bucket),
              1,
            );
          }
          return {};
        },
      }),
    },
    auth: {
      admin: {
        deleteUser: async (id) => {
          deleted.push(id);
          return {};
        },
      },
    },
  };
  await assert.rejects(deleteAccount(caller, admin), /storage offline/);
  assert.deepEqual(deleted, []);
  fail = false;
  await deleteAccount(caller, admin);
  assert.deepEqual(objects, []);
  assert.deepEqual(deleted, ["me"]);
});

test("invalid caller never reaches privileged cleanup", async () => {
  const caller = {
    auth: { getUser: async () => ({ data: { user: null }, error: new Error("invalid token") }) },
  };
  await assert.rejects(deleteAccount(caller, {}), (e) => e.status === 401);
});
