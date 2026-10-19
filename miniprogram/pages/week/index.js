const core = require("../../utils/core");
const ui = require("../../utils/page");
Page({
  data: {
    offset: 0,
    days: [],
    recipes: [],
    label: "",
    count: 0,
    showPicker: false,
    recipeIndex: 0,
    chosenDate: "",
    chosenSlot: "",
    servings: "2",
    error: "",
  },
  onShow() {
    const selected = getApp().selectedWeekDate;
    if (selected) {
      const diff =
        (core.parseDate(core.weekStart(selected)).getTime() -
          core.parseDate(core.weekStart(new Date())).getTime()) /
        (7 * 86400000);
      this.setData({ offset: Math.round(diff) });
      getApp().selectedWeekDate = "";
    }
    this.refresh();
  },
  refresh() {
    try {
      const state = ui.repository().load();
      const dates = core.weekDates(this.data.offset);
      let count = 0;
      const days = dates.map((date, index) => ({
        date: core.localDate(date),
        label: core.DAYS[index],
        shortDate: `${date.getMonth() + 1}/${date.getDate()}`,
        today: core.localDate(date) === core.localDate(new Date()),
        slots: core.SLOTS.map((slot) => {
          const meals = (state.plans[core.mealKey(date, slot)] || []).map(
            (meal) => ({
              ...meal,
              name: state.recipes.find((r) => r.id === meal.recipeId).name,
            }),
          );
          count += meals.length;
          return { slot, meals };
        }),
      }));
      this.setData({
        days,
        recipes: state.recipes.map((r) => ({
          id: r.id,
          name: r.name,
          servings: r.servings,
        })),
        label: `${core.localDate(dates[0])} — ${core.localDate(dates[6])}`,
        count,
        error: "",
      });
    } catch (error) {
      this.setData({ days: [], error: error.message });
    }
  },
  previous() {
    if (this.data.offset > -520) {
      this.setData({ offset: this.data.offset - 1 });
      this.refresh();
    }
  },
  next() {
    if (this.data.offset < 520) {
      this.setData({ offset: this.data.offset + 1 });
      this.refresh();
    }
  },
  current() {
    this.setData({ offset: 0 });
    this.refresh();
  },
  add(event) {
    if (!this.data.recipes.length) return ui.toast("请先添加一道菜谱");
    this.setData({
      chosenDate: event.currentTarget.dataset.date,
      chosenSlot: event.currentTarget.dataset.slot,
      recipeIndex: 0,
      servings: String(this.data.recipes[0].servings),
      showPicker: true,
    });
  },
  pickerVisible(event) {
    this.setData({ showPicker: event.detail.visible });
  },
  closePicker() {
    this.setData({ showPicker: false });
  },
  chooseRecipe(event) {
    const index = Number(ui.value(event));
    this.setData({
      recipeIndex: index,
      servings: String(this.data.recipes[index].servings),
    });
  },
  servings(event) {
    this.setData({ servings: ui.value(event) });
  },
  save() {
    ui.attempt(() => {
      const recipe = this.data.recipes[this.data.recipeIndex];
      ui.repository().transact((s) =>
        core.addMeal(
          s,
          this.data.chosenDate,
          this.data.chosenSlot,
          recipe.id,
          Number(this.data.servings),
        ),
      );
      this.setData({ showPicker: false });
      this.refresh();
      ui.toast("点菜成功，采购清单已更新");
    });
  },
  adjust(event) {
    ui.attempt(() => {
      const d = event.currentTarget.dataset;
      const servings = Number(d.servings) + Number(d.delta);
      core.assert(servings >= 1, "至少1人份，需要删除请点击移除");
      ui.repository().transact((s) =>
        core.changeMeal(s, d.date, d.slot, d.id, servings),
      );
      this.refresh();
    });
  },
  remove(event) {
    const d = event.currentTarget.dataset;
    ui.confirm("移除这道菜", "采购清单将重新计算，该周采购勾选会重置。", () => {
      ui.repository().transact((s) =>
        core.changeMeal(s, d.date, d.slot, d.id, 0),
      );
      this.refresh();
    });
  },
  open(event) {
    wx.navigateTo({
      url: `/pages/detail/index?id=${encodeURIComponent(event.currentTarget.dataset.id)}`,
    });
  },
  shopping() {
    getApp().shoppingWeekOffset = this.data.offset;
    wx.switchTab({ url: "/pages/shopping/index" });
  },
});
