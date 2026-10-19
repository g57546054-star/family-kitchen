const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createDocumentStore } = require("../store");
test("document adapter uses transaction doc.get/set({data}), propagates missing and database errors, strips _id", async () => {
  const calls = [];
  let retry;
  const transaction = {
    collection(name) {
      return {
        doc(id) {
          return {
            async get() {
              calls.push(["get", name, id]);
              return { data: id === "absent" ? null : { _id: id, value: 1 } };
            },
            async set(options) {
              calls.push(["set", name, id, options]);
            },
          };
        },
      };
    },
  };
  const store = createDocumentStore({
    async runTransaction(fn, count) {
      retry = count;
      return fn(transaction);
    },
  });
  await store.transaction(async (tx) => {
    assert.equal(await tx.get("users", "absent"), null);
    const value = await tx.get("users", "test");
    await tx.set("users", "test", value);
  });
  assert.equal(retry, 5);
  assert.deepEqual(calls[2], ["set", "users", "test", { data: { value: 1 } }]);
  const broken = createDocumentStore({
    runTransaction: () => Promise.reject(new Error("offline")),
  });
  await assert.rejects(
    broken.transaction(() => {}),
    /offline/,
  );
});
test("actual cloud entrypoint trusts only getWXContext and configures missing documents explicitly", async () => {
  let initialized, databaseOptions, received;
  const cloud = {
    DYNAMIC_CURRENT_ENV: "runtime-env",
    init: (value) => {
      initialized = value;
    },
    database: (options) => {
      databaseOptions = options;
      return {};
    },
    getWXContext: () => ({ APPID: "runtime-app", OPENID: "runtime-user" }),
  };
  const module = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../index.js"), "utf8"),
    {
      exports: module.exports,
      require(name) {
        if (name === "wx-server-sdk") return cloud;
        if (name === "./store") return { createDocumentStore: (db) => db };
        if (name === "./service")
          return {
            createService: () => ({
              handle: (event, context) => {
                received = { event, context };
                return { ok: true };
              },
            }),
          };
        throw new Error(name);
      },
    },
  );
  await module.exports.main({
    OPENID: "forged",
    context: { OPENID: "forged" },
  });
  assert.equal(received.context.OPENID, "runtime-user");
  assert.equal(received.context.APPID, "runtime-app");
  assert.equal(databaseOptions.throwOnNotFound, false);
  assert.equal(initialized.env, "runtime-env");
});
test("deployed domain and seed files are byte-identical to existing native logic; no calculation fork", () => {
  for (const file of ["utils/core.js", "data/recipes.js"])
    assert.equal(
      fs.readFileSync(path.join(__dirname, "../shared", file), "utf8"),
      fs.readFileSync(
        path.join(__dirname, "../../../miniprogram", file),
        "utf8",
      ),
    );
});
