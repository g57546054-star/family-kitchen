const core = require("../utils/core");
const config = require("./cloud-config");
function createDisabledFamilyProvider() {
  const unavailable = () =>
    Promise.reject(
      Object.assign(new Error("家庭共享尚未启用，本阶段仅本地存储"), {
        code: "FAMILY_SHARING_DISABLED",
      }),
    );
  return {
    getCapabilities: () => ({
      enabled: false,
      storage: "local",
      revisioned: false,
    }),
    pullFamily: unavailable,
    pushFamily: unavailable,
  };
}
function requestId() {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
}
// No initialization at module import or app startup. Only connect(), invoked by the family page, opts in.
function createWeChatTransport(api) {
  let initialized = false;
  return async (event) => {
    core.assert(
      api.cloud && api.cloud.callFunction,
      "当前微信版本不支持云开发，请升级微信；仍可使用本地模式",
    );
    if (!initialized) {
      api.cloud.init({ env: config.env, traceUser: false });
      initialized = true;
    }
    const response = await api.cloud.callFunction({
      name: config.functionName,
      data: event,
      config: { env: config.env },
    });
    core.assert(
      response && response.result && typeof response.result.ok === "boolean",
      "云函数响应无效，请检查手动部署步骤",
    );
    return response.result;
  };
}
function createFamilyProvider({ localRepository, transport, storage = null }) {
  let mode = "local",
    session = null,
    snapshot = null,
    candidate = null;
  let busy = false,
    pulling = null,
    pending = null,
    error = "",
    lastSync = "";
  const listeners = new Set();
  const pendingKey = () =>
    `family-kitchen:cloud-pending:${config.env}:${session.uid}`;
  const persistPending = (value) => {
    if (storage && session) storage.set(pendingKey(), JSON.stringify(value));
  };
  const clearPending = () => {
    persistPending(null);
    pending = null;
  };
  const notify = () => listeners.forEach((fn) => fn());
  function status() {
    return {
      mode,
      connected: !!session,
      householdId: session && session.householdId,
      busy,
      pending: !!pending,
      error,
      lastSync,
      household: snapshot && snapshot.household,
      members: (snapshot && snapshot.members) || [],
    };
  }
  async function call(action, payload, id = requestId()) {
    let response;
    try {
      response = await transport({ action, payload, requestId: id });
    } catch (_) {
      throw Object.assign(
        new Error(
          "网络或家庭服务不可用。请检查云函数部署与网络后重试；未自动覆盖本地数据",
        ),
        { code: "NETWORK" },
      );
    }
    if (!response.ok)
      throw Object.assign(new Error(response.error.message), {
        code: response.error.code,
        definitive: response.error.code !== "INTERNAL",
      });
    return response.data;
  }
  function setError(e) {
    error = e.message;
    notify();
  }
  async function connect() {
    core.assert(!busy, "请等待当前操作完成");
    session = await call("session", {});
    if (storage) {
      const saved = storage.get(pendingKey());
      if (saved && saved !== "null") {
        const parsed = JSON.parse(saved);
        core.assert(
          parsed &&
            typeof parsed.id === "string" &&
            typeof parsed.action === "string" &&
            parsed.payload,
          "待确认请求损坏，请先导出本地原始数据并联系管理员",
        );
        pending = parsed;
      }
    }
    error = "";
    notify();
    return session;
  }
  async function pull(force = false) {
    if (pulling) {
      if (!force) return pulling;
      try {
        await pulling;
      } catch (_) {
        /* Explicit refresh still gets its own attempt. */
      }
      return pull(true);
    }
    core.assert(session && session.householdId, "请先登录并创建或加入家庭");
    const id = session.householdId;
    pulling = (async () => {
      try {
        const result = await call("pull", {
          householdId: id,
          ...(snapshot && !force
            ? { knownVersion: snapshot.household.version }
            : {}),
        });
        if (result.state) {
          core.validateState(result.state);
          candidate = core.clone(result);
          if (mode === "cloud") snapshot = core.clone(result);
        }
        error = "";
        lastSync = new Date().toLocaleTimeString();
        notify();
        return result.state ? result : snapshot || candidate;
      } catch (e) {
        if (e.code === "FORBIDDEN") {
          snapshot = null;
          candidate = null;
          mode = "local";
          session.householdId = null;
        }
        setError(e);
        throw e;
      } finally {
        pulling = null;
      }
    })();
    return pulling;
  }
  async function send(action, payload, id) {
    try {
      const result = await call(action, payload, id);
      clearPending();
      if (
        result.householdId &&
        ["household.create", "household.join"].includes(action)
      )
        session.householdId = result.householdId;
      if (action === "household.leave") {
        useLocal();
        session.householdId = null;
        candidate = null;
        snapshot = null;
      }
      error = "";
      notify();
      return result;
    } catch (e) {
      if (e.definitive) clearPending();
      setError(e);
      throw e;
    }
  }
  async function refreshSaved(result) {
    try {
      await pull(true);
      return result;
    } catch (_) {
      setError(
        new Error(
          "操作已保存到家庭，但刷新失败。请手动刷新，不要重复提交相同操作。",
        ),
      );
      return { ...result, refreshPending: true };
    }
  }
  async function manage(action, payload = {}, syncAfter = false) {
    core.assert(session, "请先点击微信身份登录");
    core.assert(!busy && !pending, "请等待当前操作完成，或先重试未确认的操作");
    const next = { action, payload: core.clone(payload), id: requestId() };
    persistPending(next); // Fail before dispatch if the replay record cannot be saved.
    pending = next;
    busy = true;
    notify();
    try {
      const result = await send(action, pending.payload, pending.id);
      return syncAfter ? await refreshSaved(result) : result;
    } finally {
      busy = false;
      notify();
    }
  }
  async function command(action, payload) {
    core.assert(mode === "cloud" && snapshot, "请先切换到家庭共享模式");
    try {
      return await manage(
        action,
        { ...payload, householdId: snapshot.household.id },
        true,
      );
    } catch (e) {
      if (e.definitive) {
        try {
          await pull(true);
        } catch (_) {
          /* pull handles revoked memberships */
        }
      }
      setError(e);
      throw e;
    }
  }
  function activate() {
    core.assert(!busy && !pending, "请先处理待确认操作");
    core.assert(candidate && candidate.state, "请先刷新家庭数据并预览");
    localRepository.backup("before-cloud", "切换家庭共享前本地备份.json"); // Must succeed before mode changes.
    snapshot = core.clone(candidate);
    mode = "cloud";
    error = "";
    notify();
  }
  function useLocal() {
    mode = "local";
    snapshot = null;
    candidate = null;
    error = "";
    notify();
  }
  async function retry() {
    core.assert(session && pending && !busy, "请先登录并确认待重试操作");
    busy = true;
    notify();
    try {
      const result = await send(pending.action, pending.payload, pending.id);
      return session.householdId ? await refreshSaved(result) : result;
    } finally {
      busy = false;
      notify();
    }
  }
  return {
    status,
    connect,
    pull,
    manage,
    command,
    activate,
    useLocal,
    retry,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    snapshot: () => snapshot && core.clone(snapshot),
    load() {
      core.assert(mode === "cloud" && snapshot, "家庭数据尚未加载");
      return core.clone(snapshot.state);
    },
    expected() {
      core.assert(snapshot, "请刷新家庭数据");
      return snapshot.household.version;
    },
    menuVersion: () => snapshot && snapshot.household.menuVersion,
    checkVersion(key) {
      const row =
        snapshot && snapshot.checkVersions.find((item) => item.key === key);
      return row ? row.version : 0;
    },
    async importLocal(state, expectedVersion) {
      core.validateState(state);
      core.assert(
        snapshot && snapshot.household.version === expectedVersion,
        "家庭数据已变化，请重新预览",
      );
      localRepository.backup("before-cloud-import", "上传家庭前本地备份.json");
      localRepository.preserve(
        "cloud-before-import",
        JSON.stringify(require("./migration").nativeBackup(snapshot.state)),
        "上传前家庭备份.json",
      );
      return command("migration.import", {
        state: core.clone(state),
        expectedVersion,
      });
    },
  };
}
function createModeRepository(local, family) {
  const result = {};
  for (const [name, fn] of Object.entries(local)) {
    if (typeof fn !== "function") continue;
    result[name] = (...args) => {
      if (family.status().mode === "cloud") {
        if (name === "load") return family.load();
        if (
          [
            "save",
            "transact",
            "importWeb",
            "restoreNative",
            "previewWeb",
          ].includes(name)
        )
          core.fail(
            "共享模式请通过家庭操作写入；恢复本地备份请先切回本地模式",
            "CLOUD_WRITE_REQUIRED",
          );
        if (name === "exportNative")
          return JSON.stringify(
            require("./migration").nativeBackup(family.load()),
            null,
            2,
          );
      }
      return fn(...args);
    };
  }
  return result;
}
module.exports = {
  createDisabledFamilyProvider,
  createWeChatTransport,
  createFamilyProvider,
  createModeRepository,
};
