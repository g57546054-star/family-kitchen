const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../utils/core");
const { legacyState } = require("./helpers.cjs");
const migration = require("../services/migration");
const dates = core.weekDates(0, new Date(2026, 9, 19, 12));

test("at least 12 complete reference recipes contain explicit edible gram amounts", () => {
  const state = core.initialState();
  core.validateState(state);
  assert.ok(state.recipes.length >= 12);
  assert.equal(
    new Set(state.recipes.map((r) => r.id)).size,
    state.recipes.length,
  );
  for (const r of state.recipes) {
    assert.ok(r.servings >= 1 && r.minutes >= 1 && r.steps.length >= 4);
    assert.ok(
      r.ingredients.every(
        (i) => i.unit === "克" && i.amount > 0 && i.needsReview === false,
      ),
    );
    assert.match(r.weightNote, /参考配方/);
  }
  state.recipes[0].name = "modified";
  assert.notEqual(core.initialState().recipes[0].name, "modified");
});
test("week calculation handles Sundays, cross-year weeks and invalid dates", () => {
  assert.equal(
    core.localDate(core.weekDates(0, new Date(2027, 0, 3))[0]),
    "2026-12-28",
  );
  assert.equal(
    core.localDate(core.weekDates(1, new Date(2026, 11, 31))[0]),
    "2027-01-04",
  );
  assert.throws(() => core.parseDate("2026-02-30"), /不存在/);
  assert.throws(() => core.mealKey("2026-10-19", "夜宵"), /餐次/);
  assert.equal(core.weekStart("2026-10-25"), "2026-10-19");
});
test("search combines ingredient terms, category and favorites", () => {
  const recipes = core.initialState().recipes;
  assert.deepEqual(
    core.searchRecipes(recipes, "土豆 牛肉").map((r) => r.name),
    ["土豆炖牛肉"],
  );
  assert.equal(core.searchRecipes(recipes, "土豆 牛肉", "素菜").length, 0);
  const state = core.toggleFavorite(core.initialState(), "native:tomato-egg");
  assert.equal(
    core.searchRecipes(state.recipes, "", "全部", true)[0].name,
    "番茄炒蛋",
  );
});
test("servings scale, duplicate dishes merge, meal changes invalidate only that week", () => {
  let state = core.addMeal(
    core.initialState(),
    "2026-10-19",
    "晚餐",
    "native:tomato-egg",
    2,
  );
  state = core.addMeal(state, "2026-10-19", "晚餐", "native:tomato-egg", 2);
  assert.equal(state.plans["2026-10-19:晚餐"].length, 1);
  assert.equal(state.plans["2026-10-19:晚餐"][0].servings, 4);
  const tomato = core.shoppingList(state, dates).find((i) => i.name === "番茄");
  assert.equal(tomato.amount, 600);
  state = core.toggleShopping(state, dates, tomato.key, true);
  state.checked.push('2026-10-26:["番茄","克"]');
  state = core.changeMeal(state, "2026-10-19", "晚餐", "native:tomato-egg", 3);
  assert.deepEqual(state.checked, ['2026-10-26:["番茄","克"]']);
  assert.equal(
    core.shoppingList(state, dates).find((i) => i.name === "番茄").amount,
    450,
  );
  state = core.changeMeal(state, "2026-10-19", "晚餐", "native:tomato-egg", 0);
  assert.equal(core.shoppingList(state, dates).length, 0);
});
test("shopping merges known mass units but never converts counts or milliliters to grams", () => {
  let state = migration.migrateWeb(JSON.stringify(legacyState())).state;
  const legacy = state.recipes[0];
  legacy.ingredients.push(
    { name: "食用油", amount: 15, unit: "克", needsReview: false },
    { name: "盐", amount: 0.001, unit: "千克", needsReview: false },
  );
  state = core.addMeal(state, "2026-10-19", "午餐", legacy.id, 2);
  const list = core.shoppingList(state, dates);
  assert.equal(list.find((i) => i.name === "番茄").unit, "个");
  assert.equal(list.find((i) => i.name === "番茄").amount, 6);
  assert.equal(list.filter((i) => i.name === "食用油").length, 2);
  assert.equal(list.find((i) => i.name === "盐").amount, 9);
  assert.equal(
    list.find((i) => i.name === "食用油" && i.unit === "毫升").needsReview,
    true,
  );
});
test("private recipe create edit delete updates plans without mutating built-ins", () => {
  let state = core.initialState();
  const original = core.clone(state);
  const recipe = {
    ...core.clone(state.recipes[0]),
    id: "private:test",
    name: "我的炒蛋",
    origin: "private",
  };
  state = core.saveRecipe(state, recipe);
  state = core.addMeal(state, "2026-10-19", "晚餐", recipe.id, 2);
  state = core.saveRecipe(state, {
    ...recipe,
    ingredients: [
      { name: "鸡蛋液", amount: 200, unit: "克", needsReview: false },
    ],
  });
  assert.equal(core.shoppingList(state, dates)[0].amount, 200);
  state = core.deleteRecipe(state, recipe.id);
  assert.equal(state.plans["2026-10-19:晚餐"].length, 0);
  assert.deepEqual(state.recipes, original.recipes);
  assert.throws(() => core.saveRecipe(state, state.recipes[0]), /另存/);
  assert.throws(() => core.deleteRecipe(state, state.recipes[0].id), /内置/);
});
test("invalid quantities, references and duplicate IDs cannot be saved", () => {
  const state = core.initialState();
  for (const n of [0, -1, 1.5, 101, NaN, Infinity])
    assert.throws(() =>
      core.addMeal(state, "2026-10-19", "午餐", state.recipes[0].id, n),
    );
  assert.throws(() => core.addMeal(state, "2026-10-19", "午餐", "missing", 2));
  const bad = core.initialState();
  bad.recipes.push(core.clone(bad.recipes[0]));
  assert.throws(() => core.validateState(bad), /重复/);
  const unknown = core.initialState();
  unknown.plans["2026-10-19:晚餐"] = [{ recipeId: "missing", servings: 2 }];
  assert.throws(() => core.validateState(unknown));
  const badUnit = core.clone(state.recipes[0]);
  badUnit.ingredients[0].unit = "个";
  assert.throws(() => core.validateRecipe(badUnit), /待核对/);
});
test("week isolation and tiny fractional weights are represented accurately", () => {
  const state = core.addMeal(
    core.initialState(),
    "2026-10-19",
    "午餐",
    "native:tomato-egg",
    2,
  );
  assert.equal(core.shoppingList(state, core.weekDates(1, dates[0])).length, 0);
  assert.equal(core.formatAmount(0.004), "<0.01");
  assert.equal(core.formatAmount(1.33333), "1.33");
});
