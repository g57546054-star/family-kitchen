const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../utils/core");
const { createRepository, STORAGE_KEY } = require("../services/repository");
const {
  createFamilyProvider,
  createModeRepository,
  createWeChatTransport,
} = require("../services/family-provider");
const { memoryStorage, loadPage, event } = require("./helpers.cjs");
const { fixture } = require("../../cloudfunctions/family/tests/helpers.cjs");
const { APPID } = require("../../cloudfunctions/family/domain");
function client(f, who, storage = memoryStorage()) {
  const local = createRepository(storage);
  let calls = 0,
    failBefore = false,
    failAfter = false;
  const transport = async (request) => {
    calls++;
    assert.deepEqual(Object.keys(request).sort(), [
      "action",
      "payload",
      "requestId",
    ]);
    if (failBefore) throw new Error("network unavailable");
    const result = await f.service.handle(request, { OPENID: who, APPID });
    if (failAfter) throw new Error("lost response");
    return result;
  };
  const family = createFamilyProvider({
    localRepository: local,
    transport,
    storage,
  });
  return {
    local,
    family,
    storage,
    repository: createModeRepository(local, family),
    get calls() {
      return calls;
    },
    set failBefore(v) {
      failBefore = v;
    },
    set failAfter(v) {
      failAfter = v;
    },
  };
}
async function activate(c) {
  await c.family.connect();
  await c.family.pull(true);
  c.family.activate();
}
test("app launch and local CRUD do not initialize cloud, call login or transport", () => {
  let definition,
    initialized = 0,
    called = 0;
  const storage = memoryStorage();
  global.wx = {
    getStorageSync: (k) => storage.get(k),
    setStorageSync: (k, v) => storage.set(k, v),
    getStorageInfoSync: () => ({ keys: storage.keys() }),
    cloud: {
      init() {
        initialized++;
      },
      callFunction() {
        called++;
      },
    },
  };
  global.App = (value) => {
    definition = value;
  };
  delete require.cache[require.resolve("../app")];
  require("../app");
  delete global.App;
  definition.onLaunch();
  definition.repository.transact((s) =>
    core.toggleFavorite(s, s.recipes[0].id),
  );
  assert.equal(initialized, 0);
  assert.equal(called, 0);
  assert.equal(definition.familyProvider.status().mode, "local");
  assert.equal(definition.repository.load().recipes[0].favorite, true);
});
test("WeChat transport initializes the explicit environment only when invoked, and calls a function rather than direct DB", async () => {
  const seen = [];
  const transport = createWeChatTransport({
    cloud: {
      init: (options) => seen.push(["init", options]),
      callFunction: async (options) => {
        seen.push(["call", options]);
        return { result: { ok: true, data: {} } };
      },
    },
  });
  assert.equal(seen.length, 0);
  await transport({ action: "session" });
  await transport({ action: "session" });
  assert.equal(seen.filter((e) => e[0] === "init").length, 1);
  assert.equal(seen[0][1].env, "family-kitchen-dev-d1cpz6ecb217f");
  assert.equal(seen[1][1].name, "family");
});
test("activation requires preview and a successful backup, keeps local active key intact, and cloud guard blocks snapshot writes", async () => {
  const f = fixture();
  await f.family();
  const c = client(f, "alice");
  c.local.transact((s) => core.toggleFavorite(s, s.recipes[0].id));
  const raw = c.storage.get(STORAGE_KEY);
  assert.throws(() => c.family.activate(), /预览/);
  await c.family.connect();
  await c.family.pull(true);
  c.storage.failAfter = c.storage.writes.length;
  assert.throws(() => c.family.activate(), /空间/);
  assert.equal(c.family.status().mode, "local");
  c.storage.failAfter = Infinity;
  c.family.activate();
  assert.equal(c.storage.get(STORAGE_KEY), raw);
  assert.equal(c.local.listBackups().length, 1);
  assert.throws(() => c.repository.transact((s) => s), /共享模式/);
  assert.throws(
    () => c.repository.restoreNative(c.local.exportNative()),
    /共享模式/,
  );
  assert.equal(c.repository.load().recipes[0].favorite, false);
  c.family.useLocal();
  assert.equal(c.repository.load().recipes[0].favorite, true);
});
test("shared controllers use server commands and two users see plans, serving deltas and shopping state", async () => {
  const f = fixture(),
    id = await f.family();
  await f.join(id);
  const a = client(f, "alice"),
    b = client(f, "bob");
  await activate(a);
  await activate(b);
  const loaded = loadPage("week", a.repository);
  loaded.app.familyProvider = a.family;
  loaded.app.localRepository = a.local;
  const page = loaded.page;
  page.refresh();
  page.add(event("", { date: "2026-10-19", slot: "晚餐" }));
  await page.save();
  await b.family.pull(true);
  const recipeId = a.family.load().recipes[0].id;
  assert.equal(b.family.load().plans["2026-10-19:晚餐"][0].servings, 2);
  await page.adjust(
    event("", {
      date: "2026-10-19",
      slot: "晚餐",
      id: recipeId,
      servings: 2,
      delta: 1,
    }),
  );
  await b.family.pull(true);
  assert.equal(b.family.load().plans["2026-10-19:晚餐"][0].servings, 3);
  const item = core.shoppingList(
    b.family.load(),
    core.weekDates(0, core.parseDate("2026-10-19")),
  )[0];
  await b.family.command("shopping.set", {
    start: "2026-10-19",
    key: item.key,
    checked: true,
    menuVersion: b.family.menuVersion(),
    checkVersion: 0,
  });
  await a.family.pull(true);
  assert.equal(a.family.load().checked.length, 1);
  assert.equal(a.local.load().plans["2026-10-19:晚餐"], undefined);
});
test("ambiguous writes persist their request ID across restart and retry exactly once", async () => {
  const f = fixture();
  await f.family();
  const c = client(f, "alice");
  await activate(c);
  const payload = {
    date: "2026-10-19",
    slot: "晚餐",
    recipeId: c.family.load().recipes[0].id,
    servings: 2,
  };
  c.failAfter = true;
  await assert.rejects(c.family.command("plan.add", payload), /网络/);
  assert.equal(c.family.status().pending, true);
  await assert.rejects(c.family.command("plan.add", payload), /重试/);
  const restarted = client(f, "alice", c.storage);
  assert.equal(restarted.calls, 0);
  await restarted.family.connect();
  assert.equal(restarted.family.status().pending, true);
  const result = await restarted.family.retry();
  assert.equal(result.replayed, true);
  await restarted.family.pull(true);
  restarted.family.activate();
  assert.equal(restarted.family.load().plans["2026-10-19:晚餐"][0].servings, 2);
  assert.equal(restarted.family.status().pending, false);
});
test("failure to persist an outgoing operation prevents sending; non-member pulls purge in-memory shared snapshot", async () => {
  const f = fixture(),
    id = await f.family();
  await f.join(id);
  const b = client(f, "bob");
  await activate(b);
  const calls = b.calls;
  b.storage.failAfter = b.storage.writes.length;
  await assert.rejects(
    b.family.command("plan.add", {
      date: "2026-10-19",
      slot: "晚餐",
      recipeId: b.family.load().recipes[0].id,
      servings: 2,
    }),
    /空间/,
  );
  assert.equal(b.calls, calls);
  b.storage.failAfter = Infinity;
  const snap = await f.ok("alice", "pull", { householdId: id });
  await f.ok("alice", "member.remove", {
    householdId: id,
    memberId: b.family.status().household.uid,
    expectedVersion: snap.household.version,
  });
  await assert.rejects(b.family.pull(true), /成员/);
  assert.equal(b.family.status().mode, "local");
  assert.equal(b.family.snapshot(), null);
});
test("migration keeps local originals and both backups; quota failure aborts before upload", async () => {
  const f = fixture();
  await f.family();
  const c = client(f, "alice");
  let state = c.local.load();
  state.recipes[0].ingredients[0] = {
    name: "鸡蛋",
    amount: 3,
    unit: "个",
    needsReview: true,
  };
  state = core.addMeal(state, "2026-10-19", "晚餐", state.recipes[0].id, 4);
  c.local.save(state);
  const raw = c.storage.get(STORAGE_KEY);
  await activate(c);
  const version = c.family.expected();
  c.storage.failAfter = c.storage.writes.length + 1;
  const calls = c.calls;
  await assert.rejects(c.family.importLocal(state, version), /空间/);
  assert.equal(c.calls, calls);
  c.storage.failAfter = Infinity;
  await c.family.importLocal(state, version);
  assert.equal(c.storage.get(STORAGE_KEY), raw);
  assert.equal(c.family.load().recipes[0].ingredients[0].unit, "个");
  const backups = c.local.listBackups();
  assert.ok(backups.some((b) => b.kind === "before-cloud-import"));
  assert.ok(backups.some((b) => b.kind === "cloud-before-import"));
  await assert.rejects(
    c.family.importLocal(state, c.family.expected()),
    /只能/,
  );
});
test("family page creates and previews, and requires a second explicit confirmation to activate", async () => {
  const f = fixture(),
    c = client(f, "alice");
  const loaded = loadPage("family", c.repository);
  loaded.app.familyProvider = c.family;
  loaded.app.localRepository = c.local;
  await c.family.connect();
  loaded.page.setData({ name: "我们的厨房", displayName: "爸爸" });
  // Capture actions to exercise actual confirmation callbacks and await async work.
  const prompts = [];
  loaded.api.showModal = (options) => prompts.push(options);
  loaded.page.create();
  assert.equal(c.family.status().mode, "local");
  assert.equal(prompts.length, 1);
  prompts.shift().success({ confirm: false });
  assert.equal(c.family.status().householdId, null);
  loaded.page.create();
  prompts.shift().success({ confirm: true });
  for (let i = 0; i < 30 && !loaded.page.data.canActivate; i++)
    await new Promise((resolve) => setImmediate(resolve));
  assert.equal(loaded.page.data.canActivate, true);
  assert.equal(c.family.status().mode, "local");
  loaded.page.activate();
  assert.equal(c.family.status().mode, "local");
  prompts.shift().success({ confirm: true });
  assert.equal(c.family.status().mode, "cloud");
});
test("a confirmed write followed by a failed refresh is reported as saved, never as an unconfirmed write", async () => {
  const f = fixture();
  await f.family();
  const local = createRepository(memoryStorage());
  let failPull = false;
  const family = createFamilyProvider({
    localRepository: local,
    transport: async (request) => {
      if (failPull && request.action === "pull")
        throw new Error("lost refresh");
      return f.service.handle(request, { OPENID: "alice", APPID });
    },
  });
  await family.connect();
  await family.pull(true);
  family.activate();
  failPull = true;
  const result = await family.command("plan.add", {
    date: "2026-10-19",
    slot: "晚餐",
    recipeId: family.load().recipes[0].id,
    servings: 2,
  });
  assert.equal(result.refreshPending, true);
  assert.equal(family.status().pending, false);
  assert.match(family.status().error, /已保存/);
});
test("an INTERNAL service error retains the request for idempotent retry because commit status may be unknown", async () => {
  const f = fixture();
  await f.family();
  const local = createRepository(memoryStorage());
  let uncertain = false;
  const family = createFamilyProvider({
    localRepository: local,
    transport: async (request) => {
      const response = await f.service.handle(request, {
        OPENID: "alice",
        APPID,
      });
      return uncertain && request.action === "plan.add"
        ? { ok: false, error: { code: "INTERNAL", message: "服务暂不可用" } }
        : response;
    },
  });
  await family.connect();
  await family.pull(true);
  family.activate();
  uncertain = true;
  await assert.rejects(
    family.command("plan.add", {
      date: "2026-10-19",
      slot: "晚餐",
      recipeId: family.load().recipes[0].id,
      servings: 2,
    }),
    /暂不可用/,
  );
  assert.equal(family.status().pending, true);
  uncertain = false;
  assert.equal((await family.retry()).replayed, true);
  assert.equal(family.load().plans["2026-10-19:晚餐"][0].servings, 2);
});
test("an open cloud editor cannot write its form into local data after membership loss or a mode switch", async () => {
  const f = fixture();
  await f.family();
  const c = client(f, "alice");
  await activate(c);
  const loaded = loadPage("edit", c.repository);
  loaded.app.familyProvider = c.family;
  loaded.app.localRepository = c.local;
  loaded.page.onLoad({ id: encodeURIComponent(c.family.load().recipes[0].id) });
  c.family.useLocal();
  const before = JSON.stringify(c.local.load());
  loaded.page.save();
  assert.match(loaded.page.data.error, /模式已变化/);
  assert.equal(JSON.stringify(c.local.load()), before);
});
test("shared commands stay busy until their post-write refresh completes, preventing a second submit in that interval", async () => {
  const f = fixture();
  await f.family();
  const local = createRepository(memoryStorage());
  let holdPull = false,
    release;
  const family = createFamilyProvider({
    localRepository: local,
    transport: async (request) => {
      if (holdPull && request.action === "pull")
        await new Promise((resolve) => {
          release = resolve;
        });
      return f.service.handle(request, { OPENID: "alice", APPID });
    },
  });
  await family.connect();
  await family.pull(true);
  family.activate();
  holdPull = true;
  const payload = {
    date: "2026-10-19",
    slot: "晚餐",
    recipeId: family.load().recipes[0].id,
    servings: 2,
  };
  const saving = family.command("plan.add", payload);
  for (let i = 0; i < 30 && !release; i++)
    await new Promise((resolve) => setImmediate(resolve));
  assert.equal(typeof release, "function");
  assert.equal(family.status().busy, true);
  await assert.rejects(family.command("plan.add", payload), /等待/);
  holdPull = false;
  release();
  await saving;
  assert.equal(family.status().busy, false);
  assert.equal(family.load().plans["2026-10-19:晚餐"][0].servings, 2);
});
