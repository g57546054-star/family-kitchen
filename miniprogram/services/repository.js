const core = require("../utils/core");
const migration = require("./migration");
const STORAGE_KEY = "family-kitchen:mini:v2";
const BACKUP_PREFIX = "family-kitchen:mini:backup:";

function wxStorage(api) {
  return {
    get: (key) => api.getStorageSync(key),
    set: (key, value) => api.setStorageSync(key, value),
    keys: () => api.getStorageInfoSync().keys,
  };
}
function createRepository(storage) {
  function load() {
    const raw = storage.get(STORAGE_KEY);
    if (
      (raw === "" || raw === undefined) &&
      !storage.keys().includes(STORAGE_KEY)
    )
      return core.initialState();
    try {
      return core.clone(
        core.validateState(
          typeof raw === "string" ? migration.parseJSON(raw) : raw,
        ),
      );
    } catch (_) {
      core.fail(
        "本地数据损坏或版本不兼容。请先在备份页导出原始数据，再恢复备份；不会自动覆盖。",
        "STORAGE_CORRUPT",
      );
    }
  }
  function save(state) {
    core.validateState(state);
    const raw = JSON.stringify(state);
    core.assert(
      migration.byteLength(raw) <= migration.MAX_BYTES,
      "数据超过1MB，请先导出备份并精简记录",
    );
    storage.set(STORAGE_KEY, raw); // A single active-key write: no success state before this succeeds.
    return core.clone(state);
  }
  function transact(operation) {
    return save(operation(load()));
  }
  function preserve(kind, content, filename) {
    const key = `${BACKUP_PREFIX}${kind}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    storage.set(
      key,
      JSON.stringify({
        kind,
        filename: filename || kind,
        createdAt: new Date().toISOString(),
        raw: content,
      }),
    );
    return key;
  }
  function importWeb(raw, filename) {
    const current = load();
    const preview = migration.previewWebImport(raw, current);
    // Both originals must be backed up successfully BEFORE changing the active key.
    const backupKey = preserve("web-v1", raw, filename);
    preserve(
      "before-import",
      JSON.stringify(migration.nativeBackup(current)),
      "导入前小程序备份.json",
    );
    preview.state.imports.push({ id: preview.id, backupKey });
    return save(preview.state);
  }
  function restoreNative(raw) {
    const next = migration.parseNativeBackup(raw);
    const old = storage.get(STORAGE_KEY);
    if (storage.keys().includes(STORAGE_KEY))
      preserve(
        "before-restore",
        typeof old === "string"
          ? old
          : JSON.stringify(old === undefined ? null : old),
        "恢复前原始数据.json",
      );
    // A restored file may point to backup keys from another device: originals are not silently claimed to exist.
    return save(next);
  }
  function listBackups() {
    return storage
      .keys()
      .filter((k) => k.startsWith(BACKUP_PREFIX))
      .map((key) => {
        try {
          const data = JSON.parse(storage.get(key));
          core.assert(
            data &&
              typeof data.raw === "string" &&
              core.text(data.createdAt, 50) &&
              core.text(data.kind, 50) &&
              core.text(data.filename, 500),
            "备份元数据损坏",
          );
          return {
            key,
            kind: data.kind,
            filename: data.filename,
            createdAt: data.createdAt,
          };
        } catch (_) {
          return {
            key,
            kind: "unreadable",
            filename: "无法读取的备份",
            createdAt: "",
          };
        }
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  function readBackup(key) {
    core.assert(key.startsWith(BACKUP_PREFIX), "备份标识不正确");
    const value = JSON.parse(storage.get(key));
    core.assert(typeof value.raw === "string", "备份内容损坏");
    return value.raw;
  }
  return {
    load,
    preserve,
    backup: (kind, filename) =>
      preserve(kind, JSON.stringify(migration.nativeBackup(load())), filename),
    save,
    transact,
    importWeb,
    restoreNative,
    listBackups,
    readBackup,
    previewWeb: (raw) => migration.previewWebImport(raw, load()),
    exportNative: () => JSON.stringify(migration.nativeBackup(load()), null, 2),
    exportRaw: () => {
      const value = storage.get(STORAGE_KEY);
      return typeof value === "string"
        ? value
        : JSON.stringify(value === undefined ? null : value);
    },
  };
}
module.exports = { STORAGE_KEY, BACKUP_PREFIX, wxStorage, createRepository };
