/**
 * Phase 2B boundary, asynchronous to accommodate remote revisions and conflicts.
 * Future implementation: getCapabilities(), pullFamily({familyId}),
 * pushFamily({familyId, state, expectedRevision}). A revision mismatch must reject,
 * never silently overwrite. No wx.cloud calls, environment IDs, or credentials here.
 */
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
module.exports = { createDisabledFamilyProvider };
