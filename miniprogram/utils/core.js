const seedRecipes = require("../data/recipes");

const CATEGORIES = ["荤菜", "素菜", "主食", "汤羹"];
const DAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const SLOTS = ["午餐", "晚餐"];
const MASS_UNITS = ["克", "千克"];
const clone = (value) => JSON.parse(JSON.stringify(value));
function fail(message, code = "INVALID_DATA") {
  const error = new Error(message);
  error.code = code;
  throw error;
}
function assert(condition, message) {
  if (!condition) fail(message);
}
function text(value, max = 1000) {
  return (
    typeof value === "string" && value.trim().length > 0 && value.length <= max
  );
}
function positive(value, max = 100000) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= max
  );
}
function count(value, max) {
  return positive(value, max) && Number.isInteger(value);
}
function localDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function parseDate(value) {
  assert(
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value),
    "日期格式不正确",
  );
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  assert(localDate(date) === value, "日期不存在");
  return date;
}
function weekDates(offset = 0, anchor = new Date()) {
  assert(
    Number.isInteger(offset) && Math.abs(offset) <= 520,
    "仅支持查看前后十年内的周次",
  );
  const start = new Date(anchor.getTime());
  start.setHours(12, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + offset * 7);
  return DAYS.map((_, i) => {
    const date = new Date(start.getTime());
    date.setDate(date.getDate() + i);
    return date;
  });
}
function mealKey(date, slot) {
  assert(SLOTS.includes(slot), "餐次不正确");
  return `${typeof date === "string" ? localDate(parseDate(date)) : localDate(date)}:${slot}`;
}
function validateRecipe(recipe) {
  assert(
    recipe &&
      typeof recipe.id === "string" &&
      /^[a-zA-Z0-9:_-]{1,140}$/.test(recipe.id),
    "菜谱标识不正确",
  );
  assert(
    text(recipe.name, 60) && CATEGORIES.includes(recipe.category),
    "请填写菜名并选择分类",
  );
  assert(
    count(recipe.servings, 100) && count(recipe.minutes, 1440),
    "基础人数需为1—100的整数，时间需为1—1440的整数",
  );
  assert(
    ["builtin", "private", "imported"].includes(recipe.origin) &&
      typeof recipe.favorite === "boolean",
    "菜谱来源或收藏状态不正确",
  );
  assert(
    Array.isArray(recipe.ingredients) &&
      recipe.ingredients.length > 0 &&
      recipe.ingredients.length <= 60,
    "请填写1—60项食材",
  );
  recipe.ingredients.forEach((i) => {
    assert(
      i && text(i.name, 40) && positive(i.amount) && text(i.unit, 12),
      "请填写有效的食材名称、正数用量和单位",
    );
    assert(typeof i.needsReview === "boolean", "食材缺少重量核对状态");
    assert(
      MASS_UNITS.includes(i.unit) || i.needsReview,
      "非重量单位必须标记为待核对，不能当作克",
    );
    if (i.sourceMeasure)
      assert(
        positive(i.sourceMeasure.amount) && text(i.sourceMeasure.unit, 12),
        "食材原始用量无效",
      );
  });
  assert(
    Array.isArray(recipe.steps) &&
      recipe.steps.length > 0 &&
      recipe.steps.length <= 40 &&
      recipe.steps.every((s) => text(s)),
    "请填写1—40个做法步骤，每步不超过1000字",
  );
  if (recipe.weightNote !== undefined)
    assert(text(recipe.weightNote, 300), "重量说明过长");
  return recipe;
}
function validateState(state) {
  assert(state && state.version === 2, "仅支持原生小程序 v2 数据");
  assert(
    Array.isArray(state.recipes) && state.recipes.length <= 500,
    "菜谱最多支持500道",
  );
  state.recipes.forEach(validateRecipe);
  const ids = new Set(state.recipes.map((r) => r.id));
  assert(ids.size === state.recipes.length, "菜谱标识重复");
  assert(
    state.plans &&
      typeof state.plans === "object" &&
      !Array.isArray(state.plans),
    "每周菜单格式不正确",
  );
  assert(Object.keys(state.plans).length <= 7300, "菜单记录过多");
  Object.entries(state.plans).forEach(([key, meals]) => {
    const match = /^(\d{4}-\d{2}-\d{2}):(午餐|晚餐)$/.exec(key);
    assert(match, "菜单日期或餐次不正确");
    parseDate(match[1]);
    assert(Array.isArray(meals) && meals.length <= 30, "每餐最多30道菜");
    assert(
      new Set(meals.map((m) => m && m.recipeId)).size === meals.length,
      "同一餐菜谱重复",
    );
    meals.forEach((m) =>
      assert(
        m && ids.has(m.recipeId) && count(m.servings, 100),
        "菜单引用不存在的菜谱或人数不正确",
      ),
    );
  });
  assert(
    Array.isArray(state.checked) &&
      state.checked.length <= 20000 &&
      state.checked.every((k) => text(k, 300)),
    "采购勾选格式不正确",
  );
  assert(
    Array.isArray(state.imports) &&
      state.imports.length <= 100 &&
      state.imports.every(
        (i) => i && text(i.id, 100) && text(i.backupKey, 180),
      ),
    "迁移记录不正确",
  );
  return state;
}
function initialState() {
  return {
    version: 2,
    recipes: clone(seedRecipes),
    plans: {},
    checked: [],
    imports: [],
  };
}
function searchRecipes(
  recipes,
  query = "",
  category = "全部",
  onlyFavorites = false,
) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return recipes.filter(
    (r) =>
      (!onlyFavorites || r.favorite) &&
      (category === "全部" || r.category === category) &&
      terms.every((q) =>
        [r.name, r.category, ...r.ingredients.map((i) => i.name)]
          .join(" ")
          .toLowerCase()
          .includes(q),
      ),
  );
}
function shoppingList(state, dates) {
  // Port of src/data.ts: same serving scaling, same name/unit grouping.
  // Only mass-to-mass normalization is added: 1 kg = 1000 g, never count/volume -> mass.
  const items = new Map();
  dates.forEach((date) =>
    SLOTS.forEach((slot) =>
      (state.plans[mealKey(date, slot)] || []).forEach((meal) => {
        const recipe = state.recipes.find((r) => r.id === meal.recipeId);
        if (!recipe) return;
        recipe.ingredients.forEach((ingredient) => {
          const unit =
            ingredient.unit === "千克" ? "克" : ingredient.unit.trim();
          const amount =
            (ingredient.amount *
              (ingredient.unit === "千克" ? 1000 : 1) *
              meal.servings) /
            recipe.servings;
          const key = JSON.stringify([ingredient.name.trim(), unit]);
          if (items.has(key)) {
            const item = items.get(key);
            item.amount += amount;
            item.needsReview = item.needsReview || ingredient.needsReview;
          } else
            items.set(key, {
              name: ingredient.name.trim(),
              amount,
              unit,
              key,
              needsReview: ingredient.needsReview,
            });
        });
      }),
    ),
  );
  return Array.from(items.values());
}
function formatAmount(amount) {
  return amount > 0 && amount < 0.01
    ? "<0.01"
    : String(Number(amount.toFixed(2)));
}
function weekStart(date) {
  return localDate(
    weekDates(0, typeof date === "string" ? parseDate(date) : date)[0],
  );
}
function checkedKey(start, itemKey) {
  return `${start}:${itemKey}`;
}
function invalidateWeek(state, date) {
  const prefix = `${weekStart(date)}:`;
  state.checked = state.checked.filter((k) => !k.startsWith(prefix));
}
function saveRecipe(state, recipe) {
  validateRecipe(recipe);
  const next = clone(state);
  const index = next.recipes.findIndex((r) => r.id === recipe.id);
  if (index >= 0 && next.recipes[index].origin === "builtin")
    fail("示例配方请先另存为私人菜谱", "BUILTIN_READONLY");
  assert(recipe.origin !== "builtin", "不能创建内置示例配方");
  if (index < 0) next.recipes.unshift(clone(recipe));
  else next.recipes[index] = clone(recipe);
  next.checked = [];
  return validateState(next);
}
function toggleFavorite(state, id) {
  const next = clone(state);
  const recipe = next.recipes.find((r) => r.id === id);
  assert(recipe, "菜谱不存在");
  recipe.favorite = !recipe.favorite;
  return next;
}
function deleteRecipe(state, id) {
  const recipe = state.recipes.find((r) => r.id === id);
  assert(recipe, "菜谱不存在");
  if (recipe.origin === "builtin")
    fail("内置示例保留供参考，可取消收藏", "BUILTIN_READONLY");
  const next = clone(state);
  next.recipes = next.recipes.filter((r) => r.id !== id);
  Object.keys(next.plans).forEach((k) => {
    next.plans[k] = next.plans[k].filter((m) => m.recipeId !== id);
  });
  next.checked = [];
  return next;
}
function addMeal(state, date, slot, recipeId, servings) {
  const next = clone(state);
  const key = mealKey(date, slot);
  assert(
    next.recipes.some((r) => r.id === recipeId),
    "请先选择有效菜谱",
  );
  assert(count(servings, 100), "用餐人数需为1—100的整数");
  const meals = next.plans[key] || [];
  const existing = meals.find((m) => m.recipeId === recipeId);
  if (existing) existing.servings += servings;
  else meals.push({ recipeId, servings });
  next.plans[key] = meals;
  invalidateWeek(next, date);
  return validateState(next);
}
function changeMeal(state, date, slot, recipeId, servings) {
  const next = clone(state);
  const key = mealKey(date, slot);
  const meals = next.plans[key] || [];
  assert(
    meals.some((m) => m.recipeId === recipeId),
    "菜单中没有这道菜",
  );
  if (servings === 0)
    next.plans[key] = meals.filter((m) => m.recipeId !== recipeId);
  else {
    assert(count(servings, 100), "用餐人数需为1—100的整数");
    meals.find((m) => m.recipeId === recipeId).servings = servings;
  }
  invalidateWeek(next, date);
  return validateState(next);
}
function toggleShopping(state, dates, key, checked) {
  assert(
    shoppingList(state, dates).some((i) => i.key === key),
    "食材已不在当前清单中，请刷新",
  );
  const next = clone(state);
  const fullKey = checkedKey(localDate(dates[0]), key);
  next.checked = next.checked.filter((k) => k !== fullKey);
  if (checked) next.checked.push(fullKey);
  return next;
}
function newId() {
  return `private:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
}

module.exports = {
  CATEGORIES,
  DAYS,
  SLOTS,
  MASS_UNITS,
  clone,
  fail,
  assert,
  text,
  positive,
  count,
  localDate,
  parseDate,
  weekDates,
  mealKey,
  validateRecipe,
  validateState,
  initialState,
  searchRecipes,
  shoppingList,
  formatAmount,
  weekStart,
  checkedKey,
  saveRecipe,
  toggleFavorite,
  deleteRecipe,
  addMeal,
  changeMeal,
  toggleShopping,
  newId,
};
