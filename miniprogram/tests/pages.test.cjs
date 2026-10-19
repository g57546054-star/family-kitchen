const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../utils/core");
const { createRepository, STORAGE_KEY } = require("../services/repository");
const {
  loadPage,
  event,
  memoryStorage,
  legacyState,
} = require("./helpers.cjs");

test("recipe page searches, favorites and private filters use stored data", () => {
  const { page, repository } = loadPage("recipes");
  page.onShow();
  assert.equal(page.data.recipes.length, 12);
  page.search(event("土豆 牛肉"));
  assert.equal(page.data.recipes[0].name, "土豆炖牛肉");
  page.favorite(event(null, { id: "native:potato-beef" }));
  assert.equal(
    repository.load().recipes.find((r) => r.id === "native:potato-beef")
      .favorite,
    true,
  );
  page.favorites();
  assert.equal(page.data.recipes.length, 1);
  page.privateRecipes();
  assert.equal(page.data.recipes.length, 0);
});
test("native edit creates a private copy without overwriting a built-in", () => {
  const { page, repository, navigation } = loadPage("edit");
  page.onLoad({ id: "native:tomato-egg" });
  assert.equal(page.data.copying, true);
  page.field(event("我的少油炒蛋", { field: "name" }));
  page.save();
  assert.equal(page.data.error, "");
  assert.equal(repository.load().recipes.length, 13);
  const added = repository
    .load()
    .recipes.find((r) => r.name === "我的少油炒蛋");
  assert.equal(added.origin, "private");
  assert.equal(
    repository.load().recipes.find((r) => r.id === "native:tomato-egg").name,
    "番茄炒蛋",
  );
  assert.ok(navigation[0].startsWith("/pages/detail/index?id=private"));
});
test("changing a legacy count/volume to grams clears amount and requires explicit weight verification", () => {
  const repo = createRepository(memoryStorage());
  repo.importWeb(JSON.stringify(legacyState()));
  const { page } = loadPage("edit", repo);
  page.onLoad({ id: "web:tomato-egg" });
  page.unit(event("0", { index: 0 })); // 个 -> 克
  assert.equal(page.data.ingredients[0].amount, "");
  assert.equal(page.data.ingredients[0].reviewRequired, true);
  page.ingredient(event("320", { index: 0, field: "amount" }));
  page.save();
  assert.match(page.data.error, /称重/);
  page.confirmWeight({
    detail: { checked: true },
    currentTarget: { dataset: { index: 0 } },
  });
  page.save();
  const ingredient = repo.load().recipes.find((r) => r.id === "web:tomato-egg")
    .ingredients[0];
  assert.equal(ingredient.amount, 320);
  assert.equal(ingredient.unit, "克");
  assert.equal(ingredient.needsReview, false);
  assert.deepEqual(ingredient.sourceMeasure, { amount: 2, unit: "个" });
});
test("editor mass conversion is dimensional and invalid form or quota failures keep stored data", () => {
  const storage = memoryStorage();
  const repo = createRepository(storage);
  const { page, navigation } = loadPage("edit", repo);
  page.onLoad({});
  page.save();
  assert.match(page.data.error, /菜名/);
  page.onLoad({ id: "native:tomato-egg" });
  page.unit(event("1", { index: 0 }));
  assert.equal(page.data.ingredients[0].amount, "0.3");
  storage.failKey = STORAGE_KEY;
  page.save();
  assert.match(page.data.error, /空间不足/);
  assert.equal(navigation.length, 0);
  assert.equal(repo.load().recipes.length, 12);
});
test("detail -> week -> procurement controllers execute a complete native local flow", () => {
  const repo = createRepository(memoryStorage());
  const detail = loadPage("detail", repo);
  detail.page.onLoad({ id: "native:tomato-egg" });
  detail.page.onShow();
  detail.page.date(event("2026-10-19"));
  detail.page.servings(event("4"));
  detail.page.savePlan();
  assert.ok(detail.navigation.includes("/pages/week/index"));
  const week = loadPage("week", repo);
  week.app.selectedWeekDate = "2026-10-19";
  week.page.onShow();
  assert.equal(week.page.data.count, 1);
  week.page.adjust(
    event(null, {
      date: "2026-10-19",
      slot: "晚餐",
      id: "native:tomato-egg",
      servings: 4,
      delta: -1,
    }),
  );
  const shopping = loadPage("shopping", repo);
  shopping.app.shoppingWeekOffset = week.page.data.offset;
  shopping.page.onShow();
  const tomato = shopping.page.data.items.find((i) => i.name === "番茄");
  assert.equal(tomato.amount, 450);
  shopping.page.toggle({
    detail: { checked: true },
    currentTarget: { dataset: { key: tomato.key } },
  });
  assert.equal(shopping.page.data.completed, 1);
  shopping.page.copy();
  assert.match(shopping.api.clipboard, /450 克/);
  week.page.remove(
    event(null, { date: "2026-10-19", slot: "晚餐", id: "native:tomato-egg" }),
  );
  assert.equal(repo.load().plans["2026-10-19:晚餐"].length, 0);
});
test("week popup selects a dish and adds the requested servings", () => {
  const { page, repository } = loadPage("week");
  page.onShow();
  page.add(event(null, { date: "2026-10-19", slot: "午餐" }));
  assert.equal(page.data.showPicker, true);
  page.chooseRecipe(event("1"));
  page.servings(event("3"));
  page.save();
  assert.equal(repository.load().plans["2026-10-19:午餐"][0].servings, 3);
  assert.equal(page.data.showPicker, false);
});
test("shopping explicitly separates unresolved legacy units from mass", () => {
  const repo = createRepository(memoryStorage());
  repo.importWeb(JSON.stringify(legacyState()));
  const { page, app } = loadPage("shopping", repo);
  app.shoppingWeekOffset = Math.round(
    (core.parseDate("2026-10-19") -
      core.parseDate(core.weekStart(new Date()))) /
      (7 * 86400000),
  );
  page.onShow();
  assert.equal(page.data.pendingItems.length, 3);
  assert.equal(page.data.items.length, 1);
  assert.equal(
    page.data.pendingItems.find((i) => i.name === "食用油").unit,
    "毫升",
  );
});
test("backup controller previews without writes, requires confirmation, imports and exports originals", () => {
  const storage = memoryStorage();
  const repo = createRepository(storage);
  const { page, api } = loadPage("backup", repo);
  const raw = JSON.stringify(legacyState(), null, 2);
  page.input(event(raw));
  page.preview();
  assert.equal(page.data.preview.pending, 3);
  assert.equal(storage.writes.length, 0);
  page.importConfirmed();
  assert.equal(repo.load().recipes.length, 13);
  assert.equal(page.data.backups.length, 2);
  const original = page.data.backups.find((b) => b.kind === "web-v1");
  page.copyOriginal(event(null, { key: original.key }));
  assert.equal(api.clipboard, raw);
  page.copyNative();
  assert.equal(
    JSON.parse(api.clipboard).format,
    "family-kitchen-native-backup",
  );
});
test("corrupt-data pages expose recovery instead of rendering seeded records", () => {
  const repo = createRepository(memoryStorage({ [STORAGE_KEY]: "{broken" }));
  const list = loadPage("recipes", repo);
  list.page.onShow();
  assert.equal(list.page.data.recipes.length, 0);
  assert.match(list.page.data.error, /不会自动覆盖/);
  const backup = loadPage("backup", repo);
  backup.page.onShow();
  assert.match(backup.page.data.error, /损坏/);
});

test("canceling the migration confirmation leaves both active state and backup keys unchanged", () => {
  const storage = memoryStorage();
  const { page, api } = loadPage("backup", createRepository(storage));
  page.input(event(JSON.stringify(legacyState())));
  page.preview();
  api.showModal = (options) => options.success({ confirm: false });
  page.importConfirmed();
  assert.equal(storage.writes.length, 0);
  assert.equal(page.data.preview.kind, "web");
});
