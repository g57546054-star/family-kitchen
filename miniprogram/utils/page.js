const core = require("./core");
function repository() {
  return getApp().repository;
}
function report(error) {
  wx.showModal({
    title: "操作未完成",
    content: error.message || "本地存储失败，请先导出备份后重试",
    showCancel: false,
  });
}
function attempt(callback) {
  try {
    return callback();
  } catch (error) {
    report(error);
    return undefined;
  }
}
function toast(title) {
  wx.showToast({ title, icon: "none" });
}
function confirm(title, content, action) {
  wx.showModal({
    title,
    content,
    success: (result) => {
      if (result.confirm) attempt(action);
    },
  });
}
function value(event) {
  return event.detail.value === undefined ? "" : event.detail.value;
}
function recipeView(recipe) {
  return {
    ...recipe,
    ingredientText: recipe.ingredients
      .slice(0, 4)
      .map((i) => i.name)
      .join(" · "),
    pendingCount: recipe.ingredients.filter((i) => i.needsReview).length,
  };
}
function dateViews(offset) {
  return core
    .weekDates(offset)
    .map((date, i) => ({
      value: core.localDate(date),
      label: `${core.DAYS[i]} ${date.getMonth() + 1}/${date.getDate()}`,
    }));
}
module.exports = {
  repository,
  report,
  attempt,
  toast,
  confirm,
  value,
  recipeView,
  dateViews,
};
