const core = require("../../utils/core");
const migration = require("../../services/migration");
const ui = require("../../utils/page");
Page({
  data: {
    raw: "",
    filename: "",
    preview: null,
    backups: [],
    error: "",
    stats: "",
    cloudEnabled: false,
  },
  onShow() {
    this.refresh();
  },
  refresh() {
    try {
      const repository = ui.repository();
      const backups = repository.listBackups();
      this.setData({ backups });
      const state = repository.load();
      this.setData({
        stats: `${state.recipes.length} 道菜谱 · ${state.imports.length} 次网页迁移`,
        error: "",
      });
    } catch (error) {
      this.setData({ error: error.message });
    }
  },
  input(event) {
    this.pendingRaw = "";
    this.setData({ raw: ui.value(event), preview: null, filename: "" });
  },
  chooseFile() {
    if (typeof wx.chooseMessageFile !== "function")
      return ui.toast("此环境不支持选文件，可在下方粘贴JSON");
    wx.chooseMessageFile({
      count: 1,
      type: "file",
      extension: ["json"],
      success: (result) =>
        ui.attempt(() => {
          const file = result.tempFiles[0];
          core.assert(
            file && file.size <= migration.MAX_BYTES,
            "请选择不超过1MB的 JSON 文件",
          );
          wx.getFileSystemManager().readFile({
            filePath: file.path,
            encoding: "utf8",
            success: (data) => {
              this.pendingRaw = data.data;
              this.setData({ raw: "", filename: file.name, preview: null });
              this.preview();
            },
            fail: () =>
              ui.report(new Error("文件读取失败，请重选文件或粘贴JSON")),
          });
        }),
      fail: (error) => {
        if (!String(error.errMsg).includes("cancel"))
          ui.report(new Error("无法选择聊天文件，可改为粘贴JSON"));
      },
    });
  },
  preview() {
    ui.attempt(() => {
      const raw = this.pendingRaw || this.data.raw;
      const value = migration.parseJSON(raw);
      let preview;
      if (value && value.version === 1) {
        const result = ui.repository().previewWeb(raw);
        preview = {
          kind: "web",
          recipeCount: result.recipeCount,
          mealCount: result.mealCount,
          pending: result.pending,
        };
      } else {
        const state = migration.parseNativeBackup(raw);
        preview = {
          kind: "native",
          recipeCount: state.recipes.length,
          mealCount: Object.values(state.plans).reduce(
            (n, meals) => n + meals.length,
            0,
          ),
          pending: state.recipes.reduce(
            (n, r) => n + r.ingredients.filter((i) => i.needsReview).length,
            0,
          ),
        };
      }
      this.setData({ preview });
    });
  },
  importConfirmed() {
    if (!this.data.preview) return;
    const web = this.data.preview.kind === "web";
    ui.confirm(
      web ? "确认迁移旧网页数据" : "确认恢复小程序备份",
      web
        ? "会保留现有菜谱，合并旧菜谱和菜单；自动备份原文件及导入前数据，并重置采购勾选。非重量单位原样保留。"
        : "恢复将替换当前菜谱、收藏、菜单和勾选。替换前会自动保存当前原始数据。请确认已导出重要备份。",
      () => {
        const raw = this.pendingRaw || this.data.raw;
        if (web)
          ui.repository().importWeb(
            raw,
            this.data.filename || "粘贴的网页备份.json",
          );
        else ui.repository().restoreNative(raw);
        this.pendingRaw = "";
        this.setData({ raw: "", filename: "", preview: null });
        this.refresh();
        ui.toast(web ? "迁移完成，原单位已保留" : "备份恢复完成");
      },
    );
  },
  shareText(filename, raw) {
    ui.attempt(() => {
      const filePath = `${wx.env.USER_DATA_PATH}/${filename}`;
      wx.getFileSystemManager().writeFile({
        filePath,
        data: raw,
        encoding: "utf8",
        success: () => {
          if (typeof wx.shareFileMessage !== "function")
            return ui.report(
              new Error(
                "当前环境无法发送文件，请使用“复制备份JSON”保存到安全位置",
              ),
            );
          wx.shareFileMessage({
            filePath,
            fileName: filename,
            fail: (error) => {
              if (!String(error.errMsg).includes("cancel"))
                ui.report(
                  new Error(
                    "文件发送未完成，开发者工具可能不支持，请真机尝试或复制备份JSON",
                  ),
                );
            },
          });
        },
        fail: () =>
          ui.report(
            new Error("备份文件写入失败，原始数据未改变，可尝试复制备份JSON"),
          ),
      });
    });
  },
  exportNative() {
    ui.attempt(() =>
      this.shareText(
        `家常小程序备份-${Date.now()}.json`,
        ui.repository().exportNative(),
      ),
    );
  },
  copyNative() {
    ui.attempt(() =>
      wx.setClipboardData({ data: ui.repository().exportNative() }),
    );
  },
  exportRaw() {
    ui.attempt(() =>
      this.shareText(
        `家常原始数据-${Date.now()}.json`,
        ui.repository().exportRaw(),
      ),
    );
  },
  exportOriginal(event) {
    ui.attempt(() =>
      this.shareText(
        `家常原始备份-${Date.now()}.json`,
        ui.repository().readBackup(event.currentTarget.dataset.key),
      ),
    );
  },
  copyOriginal(event) {
    ui.attempt(() =>
      wx.setClipboardData({
        data: ui.repository().readBackup(event.currentTarget.dataset.key),
      }),
    );
  },
});
