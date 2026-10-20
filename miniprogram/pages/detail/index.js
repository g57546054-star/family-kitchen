const core = require("../../utils/core");
const ui = require("../../utils/page");
const { decodeRecipeId } = require("../../utils/routes");
Page({
  data: {
    recipe: null,
    error: "",
    showPlan: false,
    planDate: core.localDate(new Date()),
    slots: core.SLOTS,
    slotIndex: 1,
    planServings: "2",
  },
  onLoad(options = {}) {
    try {
      this.recipeId = decodeRecipeId(options.id);
    } catch (error) {
      this.recipeId = null;
      this.setData({ recipe: null, error: error.message });
    }
    this.setData({ showPlan: options.plan === "1" });
  },
  onHide() {
    ui.detachSync(this);
  },
  onUnload() {
    ui.detachSync(this);
  },
  onShow() {
    ui.detachSync(this);
    ui.attachSync(this);
    this.refresh();
  },
  refresh() {
    if (!this.recipeId) return;
    try {
      const recipe = ui
        .repository()
        .load()
        .recipes.find((r) => r.id === this.recipeId);
      core.assert(recipe, "这道菜谱不存在或已被删除");
      this.setData({
        recipe: {
          ...ui.recipeView(recipe),
          ingredients: recipe.ingredients.map((i, index) => ({
            ...i,
            rowKey: `ingredient-${index}`,
            amountText: core.formatAmount(i.amount),
          })),
          stepRows: recipe.steps.map((step, index) => ({
            key: `step-${index}`,
            text: step,
            number: index + 1,
          })),
        },
        error: "",
      });
      if (!this.initialized) {
        this.setData({ planServings: String(recipe.servings) });
        this.initialized = true;
      }
    } catch (error) {
      this.setData({ error: error.message });
    }
  },
  favorite() {
    return ui.attempt(() => {
      return ui.command(
        "recipe.favorite",
        {
          recipeId: this.recipeId,
          favorite: !this.data.recipe.favorite,
          expectedVersion: ui.version(),
        },
        (s) => core.toggleFavorite(s, this.recipeId),
        () => this.refresh(),
      );
    });
  },
  edit() {
    wx.navigateTo({
      url: `/pages/edit/index?id=${encodeURIComponent(this.recipeId)}`,
    });
  },
  remove() {
    ui.confirm(
      "删除私人菜谱",
      "这道菜会从所有菜单中移除，采购勾选将重置。操作不可撤销。",
      () => {
        return ui.command(
          "recipe.delete",
          { recipeId: this.recipeId, expectedVersion: ui.version() },
          (s) => core.deleteRecipe(s, this.recipeId),
          () => wx.navigateBack(),
        );
      },
    );
  },
  togglePlan() {
    this.setData({ showPlan: !this.data.showPlan });
  },
  date(event) {
    this.setData({ planDate: ui.value(event) });
  },
  slot(event) {
    this.setData({ slotIndex: Number(ui.value(event)) });
  },
  servings(event) {
    this.setData({ planServings: ui.value(event) });
  },
  savePlan() {
    return ui.attempt(() => {
      const payload = {
        date: this.data.planDate,
        slot: core.SLOTS[this.data.slotIndex],
        recipeId: this.recipeId,
        servings: Number(this.data.planServings),
      };
      return ui.command(
        "plan.add",
        payload,
        (s) =>
          core.addMeal(
            s,
            payload.date,
            payload.slot,
            payload.recipeId,
            payload.servings,
          ),
        () => {
          getApp().selectedWeekDate = this.data.planDate;
          ui.toast("已加入菜单，清单已更新");
          wx.switchTab({ url: "/pages/week/index" });
        },
      );
    });
  },
  onShareAppMessage() {
    // Personal recipes are local: a shared route must not pretend the recipient has them.
    return { title: "家常 · 记录你的私房味道", path: "/pages/recipes/index" };
  },
});
