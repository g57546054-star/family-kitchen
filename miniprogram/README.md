# 家常厨房 · 微信原生小程序（第二阶段 A）

这是独立的 **JavaScript + WXML + WXSS + JSON 原生小程序**，不是网页容器，不使用 React、Vite、WebView 或跨端框架。现有网页的 `src/`、数据、依赖和发布工作流保留不变。

## 已实现

- 菜谱列表：按菜名及多种食材搜索、分类、私人菜谱筛选与收藏。
- 菜品详情：基础人数、制作时间、食材用量及详细做法。
- 私人菜谱：新增、编辑、删除；内置示例以“另存私人菜谱”方式编辑，保留原始参考配方。
- 每周点菜：周一至周日的午餐/晚餐，切换周次、添加多道菜、调整人数、移除菜品；同餐重复菜品合并人数。
- 采购清单：按人数缩放，同名同单位合并，仅将千克换算为克；待核对单位分区显示，支持勾选及复制文本。
- 备份迁移：导出本机 JSON、预览并导入网页 v1 备份、恢复小程序 v2 备份、保留并单独导出迁移原文件。
- UI 优先采用 TDesign MiniProgram 1.17.0：搜索、按钮、输入框、标签、复选框、图标、文本域和弹层。
- 12 道全克重参考菜谱：番茄炒蛋、西兰花炒虾仁、土豆炖牛肉、蒜蓉生菜、菌菇豆腐汤、缤纷蛋炒饭、土豆焖鸡、清蒸鲈鱼、家常麻婆豆腐、青椒土豆丝、南瓜小米粥、玉米排骨汤。

## 微信开发者工具导入

1. 安装稳定版**微信开发者工具**，建议选择最新稳定基础库（本项目配置为 `latest`）。Node.js 建议 22+，本次测试使用 24。
2. 检出本 PR 分支，进入**仓库根目录**，安装两套互相独立的依赖：

   ```bash
   npm ci
   npm ci --prefix miniprogram
   ```

   第一条供现有网页及网页数据对照测试使用；小程序运行依赖仅来自 `miniprogram/package.json`。若 npm 默认缓存无写权限，可以在命令后加 `--cache /tmp/family-kitchen-npm-cache`（本云环境适用）。Windows 可使用自己有写权限的缓存目录。

3. 在开发者工具选择**导入项目**，目录选仓库根目录 `family-kitchen`，不要选 `src/`，也不要将它作为小游戏。工具会读取真实的根目录 `project.config.json`，其中 `compileType` 为 `miniprogram`、`miniprogramRoot` 为 `miniprogram/`。
4. 仓库中 `appid: "touristappid"` 是微信工具支持的游客占位值，并非伪造的生产 AppID。可使用工具提供的测试号或填自己的合法小程序 AppID。游客模式可能限制部分功能；**真机预览、分享、上传审核必须使用你自己的有效 AppID 和对应权限**。AppID 是公开标识，AppSecret、上传私钥等不需要填写到仓库。
5. 点击**工具 → 构建 npm**。配置已提供 `packNpmManually` 和 `packNpmRelationList`，读取 `miniprogram/package.json`，生成 `miniprogram/miniprogram_npm/tdesign-miniprogram/`。该生成目录和 `node_modules` 不提交。
6. 点击**编译**。若提示找不到 `tdesign-miniprogram/button/button`，先确认第 2 步安装成功、第 5 步已构建 npm，再重试。不要将 npm 包源码手工复制到业务代码中。
7. 按下述验收清单在模拟器测试，再使用真实 AppID 做真机预览。本阶段无需配置请求域名、登录服务、云开发环境或任何密钥。

> 本环境没有微信开发者工具/微信官方编译器。上述配置已通过文件、组件资源和事件绑定静态检查，但“构建 npm”、微信官方编译、基础库兼容性、游客模式行为、真机样式与文件发送尚待在工具中确认。

## 本地测试

在仓库根目录执行：

```bash
npm run check --prefix miniprogram
npm test --prefix miniprogram
npm run build
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test
```

最后一条是**原有网页**的 Chromium 测试；其他机器先按根 README 安装 Playwright Chromium，或指定本机 Chromium 路径。不要把网页浏览器测试当作原生小程序真机测试。

`check` 校验真实项目配置、六页四件套、TDesign 资源路径、WXML XML 结构及所有页面事件处理函数；它不是微信官方编译器。`test` 使用 Node 内置测试运行器，覆盖真实业务函数、微信存储适配器与页面控制器（模拟 `wx`/`Page`），并从**未改动的 `src/data.ts`** 编译原始函数，做菜单/采购/日期逻辑对照。CI 对 PR 运行这些检查与旧网页构建，不上传、发布或创建云环境。

具体执行结果与未验证项见 [测试记录](docs/TESTING.md)。

## 单位规则

新增示例是**重新编写的参考配方**，以可食部分克重表示；不是把旧网页“2 个番茄”等直接改为“2 克”。鸡蛋液指去壳后重量，去骨肉/净鱼肉按去骨后重量，液体也需称重。配方仅供家常烹饪参考，并非营养或食品安全认证。

- 唯一自动质量换算：`1 千克 = 1000 克`。
- 个、颗、根、瓣、盒、碗、毫升、勺等**保持原值和原单位**，并标为待核对。它们不使用假定单个重量或默认密度换算。
- 编辑中从非重量单位切换到克/千克时，数量被清空；必须重新输入实际重量并勾选“我已称重并核对”。原始用量仍记录在 `sourceMeasure`，原网页完整文件另外保留。
- 相同食材的克重与计数/体积不会混合累加。“鸡蛋”和“鸡蛋液”也不被当作已经核对的同一个商品。

## 数据和迁移

微信本地状态键为 `family-kitchen:mini:v2`，与网页 `family-kitchen:v1` 隔离。浏览器与微信沙盒互不可读，不会自动跨设备同步；本阶段没有用户系统或家庭云存储。

详细步骤、备份保留方式、恢复及失败处理见 [旧网页数据迁移说明](docs/MIGRATION.md)。单份导入文件和活动状态目前各限制为 1MB，以控制 `wx.setStorageSync` 单键开销；微信总体存储配额仍可能不足，写入失败会显示错误，不显示保存成功。

## CloudBase 预留接口

`services/family-provider.js` 提供同步能力查询 `getCapabilities()`，以及异步 `pullFamily({ familyId })`、`pushFamily({ familyId, state, expectedRevision })` 接口形状。当前能力明确为 `enabled: false`，后两者以 `FAMILY_SHARING_DISABLED` 拒绝。

未调用 `wx.cloud.init`、`wx.cloud.callFunction`、登录或网络请求，也没有云环境 ID、云函数、付费资源或密钥。未来阶段在此边界实现鉴权、家庭成员权限、服务端版本号及冲突处理；不得用本地时间戳直接覆盖远端状态。

## 工具中待执行的验收

1. 构建 npm 后编译，四个原生 Tab 均能打开；确认 TDesign 样式与弹层正常。
2. 搜索“土豆 牛肉”，查看详情；另存私人菜谱，编辑、收藏、删除，确认示例保留。
3. 同餐点两次同一道菜，调整人数；切换到采购页验证合并、重量及勾选，关闭重开工具检查持久化。
4. 从原浏览器导出真实 JSON；通过文件传输助手在小程序中选择文件，预览后迁移，核对原单位、菜单及收藏；分别导出原文件和当前小程序备份。
5. 将“个”改为“克”，确认数量清空，未勾选核对前无法保存；重新称重输入后保存。
6. 使用真实 AppID 在 iOS/Android 微信测试键盘、日期选择、长文本、聊天文件选择、复制和 `wx.shareFileMessage`。这些能力在游客模式/模拟器中可能受限，错误提示不代表文件已成功发送。

## 目录

```text
project.config.json             # 在仓库根目录，微信原生项目入口
miniprogram/
  app.js / app.json / app.wxss  # 原生应用与全局 TDesign 注册
  data/recipes.js              # 12 道独立克重参考配方
  pages/                       # 菜谱、详情、编辑、周菜单、采购、备份
  utils/core.js                # 迁移后的纯业务逻辑
  services/repository.js       # 微信存储与备份写入顺序
  services/migration.js        # v1 导入与 v2 备份验证
  services/family-provider.js  # 禁用的 CloudBase 扩展边界
  scripts/check-project.cjs    # 结构、组件与事件静态检查
  tests/                      # Node 业务/适配/页面/对照测试
  docs/                       # 迁移说明与验证记录
```
