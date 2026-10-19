const core = require("../../utils/core");
const ui = require("../../utils/page");
Page({
  data: {
    recipes: [],
    categories: ["全部", ...core.CATEGORIES],
    category: "全部",
    query: "",
    onlyFavorites: false,
    onlyPrivate: false,
    total: 0,
    error: "",
  },
  onShow() {
    this.refresh();
  },
  refresh() {
    try {
      const state = ui.repository().load();
      const source = this.data.onlyPrivate
        ? state.recipes.filter((r) => r.origin !== "builtin")
        : state.recipes;
      this.setData({
        recipes: core
          .searchRecipes(
            source,
            this.data.query,
            this.data.category,
            this.data.onlyFavorites,
          )
          .map(ui.recipeView),
        total: state.recipes.length,
        error: "",
      });
    } catch (error) {
      this.setData({ recipes: [], error: error.message });
    }
  },
  search(event) {
    this.setData({ query: ui.value(event) });
    this.refresh();
  },
  clearSearch() {
    this.setData({ query: "" });
    this.refresh();
  },
  category(event) {
    this.setData({ category: event.currentTarget.dataset.category });
    this.refresh();
  },
  favorites() {
    this.setData({ onlyFavorites: !this.data.onlyFavorites });
    this.refresh();
  },
  privateRecipes() {
    this.setData({ onlyPrivate: !this.data.onlyPrivate });
    this.refresh();
  },
  add() {
    wx.navigateTo({ url: "/pages/edit/index" });
  },
  open(event) {
    wx.navigateTo({
      url: `/pages/detail/index?id=${encodeURIComponent(event.currentTarget.dataset.id)}`,
    });
  },
  favorite(event) {
    ui.attempt(() => {
      ui.repository().transact((state) =>
        core.toggleFavorite(state, event.currentTarget.dataset.id),
      );
      this.refresh();
    });
  },
  backup() {
    wx.switchTab({ url: "/pages/backup/index" });
  },
  onShareAppMessage() {
    return {
      title: "家常 · 好好吃饭，记录家的味道",
      path: "/pages/recipes/index",
    };
  },
});
