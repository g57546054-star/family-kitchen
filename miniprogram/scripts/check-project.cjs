const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { DOMParser } = require("@xmldom/xmldom");
const root = path.resolve(__dirname, "..");
const readJSON = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

function checkProject() {
  const config = readJSON(path.join(root, "../project.config.json"));
  assert.equal(config.miniprogramRoot, "miniprogram/");
  assert.equal(config.compileType, "miniprogram");
  assert.ok(
    config.appid === "touristappid" || /^wx[0-9a-f]{16}$/.test(config.appid),
    "Use the guest placeholder or your legitimate public AppID, never a secret",
  );
  assert.equal(
    config.setting.packNpmRelationList[0].packageJsonPath,
    "./miniprogram/package.json",
  );
  const app = readJSON(path.join(root, "app.json"));
  assert.ok(app.pages.length >= 6);
  assert.ok(app.tabBar.list.every((tab) => app.pages.includes(tab.pagePath)));
  const componentRoot = path.join(
    root,
    "node_modules/tdesign-miniprogram/miniprogram_dist",
  );
  const registered = app.usingComponents;
  for (const value of Object.values(registered)) {
    const component = path.join(
      componentRoot,
      value.replace("tdesign-miniprogram/", ""),
    );
    for (const ext of [".js", ".json", ".wxml", ".wxss"])
      assert.ok(
        fs.existsSync(component + ext),
        `Missing TDesign resource: ${component + ext}`,
      );
    assert.equal(readJSON(component + ".json").component, true);
  }
  const iconCSS = fs.readFileSync(
    path.join(componentRoot, "icon/icon.wxss"),
    "utf8",
  );
  let bindings = 0;
  for (const page of app.pages) {
    const base = path.join(root, page);
    for (const extension of [".js", ".wxml", ".wxss", ".json"])
      assert.ok(
        fs.existsSync(base + extension),
        `Missing native page: ${page + extension}`,
      );
    readJSON(base + ".json");
    const source = fs.readFileSync(base + ".js", "utf8");
    new vm.Script(source, { filename: base + ".js" });
    let controller;
    vm.runInNewContext(
      source,
      {
        require: createRequire(base + ".js"),
        Page: (value) => {
          controller = value;
        },
      },
      { filename: base + ".js" },
    );
    assert.ok(
      controller && controller.data,
      `Missing Page registration: ${page}`,
    );
    const template = fs.readFileSync(base + ".wxml", "utf8");
    assert.ok(
      !/<web-view\b/.test(template),
      "Native app must not wrap the old web page",
    );
    // WXML's valueless boolean attributes are legal; normalize only these for XML structural parsing.
    const normalized = template.replace(
      /\s(wx:else|scroll-x|block|autosize)(?=[\s/>])/g,
      ' $1="true"',
    );
    const problems = [];
    const doc = new DOMParser({
      onError: (level, message) => problems.push(`${level}: ${message}`),
    }).parseFromString(
      `<root xmlns:wx="urn:wx" xmlns:bind="urn:bind" xmlns:catch="urn:catch">${normalized}</root>`,
      "text/xml",
    );
    assert.deepEqual(
      problems,
      [],
      `Malformed WXML in ${page}: ${problems.join("\n")}`,
    );
    for (const element of Array.from(doc.getElementsByTagName("*"))) {
      const tag = element.tagName;
      if (tag.startsWith("t-"))
        assert.ok(registered[tag], `Unregistered component ${tag} in ${page}`);
      if (tag === "t-icon") {
        const name = element.getAttribute("name");
        if (name && !name.includes("{{"))
          assert.ok(
            iconCSS.includes(`.t-icon-${name}:before`),
            `Unknown TDesign icon: ${name}`,
          );
      }
      for (const attribute of Array.from(element.attributes || [])) {
        if (/^(bind|catch)(:|-)?/.test(attribute.name)) {
          assert.equal(
            typeof controller[attribute.value],
            "function",
            `Missing handler ${attribute.value} for ${attribute.name} in ${page}`,
          );
          bindings += 1;
        }
      }
    }
    assert.ok(
      !/\b(?:document|window|localStorage)\s*\./.test(source),
      `Browser API in native page ${page}`,
    );
  }
  for (const folder of ["services", "utils"]) {
    for (const name of fs
      .readdirSync(path.join(root, folder))
      .filter((n) => n.endsWith(".js"))) {
      const source = fs.readFileSync(path.join(root, folder, name), "utf8");
      new vm.Script(source);
      assert.ok(
        !/wx\.(?:cloud|request|login)\s*[.(]/.test(source),
        "Cloud/network/login must remain disabled",
      );
    }
  }
  return {
    pages: app.pages.length,
    components: Object.keys(registered).length,
    bindings,
    officialWechatCompilation: "NOT_RUN",
  };
}
if (require.main === module)
  console.log(JSON.stringify(checkProject(), null, 2));
module.exports = { checkProject };
