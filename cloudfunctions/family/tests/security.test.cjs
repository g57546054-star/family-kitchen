const test = require("node:test");
const assert = require("node:assert/strict");
const { fixture } = require("./helpers.cjs");
const { core, APPID, hash } = require("../domain");
const denied = (result, code) => {
  assert.equal(result.ok, false);
  assert.equal(result.error.code, code);
};
test("identity is runtime OPENID + APPID only; no forged client identities", async () => {
  const f = fixture();
  const id = await f.family();
  for (const context of [{}, { OPENID: "alice", APPID: "another-app" }]) {
    denied(
      await f.service.handle(
        { action: "session", payload: {}, requestId: "identity_test_0001" },
        context,
      ),
      "UNAUTHENTICATED",
    );
  }
  denied(
    await f.call("mallory", "pull", { householdId: id, OPENID: "alice" }),
    "INVALID_INPUT",
  );
  denied(await f.call("mallory", "pull", { householdId: id }), "FORBIDDEN");
  denied(
    await f.service.handle(
      {
        action: "pull",
        payload: { householdId: id },
        requestId: "identity_test_0002",
        OPENID: "alice",
      },
      { OPENID: "mallory", APPID },
    ),
    "INVALID_INPUT",
  );
});
test("all reads and mutations reject non-members and cross-household IDs", async () => {
  const f = fixture();
  const a = await f.family(),
    b = await f.family("eve");
  const actions = [
    "pull",
    "invite.create",
    "invite.revoke",
    "member.remove",
    "household.leave",
    "recipe.save",
    "recipe.delete",
    "recipe.favorite",
    "plan.add",
    "plan.adjust",
    "plan.remove",
    "shopping.set",
    "shopping.clear",
    "migration.import",
  ];
  for (const action of actions) {
    denied(await f.call("mallory", action, { householdId: a }), "FORBIDDEN");
    denied(await f.call("alice", action, { householdId: b }), "FORBIDDEN");
  }
});
test("members cannot invite, revoke, remove, or migrate; removed users lose access and replay access", async () => {
  const f = fixture();
  const id = await f.family();
  await f.join(id);
  const b = await f.ok("bob", "pull", { householdId: id });
  for (const action of [
    "invite.create",
    "invite.revoke",
    "member.remove",
    "migration.import",
  ])
    denied(await f.call("bob", action, { householdId: id }), "FORBIDDEN");
  const request = "member_before_remove_001";
  await f.ok(
    "bob",
    "plan.add",
    {
      householdId: id,
      date: "2026-10-19",
      slot: "晚餐",
      recipeId: b.state.recipes[0].id,
      servings: 2,
    },
    request,
  );
  const current = await f.ok("alice", "pull", { householdId: id });
  await f.ok("alice", "member.remove", {
    householdId: id,
    memberId: b.household.uid,
    expectedVersion: current.household.version,
  });
  denied(await f.call("bob", "pull", { householdId: id }), "FORBIDDEN");
  denied(
    await f.call(
      "bob",
      "plan.add",
      {
        householdId: id,
        date: "2026-10-19",
        slot: "晚餐",
        recipeId: b.state.recipes[0].id,
        servings: 2,
      },
      request,
    ),
    "FORBIDDEN",
  );
  assert.equal((await f.ok("bob", "session")).householdId, null);
});
test("invites expire, revoke, consume once and cannot be revoked across households", async () => {
  const f = fixture();
  const id = await f.family(),
    other = await f.family("eve");
  const expired = await f.ok("alice", "invite.create", { householdId: id });
  f.advance(1800000);
  denied(
    await f.call("bob", "household.join", {
      code: expired.code,
      displayName: "bob",
    }),
    "INVITE_INVALID",
  );
  const revoked = await f.ok("alice", "invite.create", { householdId: id });
  denied(
    await f.call("eve", "invite.revoke", {
      householdId: other,
      inviteId: revoked.inviteId,
    }),
    "FORBIDDEN",
  );
  await f.ok("alice", "invite.revoke", {
    householdId: id,
    inviteId: revoked.inviteId,
  });
  denied(
    await f.call("bob", "household.join", {
      code: revoked.code,
      displayName: "bob",
    }),
    "INVITE_INVALID",
  );
  const one = await f.ok("alice", "invite.create", { householdId: id });
  await f.ok(
    "bob",
    "household.join",
    { code: one.code, displayName: "bob" },
    "join_retry_same_0001",
  );
  assert.equal(
    (
      await f.ok(
        "bob",
        "household.join",
        { code: one.code, displayName: "bob" },
        "join_retry_same_0001",
      )
    ).replayed,
    true,
  );
  denied(
    await f.call("charlie", "household.join", {
      code: one.code,
      displayName: "charlie",
    }),
    "INVITE_INVALID",
  );
});
test("simultaneous invite consumption admits only one member", async () => {
  const f = fixture();
  const id = await f.family();
  const invite = await f.ok("alice", "invite.create", { householdId: id });
  const results = await Promise.all(
    ["bob", "eve"].map((who) =>
      f.call(who, "household.join", { code: invite.code, displayName: who }),
    ),
  );
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(results.find((r) => !r.ok).error.code, "INVITE_INVALID");
  assert.ok(f.store.conflicts > 0);
});
test("rejected invite guesses consume a committed per-user quota; no database error leaks", async () => {
  const f = fixture();
  for (let i = 0; i < 5; i++)
    denied(
      await f.call("bob", "household.join", {
        code: "FFFFFFFFFFFF",
        displayName: "bob",
      }),
      "INVITE_INVALID",
    );
  denied(
    await f.call("bob", "household.join", {
      code: "FFFFFFFFFFFF",
      displayName: "bob",
    }),
    "RATE_LIMIT",
  );
  f.advance(60000);
  denied(
    await f.call("bob", "household.join", {
      code: "FFFFFFFFFFFF",
      displayName: "bob",
    }),
    "INVITE_INVALID",
  );
  const { createService } = require("../service");
  const broken = createService({
    transaction: () => {
      throw new Error("secret database path");
    },
  });
  const result = await broken.handle(
    { action: "session", payload: {}, requestId: "error_test_0000001" },
    { APPID, OPENID: "alice" },
  );
  denied(result, "INTERNAL");
  assert.ok(!JSON.stringify(result).includes("secret"));
});
test("input whitelist, gram review flags, sizes and immutable seed recipe rules are enforced on server", async () => {
  const f = fixture(),
    id = await f.family();
  let snap = await f.ok("alice", "pull", { householdId: id });
  const recipe = core.clone(snap.state.recipes[0]);
  denied(
    await f.call("alice", "recipe.save", {
      householdId: id,
      recipe,
      expectedVersion: snap.household.version,
    }),
    "BUILTIN_READONLY",
  );
  recipe.id = "private:bad";
  recipe.origin = "private";
  recipe.ingredients[0].unit = "个";
  recipe.ingredients[0].needsReview = false;
  denied(
    await f.call("alice", "recipe.save", {
      householdId: id,
      recipe,
      expectedVersion: snap.household.version,
    }),
    "INVALID_DATA",
  );
  denied(
    await f.call("alice", "plan.adjust", {
      householdId: id,
      date: "2026-10-19",
      slot: "晚餐",
      recipeId: recipe.id,
      delta: 100,
    }),
    "INVALID_INPUT",
  );
  assert.equal(
    f.store.docs.get(`households/${id}`).data.version,
    snap.household.version,
  );
});
test("client rules deny every collection and entrypoint never reads a client context", () => {
  const fs = require("node:fs"),
    path = require("node:path");
  assert.deepEqual(require("../../database.rules.json"), {
    read: false,
    write: false,
  });
  const source = fs.readFileSync(path.join(__dirname, "../index.js"), "utf8");
  assert.match(source, /cloud\.getWXContext\(\)/);
  assert.doesNotMatch(source, /event\.(OPENID|openid|context)/);
  assert.equal(
    require("../package.json").dependencies["wx-server-sdk"],
    "4.0.2",
  );
});
test("a member can replay only their own completed leave without regaining family access", async () => {
  const f = fixture(),
    id = await f.family();
  await f.join(id);
  const snap = await f.ok("bob", "pull", { householdId: id });
  const payload = { householdId: id, expectedVersion: snap.household.version };
  await f.ok("bob", "household.leave", payload, "leave_retry_request_001");
  assert.equal(
    (await f.ok("bob", "household.leave", payload, "leave_retry_request_001"))
      .replayed,
    true,
  );
  denied(await f.call("bob", "pull", { householdId: id }), "FORBIDDEN");
  denied(
    await f.call(
      "mallory",
      "household.leave",
      payload,
      "leave_retry_request_001",
    ),
    "FORBIDDEN",
  );
});
