// Deployed copy of the existing, tested native calculation module; parity is enforced in CI.
const core = require("./shared/utils/core");
const crypto = require("node:crypto");
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const MAX_BYTES = 650 * 1024;
const APPID = "wxb104c5308c2ebb48";
function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}
function need(condition, code = "INVALID_INPUT", message = "请求参数不正确") {
  if (!condition) fail(code, message);
}
function fields(object, allowed) {
  need(object && typeof object === "object" && !Array.isArray(object));
  need(Object.keys(object).every((key) => allowed.includes(key)));
}
function cleanState(value) {
  core.validateState(value);
  // Reject arbitrary metadata/prototype-shaped properties instead of persisting client objects.
  fields(value, ["version", "recipes", "plans", "checked", "imports"]);
  value.recipes.forEach((recipe) => {
    fields(recipe, [
      "id",
      "name",
      "category",
      "servings",
      "minutes",
      "origin",
      "favorite",
      "ingredients",
      "steps",
      "weightNote",
    ]);
    recipe.ingredients.forEach((item) => {
      fields(item, ["name", "amount", "unit", "needsReview", "sourceMeasure"]);
      if (item.sourceMeasure) fields(item.sourceMeasure, ["amount", "unit"]);
    });
  });
  Object.values(value.plans).forEach((meals) =>
    meals.forEach((meal) => fields(meal, ["recipeId", "servings"])),
  );
  need(
    Buffer.byteLength(JSON.stringify(value), "utf8") <= MAX_BYTES,
    "TOO_LARGE",
    "家庭数据超过650KB，请先备份并精简",
  );
  const state = core.clone(value);
  state.imports = []; // Local backup pointers stay on the original device.
  return state;
}
function apply(state, action, p, household, checks) {
  const expected = () =>
    need(
      p.expectedVersion === household.version,
      "CONFLICT",
      "家庭数据已更新，请刷新后重试",
    );
  let next;
  let menuChanged = true;
  switch (action) {
    case "recipe.save":
      fields(p, ["householdId", "recipe", "expectedVersion"]);
      expected();
      next = core.saveRecipe(state, p.recipe);
      break;
    case "recipe.delete":
      fields(p, ["householdId", "recipeId", "expectedVersion"]);
      expected();
      next = core.deleteRecipe(state, p.recipeId);
      break;
    case "recipe.favorite": {
      fields(p, ["householdId", "recipeId", "favorite", "expectedVersion"]);
      expected();
      need(typeof p.favorite === "boolean");
      next = core.clone(state);
      const recipe = next.recipes.find((r) => r.id === p.recipeId);
      need(recipe, "INVALID_INPUT", "菜谱不存在");
      recipe.favorite = p.favorite;
      menuChanged = false;
      break;
    }
    case "plan.add":
      fields(p, ["householdId", "date", "slot", "recipeId", "servings"]);
      next = core.addMeal(state, p.date, p.slot, p.recipeId, p.servings);
      break;
    case "plan.adjust": {
      fields(p, ["householdId", "date", "slot", "recipeId", "delta"]);
      need(p.delta === 1 || p.delta === -1);
      const meal = (state.plans[core.mealKey(p.date, p.slot)] || []).find(
        (m) => m.recipeId === p.recipeId,
      );
      need(
        meal && meal.servings + p.delta >= 1,
        "CONFLICT",
        "菜单已变化或至少需1人份，请刷新",
      );
      next = core.changeMeal(
        state,
        p.date,
        p.slot,
        p.recipeId,
        meal.servings + p.delta,
      );
      break;
    }
    case "plan.remove":
      fields(p, ["householdId", "date", "slot", "recipeId", "expectedVersion"]);
      expected();
      next = core.changeMeal(state, p.date, p.slot, p.recipeId, 0);
      break;
    case "shopping.set": {
      fields(p, [
        "householdId",
        "start",
        "key",
        "checked",
        "menuVersion",
        "checkVersion",
      ]);
      need(typeof p.checked === "boolean" && core.text(p.key, 250));
      need(p.start === core.weekStart(p.start));
      need(
        p.menuVersion === household.menuVersion,
        "CONFLICT",
        "菜单或食材已更新，请刷新采购清单",
      );
      const key = core.checkedKey(p.start, p.key);
      const record = checks.versions.find((item) => item.key === key);
      need(
        p.checkVersion === (record ? record.version : 0),
        "CONFLICT",
        "该食材的勾选已被家人修改，请刷新",
      );
      next = core.toggleShopping(
        state,
        core.weekDates(0, core.parseDate(p.start)),
        p.key,
        p.checked,
      );
      if (record) record.version++;
      else checks.versions.push({ key, version: 1 });
      need(
        Buffer.byteLength(JSON.stringify(checks.versions)) <= 128 * 1024,
        "TOO_LARGE",
        "勾选记录较多，请刷新并整理菜单",
      );
      menuChanged = false;
      break;
    }
    case "shopping.clear":
      fields(p, ["householdId", "start", "expectedVersion"]);
      expected();
      need(p.start === core.weekStart(p.start));
      next = core.clone(state);
      next.checked = next.checked.filter((k) => !k.startsWith(`${p.start}:`));
      // Bump menu fence to invalidate all in-flight check operations, including unchecked items.
      break;
    case "migration.import":
      fields(p, ["householdId", "state", "expectedVersion"]);
      expected();
      need(
        household.dataVersion === 0 && household.memberIds.length === 1,
        "CONFLICT",
        "只能向尚未编辑且只有管理员的新家庭导入；请勿覆盖已有家庭",
      );
      next = cleanState(p.state);
      break;
    default:
      fail("INVALID_INPUT", "不支持的操作");
  }
  return { state: cleanState(next), menuChanged };
}
module.exports = {
  core,
  hash,
  need,
  fail,
  fields,
  cleanState,
  apply,
  APPID,
  MAX_BYTES,
};
