const vm = require("node:vm");

// XML structure alone cannot detect a newline inside a WXML string literal.
// Parse only (never evaluate) the JS-compatible expressions used by this app.
// This guard is not a replacement for the official WeChat compiler.
function checkTemplateExpressions(template, filename = "WXML") {
  let count = 0;
  for (const match of template.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
    const line = template.slice(0, match.index).split("\n").length;
    try {
      new vm.Script(`(${match[1]})`, { filename: `${filename}:${line}` });
    } catch (error) {
      throw new Error(
        `${filename}:${line}: 无效的 WXML 表达式（检查字符串是否被换行截断）: ${error.message}`,
      );
    }
    count += 1;
  }
  return count;
}
module.exports = { checkTemplateExpressions };
