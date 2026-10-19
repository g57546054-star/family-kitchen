const core = require("../../utils/core");
const ui = require("../../utils/page");
const { decodeRecipeId } = require("../../utils/routes");
const BASE_UNITS = [
  "克",
  "千克",
  "个",
  "颗",
  "毫升",
  "瓣",
  "根",
  "盒",
  "碗",
  "勺",
];
function ingredientForm(i) {
  return {
    ...i,
    rowKey: core.newId(),
    amount: String(i.amount),
    unitOptions: Array.from(new Set([...BASE_UNITS, i.unit])),
    reviewRequired: false,
    weightConfirmed: false,
  };
}
Page({
  data: {
    name: "",
    categoryIndex: 0,
    categories: core.CATEGORIES,
    minutes: "20",
    servings: "2",
    ingredients: [
      ingredientForm({ name: "", amount: "", unit: "克", needsReview: false }),
    ],
    stepsText: "",
    error: "",
    copying: false,
    ready: false,
  },
  onLoad(options = {}) {
    ui.attempt(() => {
      if (options.id !== undefined) {
        const id = decodeRecipeId(options.id);
        const recipe = ui
          .repository()
          .load()
          .recipes.find((r) => r.id === id);
        core.assert(recipe, "菜谱不存在");
        this.original = core.clone(recipe);
        this.setData({
          name:
            recipe.origin === "builtin"
              ? `${recipe.name.slice(0, 54)}（私房）`
              : recipe.name,
          categoryIndex: core.CATEGORIES.indexOf(recipe.category),
          minutes: String(recipe.minutes),
          servings: String(recipe.servings),
          ingredients: recipe.ingredients.map(ingredientForm),
          stepsText: recipe.steps.join("\n"),
          copying: recipe.origin === "builtin",
        });
      }
      this.editorMode = getApp().familyProvider
        ? getApp().familyProvider.status().mode
        : "local";
      this.originalVersion = ui.version();
      this.setData({ ready: true });
    });
  },
  field(event) {
    this.setData({ [event.currentTarget.dataset.field]: ui.value(event) });
  },
  category(event) {
    this.setData({ categoryIndex: Number(ui.value(event)) });
  },
  ingredient(event) {
    const ingredients = core.clone(this.data.ingredients);
    ingredients[Number(event.currentTarget.dataset.index)][
      event.currentTarget.dataset.field
    ] = ui.value(event);
    this.setData({ ingredients });
  },
  unit(event) {
    const ingredients = core.clone(this.data.ingredients);
    const item = ingredients[Number(event.currentTarget.dataset.index)];
    const next = item.unitOptions[Number(ui.value(event))];
    if (next !== item.unit) {
      const crossedDimension =
        !core.MASS_UNITS.includes(item.unit) || !core.MASS_UNITS.includes(next);
      if (crossedDimension) {
        if (!item.sourceMeasure && item.amount)
          item.sourceMeasure = { amount: Number(item.amount), unit: item.unit };
        item.amount = ""; // NEVER relabel a legacy count/volume as grams.
        item.reviewRequired = core.MASS_UNITS.includes(next);
        item.weightConfirmed = false;
      } else
        item.amount = String(
          Number(item.amount) * (item.unit === "千克" ? 1000 : 0.001),
        );
      item.unit = next;
      item.needsReview = !core.MASS_UNITS.includes(next);
    }
    this.setData({ ingredients });
  },
  confirmWeight(event) {
    const ingredients = core.clone(this.data.ingredients);
    ingredients[Number(event.currentTarget.dataset.index)].weightConfirmed =
      event.detail.checked === true;
    this.setData({ ingredients });
  },
  addIngredient() {
    if (this.data.ingredients.length >= 60) return ui.toast("最多60项食材");
    this.setData({
      ingredients: [
        ...this.data.ingredients,
        ingredientForm({
          name: "",
          amount: "",
          unit: "克",
          needsReview: false,
        }),
      ],
    });
  },
  removeIngredient(event) {
    if (this.data.ingredients.length > 1)
      this.setData({
        ingredients: this.data.ingredients.filter(
          (_, i) => i !== Number(event.currentTarget.dataset.index),
        ),
      });
  },
  save() {
    try {
      core.assert(this.data.ready, "菜谱尚未加载，请返回重试");
      const currentMode = getApp().familyProvider
        ? getApp().familyProvider.status().mode
        : "local";
      core.assert(
        currentMode === this.editorMode,
        "存储模式已变化，请保留输入后返回重新打开，避免写入另一份数据",
      );
      this.data.ingredients.forEach((i) =>
        core.assert(
          !i.reviewRequired || i.weightConfirmed,
          "原单位改为克重后，请重新填写实际重量并勾选已称重核对",
        ),
      );
      const existing = this.original && this.original.origin !== "builtin";
      const recipe = {
        id: existing ? this.original.id : core.newId(),
        name: this.data.name.trim(),
        category: core.CATEGORIES[this.data.categoryIndex],
        minutes: Number(this.data.minutes),
        servings: Number(this.data.servings),
        origin: existing ? this.original.origin : "private",
        favorite: existing ? this.original.favorite : false,
        weightNote: existing
          ? this.original.weightNote
          : "私人配方：请按可食部分称重，液体不按体积直接换算成克。",
        ingredients: this.data.ingredients.map((i) => ({
          name: i.name.trim(),
          amount: Number(i.amount),
          unit: i.unit,
          needsReview: !core.MASS_UNITS.includes(i.unit),
          ...(i.sourceMeasure ? { sourceMeasure: i.sourceMeasure } : {}),
        })),
        steps: this.data.stepsText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      };
      const saved = () => {
        this.saved = true;
        ui.toast("私人菜谱已保存");
        wx.redirectTo({
          url: `/pages/detail/index?id=${encodeURIComponent(recipe.id)}`,
        });
      };
      const result = ui.command(
        "recipe.save",
        { recipe, expectedVersion: this.originalVersion },
        (s) => core.saveRecipe(s, recipe),
        saved,
      );
      if (result && result.catch)
        return result.catch((error) =>
          this.setData({
            error:
              error.code === "CONFLICT"
                ? "家人已修改数据，表单仍保留。请先复制修改内容，再返回重新打开菜谱后编辑。"
                : error.message,
          }),
        );
    } catch (error) {
      this.setData({ error: error.message || "保存失败，原数据未更改" });
    }
  },
});
