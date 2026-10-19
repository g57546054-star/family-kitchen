const core = require("../utils/core");
const MAX_BYTES = 1024 * 1024;
function byteLength(text) {
  return encodeURIComponent(text).replace(/%[A-F\d]{2}/gi, "x").length;
}
function parseJSON(raw) {
  core.assert(
    typeof raw === "string" && byteLength(raw) <= MAX_BYTES,
    "备份需为不超过1MB的 JSON 文本",
  );
  try {
    return JSON.parse(raw);
  } catch (_) {
    core.fail("备份不是有效的 JSON 文件");
  }
}
// Stable non-cryptographic import identifier; not an integrity/security signature.
function importId(raw) {
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i += 1)
    hash = Math.imul(hash ^ raw.charCodeAt(i), 16777619);
  return `web-${(hash >>> 0).toString(16)}`;
}
function migrateWeb(raw) {
  const source = parseJSON(raw);
  core.assert(
    source &&
      source.version === 1 &&
      Array.isArray(source.recipes) &&
      source.recipes.length <= 400,
    "需要网页导出的 v1 JSON 备份",
  );
  core.assert(
    source.plans &&
      typeof source.plans === "object" &&
      !Array.isArray(source.plans) &&
      Array.isArray(source.checked) &&
      source.checked.every((k) => typeof k === "string"),
    "旧网页备份的菜单或勾选无效",
  );
  const migrated = {
    version: 2,
    recipes: [],
    plans: {},
    checked: [],
    imports: [],
  };
  const idMap = new Map();
  source.recipes.forEach((recipe) => {
    core.assert(
      recipe &&
        typeof recipe.id === "string" &&
        /^[a-zA-Z0-9:_-]{1,120}$/.test(recipe.id) &&
        !idMap.has(recipe.id),
      "旧菜谱标识无效或重复",
    );
    const id = `web:${recipe.id}`;
    idMap.set(recipe.id, id);
    core.assert(Array.isArray(recipe.ingredients), "旧菜谱食材格式无效");
    migrated.recipes.push({
      id,
      name: recipe.name,
      category: recipe.category,
      minutes: recipe.minutes,
      servings: recipe.servings,
      favorite: recipe.favorite,
      origin: "imported",
      weightNote: "来自旧网页：非重量单位保持原样，称重并核对前不换算成克。",
      ingredients: recipe.ingredients.map((i) => ({
        name: i.name,
        amount: i.amount,
        unit: i.unit,
        needsReview: !core.MASS_UNITS.includes(i.unit),
        sourceMeasure: { amount: i.amount, unit: i.unit },
      })),
      steps: recipe.steps,
    });
  });
  Object.entries(source.plans).forEach(([key, meals]) => {
    const match = /^(\d{4}-\d{2}-\d{2}):(午餐|晚餐)$/.exec(key);
    core.assert(match, "旧菜单日期或餐次不正确");
    core.parseDate(match[1]);
    core.assert(Array.isArray(meals), "旧菜单格式无效");
    const merged = new Map();
    meals.forEach((meal) => {
      core.assert(
        meal && idMap.has(meal.recipeId) && core.count(meal.servings, 100),
        "旧菜单引用不存在的菜谱或人数不正确",
      );
      const id = idMap.get(meal.recipeId);
      merged.set(id, (merged.get(id) || 0) + meal.servings);
    });
    migrated.plans[key] = Array.from(merged, ([recipeId, servings]) => ({
      recipeId,
      servings,
    }));
  });
  core.validateState(migrated);
  return {
    state: migrated,
    id: importId(raw),
    pending: migrated.recipes.reduce(
      (n, r) => n + r.ingredients.filter((i) => i.needsReview).length,
      0,
    ),
  };
}
function previewWebImport(raw, current) {
  const result = migrateWeb(raw);
  core.assert(
    !current.imports.some((i) => i.id === result.id),
    "这份网页备份已经导入过，请勿重复导入",
  );
  core.assert(
    !result.state.recipes.some((r) =>
      current.recipes.some((existing) => existing.id === r.id),
    ),
    "已有同标识的网页菜谱，已停止导入以避免覆盖；可先备份后选择完整恢复",
  );
  const merged = core.clone(current);
  merged.recipes.push(...result.state.recipes);
  Object.entries(result.state.plans).forEach(([key, meals]) => {
    merged.plans[key] = [...(merged.plans[key] || []), ...meals];
  });
  merged.checked = []; // The original checks remain in the verbatim web backup.
  core.validateState(merged);
  return {
    id: result.id,
    pending: result.pending,
    recipeCount: result.state.recipes.length,
    mealCount: Object.values(result.state.plans).reduce(
      (n, meals) => n + meals.length,
      0,
    ),
    state: merged,
  };
}
function nativeBackup(state) {
  core.validateState(state);
  return {
    format: "family-kitchen-native-backup",
    version: 2,
    exportedAt: new Date().toISOString(),
    state: core.clone(state),
  };
}
function parseNativeBackup(raw) {
  const value = parseJSON(raw);
  core.assert(
    value &&
      value.format === "family-kitchen-native-backup" &&
      value.version === 2,
    "这不是原生小程序 v2 备份",
  );
  return core.validateState(value.state);
}
module.exports = {
  MAX_BYTES,
  byteLength,
  parseJSON,
  importId,
  migrateWeb,
  previewWebImport,
  nativeBackup,
  parseNativeBackup,
};
