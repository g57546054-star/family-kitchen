const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../utils/core");
const migration = require("../services/migration");
const {
  createRepository,
  STORAGE_KEY,
  BACKUP_PREFIX,
  wxStorage,
} = require("../services/repository");
const { createDisabledFamilyProvider } = require("../services/family-provider");
const { memoryStorage, legacyState } = require("./helpers.cjs");

test("WeChat storage adapter persists across repository instances and keeps web namespace separate", () => {
  const storage = memoryStorage({
    "family-kitchen:v1": "old-web-do-not-touch",
  });
  const api = {
    getStorageSync: (k) => storage.get(k),
    setStorageSync: (k, v) => storage.set(k, v),
    getStorageInfoSync: () => ({ keys: storage.keys() }),
  };
  const repo = createRepository(wxStorage(api));
  repo.transact((s) => core.toggleFavorite(s, "native:tomato-egg"));
  assert.equal(
    createRepository(wxStorage(api)).load().recipes[0].favorite,
    true,
  );
  assert.equal(storage.get("family-kitchen:v1"), "old-web-do-not-touch");
});
test("preview never writes; import keeps exact web backup and pre-import snapshot", () => {
  const storage = memoryStorage();
  const repo = createRepository(storage);
  const raw = JSON.stringify(legacyState(), null, 2);
  const preview = repo.previewWeb(raw);
  assert.equal(preview.pending, 3);
  assert.equal(storage.writes.length, 0);
  repo.importWeb(raw, "旧网页.json");
  const state = repo.load();
  assert.equal(state.recipes.length, 13);
  assert.equal(
    state.recipes.find((r) => r.id === "web:tomato-egg").favorite,
    true,
  );
  assert.equal(state.plans["2026-10-19:晚餐"][0].recipeId, "web:tomato-egg");
  assert.deepEqual(state.checked, []);
  assert.equal(repo.listBackups().length, 2);
  const original = repo.listBackups().find((b) => b.kind === "web-v1");
  assert.equal(repo.readBackup(original.key), raw);
  const before = repo.listBackups().find((b) => b.kind === "before-import");
  assert.equal(
    migration.parseNativeBackup(repo.readBackup(before.key)).recipes.length,
    12,
  );
  assert.equal(storage.writes.at(-1).key, STORAGE_KEY);
});
test("duplicate import and overlapping recipe IDs cannot silently overwrite edits", () => {
  const storage = memoryStorage();
  const repo = createRepository(storage);
  const raw = JSON.stringify(legacyState());
  repo.importWeb(raw);
  const persisted = storage.get(STORAGE_KEY);
  const count = storage.writes.length;
  assert.throws(() => repo.importWeb(raw), /已经导入/);
  const modified = legacyState();
  modified.recipes[0].name = "新文件同ID";
  assert.throws(() => repo.importWeb(JSON.stringify(modified)), /同标识/);
  assert.equal(storage.get(STORAGE_KEY), persisted);
  assert.equal(storage.writes.length, count);
});
test("count and volume migration preserve amount, unit, source and all original records", () => {
  const raw = JSON.stringify(legacyState());
  const result = migration.migrateWeb(raw);
  const r = result.state.recipes[0];
  assert.deepEqual(r.ingredients[0], {
    name: "番茄",
    amount: 2,
    unit: "个",
    needsReview: true,
    sourceMeasure: { amount: 2, unit: "个" },
  });
  assert.equal(r.ingredients[2].amount, 15);
  assert.equal(r.ingredients[2].unit, "毫升");
  assert.equal(r.ingredients[3].needsReview, false);
});
test("backup failures or active-key quota failures abort import without touching existing data", () => {
  for (const failAfter of [0, 1, 2]) {
    const original = JSON.stringify(core.initialState());
    const storage = memoryStorage({ [STORAGE_KEY]: original });
    storage.failAfter = failAfter;
    const repo = createRepository(storage);
    assert.throws(
      () => repo.importWeb(JSON.stringify(legacyState())),
      /空间不足/,
    );
    assert.equal(storage.get(STORAGE_KEY), original);
  }
});
test("ordinary storage failures do not claim a successful mutation", () => {
  const storage = memoryStorage();
  const repo = createRepository(storage);
  storage.failKey = STORAGE_KEY;
  assert.throws(
    () => repo.transact((s) => core.toggleFavorite(s, "native:tomato-egg")),
    /空间不足/,
  );
  assert.equal(repo.load().recipes[0].favorite, false);
});
test("native backup round-trip and restore keep a recoverable pre-restore raw snapshot", () => {
  const storage = memoryStorage();
  const repo = createRepository(storage);
  repo.transact((s) =>
    core.addMeal(
      core.toggleFavorite(s, "native:tomato-egg"),
      "2026-10-19",
      "午餐",
      "native:tomato-egg",
      3,
    ),
  );
  const exported = repo.exportNative();
  const expected = repo.load();
  repo.save(core.initialState());
  repo.restoreNative(exported);
  assert.deepEqual(repo.load(), expected);
  const before = repo.listBackups().find((b) => b.kind === "before-restore");
  assert.deepEqual(
    JSON.parse(repo.readBackup(before.key)),
    core.initialState(),
  );
});
test("corrupted storage is not replaced with examples and can be exported and recovered", () => {
  const storage = memoryStorage({ [STORAGE_KEY]: "{broken" });
  const repo = createRepository(storage);
  assert.throws(() => repo.load(), /不会自动覆盖/);
  assert.equal(repo.exportRaw(), "{broken");
  assert.equal(storage.writes.length, 0);
  repo.restoreNative(
    JSON.stringify(migration.nativeBackup(core.initialState())),
  );
  assert.equal(repo.load().recipes.length, 12);
  assert.equal(repo.readBackup(repo.listBackups()[0].key), "{broken");
});
test("malformed, oversize, bad dates, unknown references and prototype-like keys abort before writes", () => {
  const storage = memoryStorage();
  const repo = createRepository(storage);
  const invalid = [
    "{broken",
    JSON.stringify({ version: 99 }),
    " ".repeat(migration.MAX_BYTES + 1),
  ];
  const badDate = legacyState();
  badDate.plans = { "2026-02-30:晚餐": [] };
  invalid.push(JSON.stringify(badDate));
  const badRef = legacyState();
  badRef.plans["2026-10-19:晚餐"][0].recipeId = "missing";
  invalid.push(JSON.stringify(badRef));
  const dangerous = legacyState();
  dangerous.plans = JSON.parse('{"__proto__":[]}');
  invalid.push(JSON.stringify(dangerous));
  for (const raw of invalid) assert.throws(() => repo.importWeb(raw));
  assert.equal(storage.writes.length, 0);
});
test("untrusted native backups are validated before active writes or backup writes", () => {
  const storage = memoryStorage();
  const repo = createRepository(storage);
  const bad = migration.nativeBackup(core.initialState());
  bad.state.recipes[0].ingredients[0].amount = -10;
  assert.throws(() => repo.restoreNative(JSON.stringify(bad)));
  assert.equal(storage.writes.length, 0);
});
test("CloudBase family provider is explicitly disabled and makes no network calls", async () => {
  const provider = createDisabledFamilyProvider();
  assert.equal(provider.getCapabilities().enabled, false);
  await assert.rejects(provider.pullFamily({ familyId: "future" }), {
    code: "FAMILY_SHARING_DISABLED",
  });
  await assert.rejects(provider.pushFamily({ familyId: "future" }), {
    code: "FAMILY_SHARING_DISABLED",
  });
});

test("existing null or empty values are corruption, not an absent state; recovery preserves them", () => {
  for (const value of [null, "", 0]) {
    const storage = memoryStorage({ [STORAGE_KEY]: value });
    const repo = createRepository(storage);
    assert.throws(() => repo.load(), /不会自动覆盖/);
    assert.equal(storage.writes.length, 0);
    repo.restoreNative(
      JSON.stringify(migration.nativeBackup(core.initialState())),
    );
    const backup = repo.listBackups().find((b) => b.kind === "before-restore");
    assert.equal(
      repo.readBackup(backup.key),
      typeof value === "string" ? value : JSON.stringify(value),
    );
  }
});

test("malformed archive metadata does not prevent listing recoverable backups or reading active data", () => {
  const storage = memoryStorage({ [`${BACKUP_PREFIX}bad`]: "{}" });
  const repo = createRepository(storage);
  repo.importWeb(JSON.stringify(legacyState()));
  assert.equal(repo.listBackups().length, 3);
  assert.equal(
    repo.listBackups().find((b) => b.key.endsWith("bad")).kind,
    "unreadable",
  );
  assert.equal(repo.load().recipes.length, 13);
});
