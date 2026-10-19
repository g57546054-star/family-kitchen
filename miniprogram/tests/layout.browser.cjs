// Geometry regression for the actual statistics WXML/WXSS in Chromium.
// Native tags/rpx are adapted for CSS measurement; this is NOT a WeChat UI test.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { DOMParser } = require("@xmldom/xmldom");
const { chromium } = require("@playwright/test");
const root = path.resolve(__dirname, "..");

function fixture(name, width, fontScale) {
  const template = fs.readFileSync(
    path.join(root, `pages/${name}/index.wxml`),
    "utf8",
  );
  const normalized = template.replace(
    /\s(wx:else|scroll-x|block|autosize)(?=[\s/>])/g,
    ' $1="true"',
  );
  const doc = new DOMParser().parseFromString(
    `<root xmlns:wx="urn:wx" xmlns:bind="urn:bind">${normalized}</root>`,
    "text/xml",
  );
  const containerClass = name === "week" ? "week-status" : "shopping-progress";
  const container = Array.from(doc.getElementsByTagName("view")).find(
    (el) => el.getAttribute("class") === containerClass,
  );
  assert.ok(container, `Missing statistics container: ${name}`);
  function html(node) {
    if (node.nodeType === 3)
      return node.data
        .replace(/\{\{count\}\}/g, "420")
        .replace(/\{\{completed\}\}/g, "24999")
        .replace(/\{\{total\}\}/g, "25000");
    if (node.nodeType !== 1) return "";
    const tag =
      node.tagName === "view"
        ? "div"
        : node.tagName === "text"
          ? "span"
          : node.tagName;
    const classes = node.getAttribute("class") || "";
    return `<${tag} class="${classes}">${Array.from(node.childNodes).map(html).join("")}</${tag}>`;
  }
  let css =
    fs.readFileSync(path.join(root, "app.wxss"), "utf8") +
    fs.readFileSync(path.join(root, `pages/${name}/index.wxss`), "utf8");
  css = css.replace(/\bpage\s*\{/g, "body {");
  css = css.replace(
    /(font-size:\s*)([\d.]+)rpx/g,
    (_, prefix, amount) => `${prefix}${Number(amount) * fontScale}rpx`,
  );
  css = css.replace(
    /([\d.]+)rpx/g,
    (_, amount) => `${(Number(amount) * width) / 750}px`,
  );
  // TDesign small-button text/padding, represented as a custom-element host.
  const buttonStyle = `t-button{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;padding:0 ${(24 * width) / 750}px;height:${(64 * width) / 750}px;font-size:${((28 * width) / 750) * fontScale}px;font-weight:600;line-height:1.5;white-space:nowrap;flex-shrink:0;border:1px solid #ddd;border-radius:4px}`;
  return `<html lang="zh-CN"><meta charset="utf-8"><style>${css}${buttonStyle}body{margin:0}span{box-sizing:border-box}</style><body><div class="page">${html(container)}</div></body></html>`;
}

async function run() {
  const options = { headless: true };
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH)
    options.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const browser = await chromium.launch(options);
  let checked = 0;
  try {
    const page = await browser.newPage();
    for (const width of [320, 375, 414])
      for (const fontScale of [1, 1.4, 1.8]) {
        await page.setViewportSize({ width, height: 700 });
        for (const name of ["week", "shopping"]) {
          await page.setContent(fixture(name, width, fontScale));
          const result = await page.evaluate((name) => {
            const container = document.querySelector(
              name === "week" ? ".week-status" : ".shopping-progress",
            );
            const statistic = container.firstElementChild;
            function textRects(needle) {
              const walker = document.createTreeWalker(
                statistic,
                NodeFilter.SHOW_TEXT,
              );
              while (walker.nextNode()) {
                const index = walker.currentNode.textContent.indexOf(needle);
                if (index >= 0) {
                  const range = document.createRange();
                  range.setStart(walker.currentNode, index);
                  range.setEnd(walker.currentNode, index + needle.length);
                  return [...range.getClientRects()].map((r) => ({
                    top: r.top,
                    bottom: r.bottom,
                  }));
                }
              }
              throw new Error(`Missing statistic text: ${needle}`);
            }
            const begin = textRects(name === "week" ? "已安排" : "已备齐");
            const end = textRects(name === "week" ? "道菜" : "种");
            const bounds = container.getBoundingClientRect();
            return {
              begin,
              end,
              fits: [...container.querySelectorAll("*")].every((el) => {
                const r = el.getBoundingClientRect();
                return r.left >= bounds.left - 1 && r.right <= bounds.right + 1;
              }),
              noOverflow: document.documentElement.scrollWidth <= innerWidth,
            };
          }, name);
          const context = `${name}, ${width}px, font scale ${fontScale}`;
          assert.equal(
            result.begin.length,
            1,
            `Statistic prefix wrapped: ${context}`,
          );
          assert.equal(
            result.end.length,
            1,
            `Statistic unit wrapped: ${context}`,
          );
          assert.ok(
            Math.abs(result.begin[0].top - result.end[0].top) < 1,
            `Statistic split across lines: ${context}`,
          );
          assert.ok(
            result.fits && result.noOverflow,
            `Statistics or buttons overflow: ${context}`,
          );
          checked += 1;
        }
      }
    console.log(
      `PASS: ${checked} statistics layouts (320/375/414px, default/140%/180% text). Chromium CSS model only; WeChat rendering NOT_RUN.`,
    );
  } finally {
    await browser.close();
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
