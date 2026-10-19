const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const core = require("../utils/core");
const { migrateWeb } = require("../services/migration");
const plain = (value) => JSON.parse(JSON.stringify(value));
function originalWeb(anchor) {
  const filename = path.join(__dirname, "../../src/data.ts");
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};
  class FixedDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [anchor.getTime()]));
    }
  }
  vm.runInNewContext(code, { exports, Date: FixedDate });
  return exports;
}
test("native date helpers retain the original web week boundary and date keys", () => {
  for (const anchor of [
    new Date(2026, 9, 19),
    new Date(2027, 0, 3),
    new Date(2024, 1, 29),
  ]) {
    const web = originalWeb(anchor);
    for (const offset of [-1, 0, 1])
      assert.deepEqual(
        plain(web.weekDates(offset).map(web.localDate)),
        core.weekDates(offset, anchor).map(core.localDate),
      );
    assert.equal(web.mealKey(anchor, "晚餐"), core.mealKey(anchor, "晚餐"));
  }
});
test("actual web sample data migrates and produces identical counts, volumes and scaling", () => {
  const anchor = new Date(2026, 9, 19);
  const web = originalWeb(anchor);
  const state = plain(web.initialState());
  state.plans = {
    "2026-10-19:晚餐": [
      { recipeId: "tomato-egg", servings: 3 },
      { recipeId: "fried-rice", servings: 4 },
    ],
    "2026-10-21:午餐": [{ recipeId: "broccoli-shrimp", servings: 2 }],
  };
  const migrated = migrateWeb(JSON.stringify(state)).state;
  const expected = plain(web.shoppingList(state, web.weekDates()));
  const actual = core
    .shoppingList(migrated, core.weekDates(0, anchor))
    .map(({ needsReview, ...rest }) => rest);
  assert.deepEqual(actual, expected);
  for (const amount of [0.004, 0.25, 3, 33.3333])
    assert.equal(core.formatAmount(amount), web.formatAmount(amount));
});
