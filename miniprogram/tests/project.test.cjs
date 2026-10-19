const test = require("node:test");
const assert = require("node:assert/strict");
const { checkProject } = require("../scripts/check-project.cjs");
test("real project config, native page resources, TDesign resources and all event bindings resolve", () => {
  const result = checkProject();
  assert.equal(result.pages, 6);
  assert.ok(result.bindings >= 50);
  assert.equal(result.officialWechatCompilation, "NOT_RUN");
});
