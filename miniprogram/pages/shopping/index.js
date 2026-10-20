const core = require("../../utils/core");
const ui = require("../../utils/page");
Page({
  data: {
    offset: 0,
    items: [],
    pendingItems: [],
    label: "",
    total: 0,
    completed: 0,
    error: "",
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
    if (Number.isInteger(getApp().shoppingWeekOffset)) {
      this.setData({ offset: getApp().shoppingWeekOffset });
      getApp().shoppingWeekOffset = undefined;
    }
    this.refresh();
  },
  refresh() {
    try {
      const state = ui.repository().load();
      const dates = core.weekDates(this.data.offset);
      const start = core.localDate(dates[0]);
      const items = core.shoppingList(state, dates).map((item) => ({
        ...item,
        amountText: core.formatAmount(item.amount),
        checked: state.checked.includes(core.checkedKey(start, item.key)),
      }));
      this.setData({
        items: items.filter((i) => !i.needsReview),
        pendingItems: items.filter((i) => i.needsReview),
        total: items.length,
        completed: items.filter((i) => i.checked).length,
        label: `${start} — ${core.localDate(dates[6])}`,
        error: "",
      });
    } catch (error) {
      this.setData({ items: [], pendingItems: [], error: error.message });
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
  toggle(event) {
    return ui.attempt(() => {
      const start = core.localDate(core.weekDates(this.data.offset)[0]);
      const key = event.currentTarget.dataset.key;
      const provider = getApp().familyProvider;
      const payload = {
        start,
        key,
        checked: event.detail.checked === true,
        menuVersion: provider ? provider.menuVersion() : 0,
        checkVersion: provider
          ? provider.checkVersion(core.checkedKey(start, key))
          : 0,
      };
      return ui.command(
        "shopping.set",
        payload,
        (s) =>
          core.toggleShopping(
            s,
            core.weekDates(this.data.offset),
            key,
            payload.checked,
          ),
        () => this.refresh(),
      );
    });
  },
  clear() {
    ui.confirm(
      "取消本周全部勾选",
      "食材数量保持不变，只取消采购完成标记。",
      () => {
        const start = core.localDate(core.weekDates(this.data.offset)[0]);
        return ui.command(
          "shopping.clear",
          { start, expectedVersion: ui.version() },
          (s) => ({
            ...s,
            checked: s.checked.filter((k) => !k.startsWith(`${start}:`)),
          }),
          () => this.refresh(),
        );
      },
    );
  },
  copy() {
    const text =
      `${this.data.label} 采购清单\n` +
      [...this.data.items, ...this.data.pendingItems]
        .map(
          (i) =>
            `${i.checked ? "☑" : "☐"} ${i.name} ${i.amountText} ${i.unit}${i.needsReview ? "（原单位，待核对）" : ""}`,
        )
        .join("\n");
    wx.setClipboardData({ data: text });
  },
  week() {
    getApp().selectedWeekDate = core.localDate(
      core.weekDates(this.data.offset)[0],
    );
    wx.switchTab({ url: "/pages/week/index" });
  },
});
