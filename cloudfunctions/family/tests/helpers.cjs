const { createService } = require("../service");
const { APPID, core } = require("../domain");
// Optimistic MVCC: every transaction has a snapshot, read-version validation and atomic commit.
// Unlike a serial callback mock this exercises retry paths under overlapping concurrent calls.
function memoryStore() {
  const docs = new Map();
  let conflicts = 0;
  return {
    docs,
    get conflicts() {
      return conflicts;
    },
    async transaction(callback) {
      for (let attempt = 0; attempt < 100; attempt++) {
        const snapshot = new Map(
          [...docs].map(([key, value]) => [key, core.clone(value)]),
        );
        const reads = new Map(),
          writes = new Map();
        const tx = {
          async get(collection, id) {
            const key = `${collection}/${id}`;
            const value = snapshot.get(key);
            reads.set(key, value ? value.revision : 0);
            await Promise.resolve();
            return value ? core.clone(value.data) : null;
          },
          async set(collection, id, data) {
            const key = `${collection}/${id}`;
            // Track write/write conflicts even when no prior get was necessary.
            if (!reads.has(key))
              reads.set(
                key,
                snapshot.has(key) ? snapshot.get(key).revision : 0,
              );
            writes.set(key, core.clone(data));
            await Promise.resolve();
          },
        };
        const result = await callback(tx);
        if (
          [...reads].some(
            ([key, revision]) => (docs.get(key)?.revision || 0) !== revision,
          )
        ) {
          conflicts++;
          continue;
        }
        for (const [key, data] of writes)
          docs.set(key, { revision: (docs.get(key)?.revision || 0) + 1, data });
        return result;
      }
      throw new Error("MVCC retry budget exhausted");
    },
  };
}
function fixture() {
  const store = memoryStore();
  let clock = Date.UTC(2026, 9, 19),
    sequence = 0;
  const service = createService(store, { now: () => clock });
  const call = (who, action, payload = {}, requestId) =>
    service.handle(
      {
        action,
        payload,
        requestId:
          requestId || `test_request_${String(++sequence).padStart(8, "0")}`,
      },
      { OPENID: who, APPID },
    );
  async function ok(who, action, payload, id) {
    const result = await call(who, action, payload, id);
    require("node:assert/strict").equal(
      result.ok,
      true,
      JSON.stringify(result),
    );
    return result.data;
  }
  async function family(who = "alice") {
    return (
      await ok(who, "household.create", {
        name: `${who}的家`,
        displayName: who,
      })
    ).householdId;
  }
  async function join(id, who = "bob", owner = "alice") {
    const invite = await ok(owner, "invite.create", { householdId: id });
    return ok(who, "household.join", { code: invite.code, displayName: who });
  }
  return {
    store,
    service,
    call,
    ok,
    family,
    join,
    advance: (ms) => {
      clock += ms;
    },
    now: () => clock,
  };
}
module.exports = { memoryStore, fixture };
