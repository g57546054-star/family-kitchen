import { test, expect, type Page } from "@playwright/test";

const key = "family-kitchen:v1";
async function nav(page: Page, name: string) {
  if (
    await page
      .getByRole("button", { name: "打开导航", exact: true })
      .isVisible()
  )
    await page.getByRole("button", { name: "打开导航", exact: true }).click();
  await page
    .getByRole("navigation", { name: "主导航" })
    .getByRole("button", { name, exact: false })
    .click();
}
async function addTomatoes(page: Page, servings = "4") {
  await page
    .getByRole("button", { name: "将番茄炒蛋加入菜单", exact: true })
    .click();
  await page.getByLabel("哪一天").selectOption({ index: 0 });
  await page.getByLabel("用餐人数").fill(servings);
  await page.getByRole("button", { name: "加入菜单", exact: true }).click();
}

test("create, search by ingredients, edit, persist and delete a recipe", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("article")).toHaveCount(6);
  await page.getByRole("button", { name: "添加菜谱", exact: true }).click();
  await page.getByLabel("菜谱名称").fill("南瓜小米粥");
  await page.getByLabel("分类", { exact: true }).selectOption("主食");
  await page.getByLabel("食材1名称", { exact: true }).fill("南瓜");
  await page.getByLabel("食材1数量", { exact: true }).fill("200");
  await page.getByRole("button", { name: "添加食材", exact: true }).click();
  await page.getByLabel("食材2名称", { exact: true }).fill("小米");
  await page.getByLabel("食材2数量", { exact: true }).fill("50");
  await page
    .getByLabel("做法步骤")
    .fill("南瓜切块，小米洗净。\n加水煮至浓稠。");
  await page.getByRole("button", { name: "保存菜谱", exact: true }).click();
  await page.getByLabel("搜索菜名或食材").fill("南瓜 小米");
  await expect(page.getByRole("article")).toHaveCount(1);
  await page
    .getByRole("button", { name: "收藏南瓜小米粥", exact: true })
    .click();
  await page
    .getByRole("button", { name: "查看南瓜小米粥", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByText("南瓜切块，小米洗净。"),
  ).toBeVisible();
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByLabel("菜谱名称").fill("香甜南瓜小米粥");
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  await page.reload();
  await nav(page, "收藏菜谱");
  await expect(
    page.getByRole("button", { name: "查看香甜南瓜小米粥", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "查看香甜南瓜小米粥", exact: true })
    .click();
  await page.getByRole("button", { name: "删除菜谱", exact: true }).click();
  await page.getByRole("button", { name: "确认删除", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("article")).toHaveCount(6);
  await expect(
    page.getByRole("button", { name: "查看香甜南瓜小米粥", exact: true }),
  ).toHaveCount(0);
});

test("meal plan scales and merges ingredients, checks persist, weeks stay separate", async ({
  page,
}) => {
  await page.goto("/");
  await addTomatoes(page);
  await page
    .getByRole("button", { name: "将缤纷蛋炒饭加入菜单", exact: true })
    .click();
  await page.getByLabel("哪一天").selectOption({ index: 0 });
  await page.getByRole("button", { name: "加入菜单", exact: true }).click();
  await nav(page, "购物清单");
  const egg = page
    .locator(".shopping-row")
    .filter({ has: page.getByText("鸡蛋", { exact: true }) });
  await expect(egg).toContainText("8");
  const tomato = page
    .locator(".shopping-row")
    .filter({ has: page.getByText("番茄", { exact: true }) });
  await expect(tomato).toContainText("4");
  await page.getByLabel("鸡蛋已备齐", { exact: true }).check();
  await page.reload();
  await nav(page, "购物清单");
  await expect(page.getByLabel("鸡蛋已备齐", { exact: true })).toBeChecked();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出清单", exact: true }).click();
  expect((await downloadEvent).suggestedFilename()).toMatch(
    /^购物清单-.*\.txt$/,
  );
  await page.getByRole("button", { name: "下一周", exact: true }).click();
  await expect(page.getByText("一周的美味，从菜单开始")).toBeVisible();
  await page.getByRole("button", { name: "回到本周", exact: true }).click();
  await expect(page.getByLabel("鸡蛋已备齐", { exact: true })).toBeChecked();
  await nav(page, "每周菜单");
  await expect(
    page.getByRole("button", { name: "移除周一晚餐番茄炒蛋", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "移除周一晚餐番茄炒蛋", exact: true })
    .click();
  await nav(page, "购物清单");
  await expect(page.getByLabel("番茄已备齐", { exact: true })).toHaveCount(0);
  await expect(egg).toContainText("2");
  await expect(
    page.getByLabel("鸡蛋已备齐", { exact: true }),
  ).not.toBeChecked();
});

test("adding same recipe to the same meal combines servings; deleting removes planned meals", async ({
  page,
}) => {
  await page.goto("/");
  await addTomatoes(page, "2");
  await addTomatoes(page, "2");
  await nav(page, "每周菜单");
  await expect(page.locator(".planned-meal")).toHaveCount(1);
  await expect(page.locator(".planned-meal")).toContainText("4 人份");
  await page
    .locator(".planned-meal")
    .getByRole("button", { name: "番茄炒蛋", exact: true })
    .click();
  await page.getByRole("button", { name: "删除菜谱", exact: true }).click();
  await page.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(page.locator(".planned-meal")).toHaveCount(0);
  await nav(page, "购物清单");
  await expect(page.getByText("一周的美味，从菜单开始")).toBeVisible();
});

test("mobile layout and navigation work without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "添加菜谱", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "添加菜谱", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "关闭弹窗", exact: true }).click();
  await nav(page, "每周菜单");
  await expect(
    page.getByRole("button", { name: "安排周一午餐", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "安排周一午餐", exact: true }).click();
  await page.getByRole("button", { name: "加入菜单", exact: true }).click();
  await nav(page, "购物清单");
  await expect(page.locator(".shopping-row")).toHaveCount(4);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});

test("invalid saved data is reported and not silently overwritten", async ({
  page,
}) => {
  await page.addInitScript((key) => localStorage.setItem(key, "{broken"), key);
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("本地数据暂时无法读取");
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(
    "{broken",
  );
  await expect(page.getByRole("article")).toHaveCount(6);
});

test("storage failure warns instead of claiming data was saved", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    };
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "收藏西兰花炒虾仁", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("当前修改仅在本页保留");
  await expect(page.getByText("数据尚未保存", { exact: true })).toBeVisible();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出备份", exact: true }).click();
  expect((await downloadEvent).suggestedFilename()).toMatch(/\.json$/);
});
