function decodeRecipeId(value) {
  try {
    if (typeof value !== "string") throw new Error("Missing recipe ID");
    // Navigation callers encode the query once; already-decoded IDs also work.
    const id = decodeURIComponent(value);
    if (!/^[a-zA-Z0-9:_-]{1,140}$/.test(id))
      throw new Error("Invalid recipe ID");
    return id;
  } catch (_) {
    throw new Error("菜谱链接无效，请返回菜谱列表重新打开");
  }
}
module.exports = { decodeRecipeId };
