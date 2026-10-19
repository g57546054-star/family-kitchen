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
    const result = callback();
    return result && typeof result.then === "function"
      ? result.catch(report)
      : result;
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
  return core.weekDates(offset).map((date, i) => ({
    value: core.localDate(date),
    label: `${core.DAYS[i]} ${date.getMonth() + 1}/${date.getDate()}`,
  }));
}
function command(action, payload, localOperation, after = () => {}) {
  const provider = getApp().familyProvider;
  if (!provider || provider.status().mode === "local") {
    const result = repository().transact(localOperation);
    after(result);
    return result;
  }
  return provider.command(action, payload).then((result) => {
    after(result);
    return result;
  });
}
function version() {
  const p = getApp().familyProvider;
  return p && p.status().mode === "cloud" ? p.expected() : 0;
}
function attachSync(page) {
  const provider = getApp().familyProvider;
  if (!provider) return;
  const update = () => {
    const status = provider.status();
    page.setData({
      syncText:
        status.mode === "cloud"
          ? status.error ||
            (status.busy
              ? "正在保存到家庭…"
              : `家庭共享 · ${status.lastSync || "待刷新"}`)
          : status.error || "本地模式 · 数据仅在此设备",
    });
    if (!status.busy && page.refresh) page.refresh();
  };
  page.detachSync = provider.subscribe(update);
  update();
  const poll = () => {
    if (provider.status().mode === "cloud" && !provider.status().busy)
      provider.pull().catch(() => {});
  };
  poll();
  page.syncTimer = setInterval(poll, 20000);
}
function detachSync(page) {
  if (page.detachSync) page.detachSync();
  page.detachSync = null;
  if (page.syncTimer) clearInterval(page.syncTimer);
  page.syncTimer = null;
}
module.exports = {
  command,
  version,
  attachSync,
  detachSync,
  repository,
  report,
  attempt,
  toast,
  confirm,
  value,
  recipeView,
  dateViews,
};
