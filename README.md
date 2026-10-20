# 家常 · Family Kitchen

中文家庭厨房网页应用。使用 React、TypeScript 和 Vite，无需后端、数据库或登录。

## 微信原生小程序

原网页继续独立运行。原生小程序位于 `miniprogram/`，阶段2B增加可选的家庭共享，默认仍为本地模式。请先阅读[微信开发者工具导入说明](miniprogram/README.md)与[家庭共享手动部署、集合、索引及权限配置](miniprogram/docs/CLOUDBASE.md)。此 PR 只提供代码和测试，不自动连接腾讯云、创建集合、部署或购买资源。

## 功能

- **我的菜谱**：内置 6 道示例菜，添加、查看、编辑、删除和收藏自己的菜谱。
- **按食材搜索**：按菜名或食材搜索，多种食材用空格分隔；支持荤菜、素菜、主食、汤羹分类。
- **每周菜单**：安排周一至周日的午餐、晚餐，支持多道菜、用餐人数和切换周次。同一餐重复添加同道菜会合并人数。
- **购物清单**：按菜谱份量与用餐人数计算用量，合并同名且同单位的食材，支持勾选、取消勾选和导出文本清单。
- **本地保存**：菜谱、菜单、采购勾选保存在当前浏览器的 `localStorage`，刷新后保留；可导出 JSON 数据备份。
- **手机适配**：窄屏折叠导航，周菜单变为按天排列，支持键盘操作与弹窗焦点管理。

## 运行

建议 Node.js 22 或更高版本（当前环境使用 Node.js 24）。

```bash
cd /workspace/family-kitchen
npm ci --cache /tmp/family-kitchen-npm-cache
npm run dev -- --port 5173 --strictPort
```

Vite 默认监听所有网络接口，端口为 `5173`。如需在自己的电脑上运行，从项目目录执行相同命令即可。

重新安装依赖前，请先停止本应用的开发进程。若浏览器提示 `Outdated Optimize Dep`，停止旧进程后用 `npm run dev -- --port 5173 --strictPort --force` 重启，以刷新依赖缓存。

## 构建

```bash
npm run build
npm run preview -- --port 4173 --strictPort
```

构建产物在 `dist/`，可以部署到任意静态网站托管服务。不需要环境变量、API 密钥或外部图片和字体服务。

## 部署到 GitHub Pages

已提供 `.github/workflows/pages.yml`，使用 GitHub Actions 构建并发布静态网页。无需注册 Vercel 或 Netlify。网站将对访问者公开；个人菜谱和菜单仍仅保存在访问者自己的浏览器中。

1. 先将项目代码和工作流提交到 GitHub 仓库 `g57546054-star/family-kitchen` 的 `main` 分支。云环境发布不会自动提交或推送代码到 GitHub。
2. 在 GitHub 仓库的 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**。GitHub 免费账号通常要求仓库公开；私有仓库是否支持 Pages 取决于账号方案。不要为启用 Pages 擅自改变仓库可见性。
3. 打开 **Actions → Deploy Family Kitchen to GitHub Pages → Run workflow**，选择 `main` 执行。以后推送 `main` 会自动重新部署。
4. 等待 `build` 和 `deploy` 均成功，使用该次部署结果提供的网址访问。工作流成功前不要将预期地址当作已上线网址。

`npm run build:pages` 将资源路径设为 `/family-kitchen/`，适配项目站点的子目录，包括网页图标。若仓库重命名或改用自定义域名，请相应调整该脚本的 `--base`。部署本身不需要用户提供访问令牌，工作流使用 GitHub 自动提供的权限。

可用 `npm run build:pages` 后执行 `npm run preview -- --base=/family-kitchen/ --port 4173 --strictPort`，通过内部浏览器验证 `/family-kitchen/` 路径的资源和功能。需要回到根路径预览时，先执行 `npm run build`，再按上面的常规构建步骤启动。

## 浏览器测试

测试覆盖菜谱新增、编辑、搜索、收藏、删除、本地保存、购物用量换算、食材合并、跨周隔离、菜单同步、手机布局、数据损坏与存储失败提示。

当前云环境已经有 Chromium：

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test
```

其他机器可以安装 Playwright 浏览器后运行：

```bash
npx playwright install chromium
npm test
```

测试会自动启动开发服务器；如 `5173` 已运行开发服务器则会复用。

## 数据说明

- 仅在首次打开时显示示例菜谱，每周菜单初始为空。
- 数据只保存在**当前浏览器、当前站点地址**中，不跨设备同步。更换浏览器、访问地址或端口会使用独立的数据空间。
- 清除浏览器网站数据会删除本地记录；隐私模式的数据通常会在关闭窗口后清除。建议定期导出备份。当前基础版提供备份导出，尚未提供备份导入界面。
- 调整某一周的菜单后，会取消该周清单的勾选，避免用量变化后被误认为已备齐。编辑或删除菜谱会重新计算相关菜单，并清空清单勾选。
- 食材按精确名称和单位合并。例如 `土豆 / 克` 与 `土豆 / 个` 会分别列出，不自动换算，建议录入时统一命名和单位。
- 若浏览器存储不可用，会明确提示保存失败；数据损坏时不会在页面初始化时覆盖原始内容。

## 项目结构

- `src/App.tsx`：菜谱、菜单、购物清单页面和表单。
- `src/data.ts`：数据类型、示例菜谱、存储校验和清单汇总。
- `src/DishArt.tsx`：无需网络的 SVG 菜品插画。
- `src/styles.css`：桌面和手机界面样式。
- `tests/kitchen.spec.ts`：Playwright 浏览器流程测试。
