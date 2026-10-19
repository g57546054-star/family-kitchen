const cloud = require("wx-server-sdk");
const { createDocumentStore } = require("./store");
const { createService } = require("./service");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const service = createService(
  createDocumentStore(cloud.database({ throwOnNotFound: false })),
);
exports.main = async (event) => {
  // The caller's data/context argument can NEVER supply identity. Only the signed runtime context is trusted.
  const context = cloud.getWXContext();
  return service.handle(event, {
    OPENID: context.OPENID,
    APPID: context.APPID,
  });
};
