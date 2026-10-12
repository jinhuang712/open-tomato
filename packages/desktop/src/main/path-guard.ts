import { resolve, sep } from "node:path";

/**
 * 渲染层能让主进程碰哪些路径。渲染层会显示模型输出和搜索结果，一旦被注入，
 * shell:trashProject / openPath / showInFolder 就是现成的「移走任意文件夹、打开任意文件」。
 * 所以主进程自己再判一遍，不信渲染层传来的路径。
 */

/** target 是 root 本身或在它里面。都先 resolve：挡掉 `..` 绕出去 */
export function isInside(root: string, target: string): boolean {
  const r = resolve(root);
  const t = resolve(target);
  return t === r || t.startsWith(`${r}${sep}`);
}

/** 只许删已知项目的根目录（最近列表里的）：不是它们本身就拒，包括它们的上级和子目录 */
export function isKnownProjectRoot(root: string, knownRoots: readonly string[]): boolean {
  const t = resolve(root);
  return knownRoots.some((k) => resolve(k) === t);
}

/** 只许碰允许的几个根（应用数据、日志、pi 配置、已知项目）里面的路径 */
export function isAllowedPath(target: string, allowedRoots: readonly string[]): boolean {
  return allowedRoots.some((r) => isInside(r, target));
}
