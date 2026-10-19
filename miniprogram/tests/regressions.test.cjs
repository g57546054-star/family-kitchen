const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../utils/core");
const { createRepository } = require("../services/repository");
const {
  checkTemplateExpressions,
} = require("../scripts/check-expressions.cjs");
const {
  loadPage,
  memoryStorage,
  legacyState,
  event,
} = require("./helpers.cjs");

test("WXML expression guard rejects the original preview string split across lines", () => {
  const broken =
    "<text>{{preview.kind === 'web' ? '网页备份 · 合并迁移' : '小程序备份 ·\n完整恢复'}}</text>";
  assert.throws(
    () => checkTemplateExpressions(broken, "backup/index.wxml"),
    /backup\/index.wxml:1: 无效的 WXML 表达式/,
  );
});

test("WXML expression guard allows line breaks between tokens and escaped quotes", () => {
  assert.equal(
    checkTemplateExpressions(
      "<text>{{preview.kind === 'web' ?\n'网页备份' : '小程序备份'}}</text><text>{{'it\\'s valid'}}</text>",
    ),
    2,
  );
});

test("web and native backup previews provide complete labels without modifying stored data", () => {
  const storage = memoryStorage();
  const repo = createRepository(storage);
  for (const [raw, title, confirmText] of [
    [
      JSON.stringify(legacyState()),
      "网页备份 · 合并迁移",
      "确认迁移并自动备份",
    ],
    [repo.exportNative(), "小程序备份 · 完整恢复", "确认恢复并备份当前数据"],
  ]) {
    const { page } = loadPage("backup", repo);
    page.input(event(raw));
    page.preview();
    assert.equal(page.data.preview.title, title);
    assert.equal(page.data.preview.confirmText, confirmText);
    assert.equal(storage.writes.length, 0);
  }
});

test("actual list -> detail -> edit navigation resolves encoded IDs in all recipe namespaces", () => {
  const storage = memoryStorage();
  const repo = createRepository(storage);
  repo.transact((state) =>
    core.saveRecipe(state, {
      ...core.clone(state.recipes[0]),
      id: "private:family:stew",
      name: "我的私房菜",
      origin: "private",
    }),
  );
  repo.importWeb(JSON.stringify(legacyState()));
  const before = [...storage.entries];
  const writes = storage.writes.length;
  for (const id of [
    "native:tomato-egg",
    "private:family:stew",
    "web:tomato-egg",
  ]) {
    const list = loadPage("recipes", repo);
    list.page.open(event(null, { id }));
    const encodedId = list.navigation[0].split("?id=")[1];
    assert.ok(encodedId.includes("%3A"));
    const detail = loadPage("detail", repo);
    detail.page.onLoad({ id: encodedId });
    detail.page.onShow();
    assert.equal(detail.page.data.error, "");
    assert.equal(detail.page.data.recipe.id, id);
    detail.page.edit();
    const edit = loadPage("edit", repo);
    edit.page.onLoad({ id: detail.navigation[0].split("?id=")[1] });
    assert.equal(edit.page.data.ready, true);
    assert.equal(edit.page.original.id, id);
  }
  assert.deepEqual([...storage.entries], before);
  assert.equal(storage.writes.length, writes);
});

test("details accept already-decoded IDs and retain plan query behavior", () => {
  const { page } = loadPage("detail");
  page.onLoad({ id: "native:tomato-egg", plan: "1" });
  page.onShow();
  assert.equal(page.data.recipe.id, "native:tomato-egg");
  assert.equal(page.data.showPlan, true);
});

test("missing or malformed route IDs show an error without crashing or writing data", () => {
  const storage = memoryStorage();
  const repo = createRepository(storage);
  for (const id of [
    undefined,
    "",
    "%ZZ",
    "%E0%A4%A",
    "native%253Atomato-egg",
    123,
  ]) {
    const detail = loadPage("detail", repo);
    assert.doesNotThrow(() => {
      detail.page.onLoad({ id });
      detail.page.onShow();
    });
    assert.equal(detail.page.data.recipe, null);
    assert.match(detail.page.data.error, /链接无效/);
  }
  assert.equal(storage.writes.length, 0);
});

test("a decoded but deleted recipe retains the not-found message and cannot create new data", () => {
  const storage = memoryStorage();
  const repo = createRepository(storage);
  const { page } = loadPage("detail", repo);
  page.onLoad({ id: encodeURIComponent("private:deleted") });
  page.onShow();
  assert.match(page.data.error, /不存在或已被删除/);
  assert.equal(storage.writes.length, 0);
});
