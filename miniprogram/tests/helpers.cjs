const core = require("../utils/core");
const { createRepository } = require("../services/repository");
function memoryStorage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  const writes = [];
  return {
    entries,
    writes,
    failKey: null,
    failAfter: Infinity,
    get(key) {
      return entries.has(key) ? entries.get(key) : "";
    },
    set(key, value) {
      if (this.failKey === key || writes.length >= this.failAfter)
        throw new Error("模拟存储空间不足");
      entries.set(key, value);
      writes.push({ key, value });
    },
    keys() {
      return [...entries.keys()];
    },
  };
}
function legacyState() {
  return {
    version: 1,
    recipes: [
      {
        id: "tomato-egg",
        name: "旧版番茄炒蛋",
        category: "素菜",
        minutes: 15,
        servings: 2,
        art: "tomato",
        favorite: true,
        ingredients: [
          { name: "番茄", amount: 2, unit: "个" },
          { name: "鸡蛋", amount: 3, unit: "个" },
          { name: "食用油", amount: 15, unit: "毫升" },
          { name: "盐", amount: 2, unit: "克" },
        ],
        steps: ["清洗切块。", "鸡蛋炒熟。", "合炒调味。"],
      },
    ],
    plans: { "2026-10-19:晚餐": [{ recipeId: "tomato-egg", servings: 4 }] },
    checked: ['2026-10-19:["番茄","个"]'],
  };
}
function loadPage(name, repository = createRepository(memoryStorage())) {
  const messages = [];
  const navigation = [];
  const app = { repository };
  const api = {
    showModal(options) {
      messages.push(options);
      if (options.success) options.success({ confirm: true });
    },
    showToast(options) {
      messages.push(options);
    },
    navigateTo(options) {
      navigation.push(options.url);
    },
    redirectTo(options) {
      navigation.push(options.url);
    },
    switchTab(options) {
      navigation.push(options.url);
    },
    navigateBack() {
      navigation.push("back");
    },
    setClipboardData(options) {
      api.clipboard = options.data;
    },
  };
  global.wx = api;
  global.getApp = () => app;
  let definition;
  global.Page = (value) => {
    definition = value;
  };
  const path = require.resolve(`../pages/${name}/index.js`);
  delete require.cache[path];
  require(path);
  delete global.Page;
  const page = {
    ...definition,
    data: core.clone(definition.data),
    setData(patch) {
      Object.assign(this.data, patch);
    },
  };
  return { page, app, api, messages, navigation, repository };
}
function event(value, dataset = {}) {
  return { detail: { value }, currentTarget: { dataset } };
}
module.exports = { memoryStorage, legacyState, loadPage, event };
