const ui = require("../../utils/page");
const provider = () => getApp().familyProvider;
Page({
  data: {
    mode: "local",
    connected: false,
    busy: false,
    error: "",
    pending: false,
    name: "",
    displayName: "",
    code: "",
    familyName: "",
    role: "",
    members: [],
    invites: [],
    previewText: "",
    localPreview: "",
    canActivate: false,
    canImport: false,
    inviteCode: "",
    inviteId: "",
    inviteExpiry: "",
    lastSync: "",
  },
  onShow() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = provider().subscribe(() => this.refresh());
    this.refresh();
    if (provider().status().mode === "cloud")
      ui.attempt(() => this.refreshCloud());
    this.pollTimer = setInterval(() => {
      if (provider().status().mode === "cloud" && !provider().status().busy)
        this.refreshCloud().catch(() => {});
    }, 20000);
  },
  onHide() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = null;
  },
  onUnload() {
    this.onHide();
  },
  field(event) {
    this.setData({ [event.currentTarget.dataset.field]: ui.value(event) });
  },
  refresh() {
    const status = provider().status();
    const household = status.household;
    let localPreview;
    try {
      localPreview = this.describe(getApp().localRepository.load());
    } catch (error) {
      localPreview = error.message;
    }
    this.setData({
      mode: status.mode,
      connected: status.connected,
      busy: status.busy,
      pending: status.pending,
      error: status.error,
      lastSync: status.lastSync,
      members: status.members,
      familyName: household ? household.name : "",
      role: household ? household.role : "",
      invites: (
        (provider().snapshot() && provider().snapshot().invites) ||
        []
      ).map((i) => ({
        ...i,
        active: !i.revokedAt && !i.usedCount && i.expiresAt > Date.now(),
        status: i.revokedAt
          ? "已撤销"
          : i.usedCount
            ? "已使用"
            : i.expiresAt <= Date.now()
              ? "已过期"
              : "有效邀请",
        expiryText: new Date(i.expiresAt).toLocaleString(),
      })),
      canImport:
        status.mode === "cloud" &&
        household.role === "admin" &&
        household.dataVersion === 0 &&
        status.members.length === 1,
      localPreview,
    });
  },
  describe(state) {
    return `${state.recipes.length}道菜谱 · ${Object.values(state.plans).reduce((n, meals) => n + meals.length, 0)}条点菜 · ${state.checked.length}项勾选\n菜谱：${state.recipes
      .slice(0, 6)
      .map((r) => r.name)
      .join(
        "、",
      )}${state.recipes.length > 6 ? "等" : ""}\n待核对单位：${state.recipes.reduce((n, r) => n + r.ingredients.filter((i) => i.needsReview).length, 0)}项（保持原单位）`;
  },
  login() {
    ui.confirm(
      "连接家庭服务",
      "将通过微信云函数获取可信身份，仅在你主动选择后连接。请先按部署说明配置服务；本地数据不会上传。",
      () =>
        ui.attempt(async () => {
          await provider().connect();
          if (provider().status().householdId) await this.preview();
          else ui.toast("身份已确认，可创建或加入家庭");
        }),
    );
  },
  async preview() {
    const result = await provider().pull(true);
    this.setData({
      previewText: `${result.household.name}：${this.describe(result.state)}。切换后显示家庭数据；原本地数据独立保留。`,
      canActivate: true,
    });
  },
  create() {
    ui.confirm(
      "创建家庭",
      "将创建共享家庭，内置12道参考菜谱。你将成为管理员；不会自动上传本地菜谱和菜单。",
      () =>
        ui.attempt(async () => {
          await provider().manage("household.create", {
            name: this.data.name.trim(),
            displayName: this.data.displayName.trim(),
          });
          await this.preview();
        }),
    );
  },
  join() {
    ui.confirm(
      "加入家庭",
      "此邀请码只能使用一次。加入后家人可看到你的家庭昵称；本地菜谱不会自动上传。",
      () =>
        ui.attempt(async () => {
          await provider().manage("household.join", {
            code: this.data.code.trim(),
            displayName: this.data.displayName.trim(),
          });
          this.setData({ code: "" });
          await this.preview();
        }),
    );
  },
  activate() {
    ui.confirm(
      "备份并切换到家庭共享",
      `${this.data.previewText}\n本地数据：${this.data.localPreview}。先生成本地备份，成功后才切换。收藏在家庭中共同显示。`,
      () => {
        provider().activate();
        this.setData({ canActivate: false });
        ui.toast("已切换，建议到备份页导出备份文件");
      },
    );
  },
  local() {
    ui.confirm(
      "切回本地模式",
      "将显示此设备原有本地数据，停止共享刷新；家庭成员关系仍保留。再次使用家庭需手动登录、预览和切换。",
      () => {
        provider().useLocal();
        this.setData({ canActivate: false });
      },
    );
  },
  async refreshCloud() {
    await provider().pull();
    this.refresh();
  },
  sync() {
    ui.attempt(async () => {
      if (provider().status().mode === "cloud") await this.refreshCloud();
      else await this.preview();
    });
  },
  invite() {
    ui.attempt(async () => {
      const h = provider().status().household;
      const result = await provider().manage("invite.create", {
        householdId: h.id,
      });
      this.showInvite(result);
      await this.refreshCloud();
    });
  },
  showInvite(result) {
    if (!result.code) return;
    this.setData({
      inviteCode: result.code,
      inviteId: result.inviteId,
      inviteExpiry: new Date(result.expiresAt).toLocaleString(),
    });
  },
  copyInvite() {
    wx.setClipboardData({ data: this.data.inviteCode });
  },
  revoke(event) {
    const id = event.currentTarget.dataset.id || this.data.inviteId;
    ui.confirm("撤销邀请码", "撤销后即刻失效，已加入的成员不受影响。", () =>
      ui.attempt(async () => {
        await provider().manage("invite.revoke", {
          householdId: provider().status().household.id,
          inviteId: id,
        });
        if (id === this.data.inviteId)
          this.setData({ inviteCode: "", inviteId: "" });
        await this.refreshCloud();
      }),
    );
  },
  remove(event) {
    ui.confirm(
      "移除家庭成员",
      "对方将不能继续读取或修改家庭数据；已经查看的数据无法远程从对方设备抹除。",
      () =>
        ui.attempt(async () => {
          await provider().manage("member.remove", {
            householdId: provider().status().household.id,
            memberId: event.currentTarget.dataset.uid,
            expectedVersion: provider().expected(),
          });
          await this.refreshCloud();
        }),
    );
  },
  leave() {
    ui.confirm(
      "退出家庭",
      "共享数据保留在家庭中。退出后需新邀请码才能重新加入；你的本地数据保持独立。",
      () =>
        ui.attempt(async () => {
          await provider().manage("household.leave", {
            householdId: provider().status().household.id,
            expectedVersion: provider().expected(),
          });
          this.setData({ canActivate: false });
        }),
    );
  },
  importLocal() {
    ui.attempt(() => {
      const state = getApp().localRepository.load();
      const version = provider().expected();
      ui.confirm(
        "预览并备份后上传本地数据",
        `本地：${this.describe(state)}\n家庭：${this.describe(provider().load())}\n仅允许管理员向未编辑且没有其他成员的新家庭导入。将用本地快照替换家庭初始数据，保留原单位及待核对标记；先保存本地与家庭两份备份。`,
        () =>
          ui.attempt(async () => {
            await provider().importLocal(state, version);
            this.refresh();
            ui.toast("导入成功，备份可在备份页导出");
          }),
      );
    });
  },
  retry() {
    ui.attempt(async () => {
      const result = await provider().retry();
      this.showInvite(result);
      if (
        provider().status().mode === "local" &&
        provider().status().householdId
      )
        await this.preview();
    });
  },
  backup() {
    wx.switchTab({ url: "/pages/backup/index" });
  },
});
