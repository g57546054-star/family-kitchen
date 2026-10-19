const crypto = require("node:crypto");
const {
  core,
  hash,
  need,
  fields,
  cleanState,
  apply,
  APPID,
} = require("./domain");
const ACTIONS = [
  "session",
  "pull",
  "household.create",
  "invite.create",
  "invite.revoke",
  "household.join",
  "member.remove",
  "household.leave",
  "recipe.save",
  "recipe.delete",
  "recipe.favorite",
  "plan.add",
  "plan.adjust",
  "plan.remove",
  "shopping.set",
  "shopping.clear",
  "migration.import",
];
const WRITES = new Set(ACTIONS.filter((a) => !["session", "pull"].includes(a)));
const SAFE_CODES = new Set([
  "INVALID_INPUT",
  "INVALID_DATA",
  "TOO_LARGE",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NO_HOUSEHOLD",
  "CONFLICT",
  "INVITE_INVALID",
  "ALREADY_MEMBER",
  "RATE_LIMIT",
  "BUILTIN_READONLY",
]);
function createService(
  store,
  {
    now = Date.now,
    random = (bytes) => crypto.randomBytes(bytes).toString("hex"),
  } = {},
) {
  async function rate(uid, action) {
    const tick = Math.floor(now() / 60000);
    await store.transaction(async (tx) => {
      const previous = await tx.get("rate_limits", uid);
      const item =
        previous && previous.tick === tick
          ? previous
          : { tick, calls: 0, joins: 0 };
      need(
        item.calls < 60 && (action !== "household.join" || item.joins < 5),
        "RATE_LIMIT",
        "操作过于频繁，请一分钟后重试",
      );
      item.calls++;
      if (action === "household.join") item.joins++;
      await tx.set("rate_limits", uid, { ...item, expiresAt: now() + 120000 });
    });
  }
  async function member(tx, uid, id) {
    need(typeof id === "string" && /^hh_[a-f0-9]{24}$/.test(id));
    const [user, membership, household] = await Promise.all([
      tx.get("users", uid),
      tx.get("members", `${id}_${uid}`),
      tx.get("households", id),
    ]);
    need(
      user &&
        user.householdId === id &&
        membership &&
        membership.active &&
        household &&
        household.memberIds.includes(uid),
      "FORBIDDEN",
      "你不是该家庭的有效成员，请返回家庭页",
    );
    return { household, membership };
  }
  const admin = (m) =>
    need(m.role === "admin", "FORBIDDEN", "此操作仅家庭管理员可执行");
  const stamp = (uid, version) => ({
    updatedAt: now(),
    updatedBy: uid,
    version,
  });
  async function snapshot(tx, household) {
    const id = household.id;
    const [recipes, plans, checks] = await Promise.all(
      ["recipes", "plans", "shopping_checks"].map((c) => tx.get(c, id)),
    );
    need(
      recipes &&
        plans &&
        checks &&
        [recipes, plans, checks].every(
          (d) => d.version === household.dataVersion,
        ),
      "CONFLICT",
      "家庭数据版本不一致，请稍后刷新",
    );
    return {
      state: {
        version: 2,
        recipes: recipes.items,
        plans: plans.entries,
        checked: checks.keys,
        imports: [],
      },
      checks,
    };
  }
  async function saveState(tx, household, state, checks, uid) {
    cleanState(state);
    const audit = {
      householdId: household.id,
      ...stamp(uid, household.dataVersion),
    };
    await tx.set("recipes", household.id, { ...audit, items: state.recipes });
    await tx.set("plans", household.id, { ...audit, entries: state.plans });
    await tx.set("shopping_checks", household.id, {
      ...audit,
      keys: state.checked,
      versions: checks.versions,
    });
  }
  async function execute(event, context) {
    need(
      context &&
        context.APPID === APPID &&
        typeof context.OPENID === "string" &&
        context.OPENID.length > 0,
      "UNAUTHENTICATED",
      "请使用正式小程序的微信身份访问",
    );
    fields(event, ["action", "payload", "requestId"]);
    need(
      ACTIONS.includes(event.action) &&
        typeof event.requestId === "string" &&
        /^[a-zA-Z0-9_-]{16,100}$/.test(event.requestId),
    );
    const { action, payload: p } = event;
    fields(p, [
      "householdId",
      "knownVersion",
      "name",
      "displayName",
      "inviteId",
      "code",
      "memberId",
      "expectedVersion",
      "recipe",
      "recipeId",
      "favorite",
      "date",
      "slot",
      "servings",
      "delta",
      "start",
      "key",
      "checked",
      "menuVersion",
      "checkVersion",
      "state",
    ]);
    need(
      Buffer.byteLength(JSON.stringify(event), "utf8") < 720 * 1024,
      "TOO_LARGE",
      "请求内容过大",
    );
    const uid = hash(context.OPENID).slice(0, 32);
    await rate(uid, action); // Separate committed transaction: failed guesses also consume the quota.
    const requestKey = hash(`${uid}:${event.requestId}`);
    const digest = hash(JSON.stringify({ action, p }));
    // Values generated outside transaction callbacks stay stable if the SDK retries the callback.
    const familyId = `hh_${random(12)}`;
    const inviteCode = random(6).toUpperCase();
    const inviteId = hash(inviteCode);
    return store.transaction(async (tx) => {
      let household, membership;
      const leaveReplay =
        action === "household.leave"
          ? await tx.get("operations", requestKey)
          : null;
      if (leaveReplay) {
        need(
          leaveReplay.digest === digest,
          "CONFLICT",
          "请求编号已用于另一操作",
        );
        // A departed member may confirm only their own old leave result, never read family data.
        need(
          leaveReplay.uid === uid && leaveReplay.result.removed === uid,
          "FORBIDDEN",
          "不能查看此操作",
        );
        return { ...leaveReplay.result, replayed: true };
      }
      if (!["session", "household.create", "household.join"].includes(action)) {
        ({ household, membership } = await member(tx, uid, p.householdId));
      }
      const previous = WRITES.has(action)
        ? await tx.get("operations", requestKey)
        : null;
      if (previous) {
        need(previous.digest === digest, "CONFLICT", "请求编号已用于另一操作");
        // Recheck current membership even for create/join replays (removed users get no old result).
        if (!household) await member(tx, uid, previous.householdId);
        return { ...previous.result, replayed: true };
      }
      let result;
      if (action === "session") {
        fields(p, []);
        const user = await tx.get("users", uid);
        result = { uid, householdId: (user && user.householdId) || null };
      } else if (action === "household.create") {
        fields(p, ["name", "displayName"]);
        need(core.text(p.name, 40) && core.text(p.displayName, 24));
        const user = await tx.get("users", uid);
        need(
          !user || !user.householdId,
          "ALREADY_MEMBER",
          "请先处理当前家庭成员关系",
        );
        need(
          !(await tx.get("households", familyId)),
          "CONFLICT",
          "家庭编号冲突，请重试",
        );
        household = {
          id: familyId,
          name: p.name.trim(),
          memberIds: [uid],
          inviteIds: [],
          version: 1,
          dataVersion: 0,
          menuVersion: 0,
          createdAt: now(),
          createdBy: uid,
          ...stamp(uid, 1),
        };
        await tx.set("households", familyId, household);
        await tx.set("users", uid, { householdId: familyId, ...stamp(uid, 1) });
        await tx.set("members", `${familyId}_${uid}`, {
          householdId: familyId,
          uid,
          name: p.displayName.trim(),
          role: "admin",
          active: true,
          joinedAt: now(),
          ...stamp(uid, 1),
        });
        await saveState(
          tx,
          household,
          core.initialState(),
          { versions: [] },
          uid,
        );
        result = { householdId: familyId, version: 1 };
      } else if (action === "household.join") {
        fields(p, ["code", "displayName"]);
        // Use one generic error for missing, expired, used, or revoked invites.
        need(
          typeof p.code === "string" && /^[A-Fa-f0-9]{12}$/.test(p.code.trim()),
          "INVITE_INVALID",
          "邀请码无效、已使用、已撤销或已过期",
        );
        need(core.text(p.displayName, 24));
        const tokenId = hash(p.code.trim().toUpperCase());
        const invite = await tx.get("invites", tokenId);
        need(
          invite &&
            !invite.revokedAt &&
            invite.expiresAt > now() &&
            invite.usedCount < invite.maxUses,
          "INVITE_INVALID",
          "邀请码无效、已使用、已撤销或已过期",
        );
        // Issuer must still be an active admin of the same household.
        const issuer = await member(tx, invite.createdBy, invite.householdId);
        admin(issuer.membership);
        household = issuer.household;
        const user = await tx.get("users", uid);
        need(
          !user || !user.householdId,
          "ALREADY_MEMBER",
          "你已加入家庭，请勿重复加入",
        );
        need(
          household.memberIds.length < 20,
          "CONFLICT",
          "家庭最多支持20位成员",
        );
        const oldMember = await tx.get("members", `${household.id}_${uid}`);
        household.memberIds.push(uid);
        household.version++;
        Object.assign(household, stamp(uid, household.version));
        await tx.set("households", household.id, household);
        await tx.set("users", uid, {
          householdId: household.id,
          ...stamp(uid, 1),
        });
        await tx.set("members", `${household.id}_${uid}`, {
          householdId: household.id,
          uid,
          name: p.displayName.trim(),
          role: "member",
          active: true,
          joinedAt: now(),
          ...stamp(uid, ((oldMember && oldMember.version) || 0) + 1),
        });
        await tx.set("invites", tokenId, {
          ...invite,
          usedCount: invite.usedCount + 1,
          usedBy: uid,
          usedAt: now(),
        });
        result = { householdId: household.id, version: household.version };
      } else if (action === "pull") {
        fields(p, ["householdId", "knownVersion"]);
        const meta = {
          id: household.id,
          name: household.name,
          version: household.version,
          dataVersion: household.dataVersion,
          menuVersion: household.menuVersion,
          role: membership.role,
          uid,
        };
        if (p.knownVersion === household.version)
          return { unchanged: true, household: meta };
        const { state, checks } = await snapshot(tx, household);
        const members = await Promise.all(
          household.memberIds.map((id) =>
            tx.get("members", `${household.id}_${id}`),
          ),
        );
        const invites =
          membership.role === "admin"
            ? await Promise.all(
                (household.inviteIds || []).map(async (id) => ({
                  id,
                  ...(await tx.get("invites", id)),
                })),
              )
            : [];
        return {
          household: meta,
          state,
          invites: invites.map((i) => ({
            id: i.id,
            expiresAt: i.expiresAt,
            usedCount: i.usedCount,
            revokedAt: i.revokedAt,
          })),
          checkVersions: checks.versions,
          members: members.map((m) => ({
            uid: m.uid,
            name: m.name,
            role: m.role,
            joinedAt: m.joinedAt,
          })),
        };
      } else if (action === "invite.create") {
        fields(p, ["householdId"]);
        admin(membership);
        const priorInvites = await Promise.all(
          (household.inviteIds || []).map(async (id) => ({
            id,
            ...(await tx.get("invites", id)),
          })),
        );
        household.inviteIds = priorInvites
          .filter((i) => i.expiresAt > now() && !i.revokedAt && i.usedCount < 1)
          .map((i) => i.id);
        need(
          household.inviteIds.length < 10,
          "RATE_LIMIT",
          "最多保留10个有效邀请，请先撤销旧邀请",
        );
        need(
          !(await tx.get("invites", inviteId)),
          "CONFLICT",
          "邀请码生成冲突，请重试",
        );
        household.inviteIds.push(inviteId);
        household.version++;
        Object.assign(household, stamp(uid, household.version));
        await tx.set("households", household.id, household);
        await tx.set("invites", inviteId, {
          householdId: household.id,
          createdBy: uid,
          createdAt: now(),
          expiresAt: now() + 30 * 60000,
          maxUses: 1,
          usedCount: 0,
          revokedAt: null,
        });
        // Plaintext exists only in response/idempotency record, never in invite lookup documents.
        result = {
          householdId: household.id,
          inviteId,
          code: inviteCode,
          expiresAt: now() + 30 * 60000,
        };
      } else if (action === "invite.revoke") {
        fields(p, ["householdId", "inviteId"]);
        admin(membership);
        need(
          typeof p.inviteId === "string" && /^[a-f0-9]{64}$/.test(p.inviteId),
        );
        const invite = await tx.get("invites", p.inviteId);
        need(
          invite && invite.householdId === household.id,
          "FORBIDDEN",
          "不能撤销其他家庭的邀请码",
        );
        await tx.set("invites", p.inviteId, {
          ...invite,
          revokedAt: now(),
          revokedBy: uid,
        });
        household.version++;
        Object.assign(household, stamp(uid, household.version));
        await tx.set("households", household.id, household);
        result = { householdId: household.id, revoked: true };
      } else if (action === "member.remove" || action === "household.leave") {
        fields(
          p,
          action === "member.remove"
            ? ["householdId", "memberId", "expectedVersion"]
            : ["householdId", "expectedVersion"],
        );
        if (action === "member.remove") admin(membership);
        need(
          p.expectedVersion === household.version,
          "CONFLICT",
          "成员关系已变化，请刷新",
        );
        const target = action === "household.leave" ? uid : p.memberId;
        need(typeof target === "string" && /^[a-f0-9]{32}$/.test(target));
        const targetMember = await tx.get(
          "members",
          `${household.id}_${target}`,
        );
        need(
          targetMember && targetMember.active && targetMember.role !== "admin",
          "FORBIDDEN",
          "不能移除管理员；管理员需保留家庭管理责任",
        );
        household.memberIds = household.memberIds.filter((id) => id !== target);
        household.version++;
        Object.assign(household, stamp(uid, household.version));
        await tx.set("members", `${household.id}_${target}`, {
          ...targetMember,
          active: false,
          ...stamp(uid, targetMember.version + 1),
        });
        await tx.set("users", target, { householdId: null, ...stamp(uid, 1) });
        await tx.set("households", household.id, household);
        result = {
          householdId: household.id,
          removed: target,
          version: household.version,
        };
      } else {
        if (action === "migration.import") admin(membership);
        const { state, checks } = await snapshot(tx, household);
        const changed = apply(state, action, p, household, checks);
        household.version++;
        household.dataVersion++;
        if (changed.menuChanged) household.menuVersion++;
        // Compact obsolete per-item versions whenever menu quantities invalidate check requests.
        if (changed.menuChanged) checks.versions = [];
        Object.assign(household, stamp(uid, household.version));
        await saveState(tx, household, changed.state, checks, uid);
        await tx.set("households", household.id, household);
        result = { householdId: household.id, version: household.version };
      }
      if (WRITES.has(action))
        await tx.set("operations", requestKey, {
          householdId: result.householdId,
          uid,
          action,
          digest,
          result,
          createdAt: now(),
        });
      return result;
    });
  }
  return {
    async handle(event, trustedContext) {
      try {
        return { ok: true, data: await execute(event, trustedContext) };
      } catch (error) {
        const code = SAFE_CODES.has(error.code) ? error.code : "INTERNAL";
        // Never expose SDK stack traces, database paths, raw identities, or request payloads.
        return {
          ok: false,
          error: {
            code,
            message:
              code === "INTERNAL"
                ? "家庭服务暂不可用，请稍后重试；本地数据仍保留"
                : error.message,
          },
        };
      }
    },
  };
}
module.exports = { createService };
