// 打包前把 core 的生产依赖装进 .stage/core/node_modules，electron-builder 再把它当 extraResources 拷到 Resources/core/node_modules。
// 为什么不直接拷 packages/core/node_modules：bun workspace 里那是指向根目录 .bun 仓库的软链，拷出去就是死链。
// 用 npm 在独立目录里装：依赖版本在 core/package.json 里全是精确版本，结果与开发态一致。
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const corePkg = JSON.parse(readFileSync(join(here, "..", "..", "core", "package.json"), "utf8"));
const stage = join(here, "..", ".stage", "core");

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
writeFileSync(
  join(stage, "package.json"),
  `${JSON.stringify({ name: "opentomato-core-runtime", private: true, type: "module", dependencies: corePkg.dependencies }, null, 2)}\n`,
);

console.log("[stage-core-deps] npm install --omit=dev →", stage);
execFileSync("npm", ["install", "--omit=dev", "--no-package-lock", "--no-audit", "--no-fund", "--loglevel=error"], { cwd: stage, stdio: "inherit" });
