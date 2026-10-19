const test = require("node:test");
const assert = require("node:assert/strict");
const { fixture } = require("./helpers.cjs");
const { core } = require("../domain");
async function setup() {
  const f = fixture(),
    id = await f.family();
  await f.join(id);
  const snap = await f.ok("alice", "pull", { householdId: id });
  return { ...f, id, recipeId: snap.state.recipes[0].id };
}
test("duplicate request commits once; a reused ID with different payload is rejected", async () => {
  const f = await setup();
  const payload = {
    householdId: f.id,
    date: "2026-10-19",
    slot: "晚餐",
    recipeId: f.recipeId,
    servings: 2,
  };
  const results = await Promise.all([
    f.ok("alice", "plan.add", payload, "same_request_000001"),
    f.ok("alice", "plan.add", payload, "same_request_000001"),
  ]);
  assert.equal(results.filter((r) => r.replayed).length, 1);
  const current = await f.ok("alice", "pull", { householdId: f.id });
  assert.equal(current.state.plans["2026-10-19:晚餐"][0].servings, 2);
  const reuse = await f.call(
    "alice",
    "plan.add",
    { ...payload, servings: 3 },
    "same_request_000001",
  );
  assert.equal(reuse.error.code, "CONFLICT");
});
test("concurrent meal adds and serving deltas accumulate without snapshot overwrites", async () => {
  const f = await setup(),
    p = {
      householdId: f.id,
      date: "2026-10-19",
      slot: "晚餐",
      recipeId: f.recipeId,
    };
  await Promise.all(
    ["alice", "bob"].map((who) => f.ok(who, "plan.add", { ...p, servings: 2 })),
  );
  await Promise.all(
    ["alice", "bob"].map((who) => f.ok(who, "plan.adjust", { ...p, delta: 1 })),
  );
  const snap = await f.ok("alice", "pull", { householdId: f.id });
  assert.equal(snap.state.plans["2026-10-19:晚餐"][0].servings, 6);
  const seed = snap.state.recipes.find((r) => r.id === f.recipeId);
  const item = core.shoppingList(
    snap.state,
    core.weekDates(0, core.parseDate("2026-10-19")),
  )[0];
  assert.equal(item.amount, (seed.ingredients[0].amount * 6) / seed.servings);
  assert.ok(f.store.conflicts > 0);
});
test("shopping checks on different items merge, same item conflicts, stale menu checks reject", async () => {
  const f = await setup(),
    p = {
      householdId: f.id,
      date: "2026-10-19",
      slot: "晚餐",
      recipeId: f.recipeId,
      servings: 2,
    };
  await f.ok("alice", "plan.add", p);
  let snap = await f.ok("alice", "pull", { householdId: f.id });
  const items = core.shoppingList(
    snap.state,
    core.weekDates(0, core.parseDate(p.date)),
  );
  const check = {
    householdId: f.id,
    start: "2026-10-19",
    checked: true,
    menuVersion: snap.household.menuVersion,
    checkVersion: 0,
  };
  await Promise.all(
    items
      .slice(0, 2)
      .map((item, i) =>
        f.ok(i ? "bob" : "alice", "shopping.set", { ...check, key: item.key }),
      ),
  );
  snap = await f.ok("bob", "pull", { householdId: f.id });
  assert.equal(snap.state.checked.length, 2);
  const stale = await f.call("bob", "shopping.set", {
    ...check,
    key: items[0].key,
    checked: false,
  });
  assert.equal(stale.error.code, "CONFLICT");
  await f.ok("bob", "plan.adjust", {
    householdId: f.id,
    date: p.date,
    slot: p.slot,
    recipeId: p.recipeId,
    delta: 1,
  });
  const obsolete = await f.call("alice", "shopping.set", {
    ...check,
    key: items[2].key,
  });
  assert.equal(obsolete.error.code, "CONFLICT");
  snap = await f.ok("alice", "pull", { householdId: f.id });
  assert.equal(snap.state.checked.length, 0);
  assert.deepEqual(snap.checkVersions, []);
});
test("concurrent edit vs edit only one commits; stale destructive operations reject", async () => {
  const f = await setup();
  const snap = await f.ok("alice", "pull", { householdId: f.id });
  const recipe = {
    ...snap.state.recipes[0],
    id: "private:concurrent",
    origin: "private",
  };
  const results = await Promise.all(
    ["alice", "bob"].map((who, i) =>
      f.call(who, "recipe.save", {
        householdId: f.id,
        recipe: { ...recipe, name: `名字${i}` },
        expectedVersion: snap.household.version,
      }),
    ),
  );
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(results.find((r) => !r.ok).error.code, "CONFLICT");
  const stale = await f.call("alice", "recipe.delete", {
    householdId: f.id,
    recipeId: recipe.id,
    expectedVersion: snap.household.version,
  });
  assert.equal(stale.error.code, "CONFLICT");
});
test("migration preserves units, plans and shopping checks once; rejects overwrite and member-present imports", async () => {
  const f = fixture(),
    id = await f.family();
  let snap = await f.ok("alice", "pull", { householdId: id });
  let state = core.initialState();
  state.recipes[0].ingredients[0] = {
    name: "番茄",
    amount: 2,
    unit: "个",
    needsReview: true,
  };
  state = core.addMeal(state, "2026-10-19", "晚餐", state.recipes[0].id, 4);
  const item = core.shoppingList(
    state,
    core.weekDates(0, core.parseDate("2026-10-19")),
  )[0];
  state = core.toggleShopping(
    state,
    core.weekDates(0, core.parseDate("2026-10-19")),
    item.key,
    true,
  );
  await f.ok(
    "alice",
    "migration.import",
    { householdId: id, state, expectedVersion: snap.household.version },
    "migration_once_00001",
  );
  const retry = await f.ok(
    "alice",
    "migration.import",
    { householdId: id, state, expectedVersion: snap.household.version },
    "migration_once_00001",
  );
  assert.equal(retry.replayed, true);
  snap = await f.ok("alice", "pull", { householdId: id });
  assert.deepEqual(snap.state, state);
  assert.equal(
    (
      await f.call("alice", "migration.import", {
        householdId: id,
        state,
        expectedVersion: snap.household.version,
      })
    ).error.code,
    "CONFLICT",
  );
  const other = await f.family("eve");
  await f.join(other, "charlie", "eve");
  const current = await f.ok("eve", "pull", { householdId: other });
  assert.equal(
    (
      await f.call("eve", "migration.import", {
        householdId: other,
        state,
        expectedVersion: current.household.version,
      })
    ).error.code,
    "CONFLICT",
  );
});
test("pull versions reflect atomic recipes/plans/checks revisions and unchanged responses still verify membership", async () => {
  const f = await setup();
  let snap = await f.ok("alice", "pull", { householdId: f.id });
  const unchanged = await f.ok("alice", "pull", {
    householdId: f.id,
    knownVersion: snap.household.version,
  });
  assert.equal(unchanged.unchanged, true);
  assert.equal(
    (
      await f.call("stranger", "pull", {
        householdId: f.id,
        knownVersion: snap.household.version,
      })
    ).error.code,
    "FORBIDDEN",
  );
  for (const collection of ["recipes", "plans", "shopping_checks"])
    assert.equal(
      f.store.docs.get(`${collection}/${f.id}`).data.version,
      snap.household.dataVersion,
    );
});
