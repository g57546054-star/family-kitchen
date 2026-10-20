// Local packaging only; never initializes an SDK or deploys anything.
const fs = require("node:fs");
const path = require("node:path");
for (const file of ["utils/core.js", "data/recipes.js"]) {
  const source = path.resolve(__dirname, "..", file);
  const target = path.resolve(
    __dirname,
    "../../cloudfunctions/family/shared",
    file,
  );
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  console.log(`Synced ${file}`);
}
