import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { discoverAndLoadExtensions, type LoadExtensionsResult, type ModelRuntime } from "@earendil-works/pi-coding-agent";

/**
 * pi-claude-cli：把 Claude 订阅账号（本机 claude CLI / Agent SDK）接成 pi 的一个 provider，id 为 pi-claude-cli。
 * 它是 pi 的扩展包，本应用的会话用的是自带的 ResourceLoader（不扫 pi 的扩展目录），所以这里单独把它加载进来。
 * 没装就是没有这个 provider，不报错：装法与 pi 一致（pi install git:github.com/<owner>/pi-claude-cli）。
 */
export const CLAUDE_CLI_PROVIDER = "pi-claude-cli";

/** 在 pi 的安装位置里找扩展入口：git 包 <agent>/git/<host>/<owner>/pi-claude-cli，或 npm 全局包 */
export function findClaudeCliEntry(agentDir: string): string | null {
  const roots = [path.join(agentDir, "git", "github.com"), path.join(agentDir, "npm", "node_modules")];
  const candidates: string[] = [path.join(roots[1]!, "pi-claude-cli", "index.ts"), path.join(roots[1]!, "@ramarivera", "pi-claude-cli", "index.ts")];
  try {
    for (const owner of readdirSync(roots[0]!)) candidates.push(path.join(roots[0]!, owner, "pi-claude-cli", "index.ts"));
  } catch {
    // 没有 git 包目录
  }
  return candidates.find((p) => existsSync(p)) ?? null;
}

/**
 * 加载扩展并把它登记的 provider 注册进 ModelRuntime，模型选择器才看得到。
 * 返回加载结果：会话要把其中的 extensions / runtime 带进自己的 ResourceLoader，扩展的生命周期钩子才在会话里生效。
 * home 是本应用的数据目录。找不到或加载失败返回 null（失败只打日志，不挡住应用启动）。
 */
export async function loadClaudeCli(runtime: ModelRuntime, agentDir: string, home: string): Promise<LoadExtensionsResult | null> {
  const entry = findClaudeCliEntry(agentDir);
  if (!entry) return null;
  try {
    // cwd 与 agentDir 都给本应用自己的目录：它们下面没有 extensions/，不会连带把 pi 里别的扩展也扫进来
    const result = await discoverAndLoadExtensions([entry], home, home);
    for (const err of result.errors) console.error(`[pi-claude-cli] 加载失败：${err.path}: ${err.error}`);
    if (result.extensions.length === 0) return null;
    for (const { name, config } of result.runtime.pendingProviderRegistrations) runtime.registerProvider(name, config);
    result.runtime.pendingProviderRegistrations = [];
    for (const { provider } of result.runtime.pendingNativeProviderRegistrations) runtime.registerNativeProvider(provider);
    result.runtime.pendingNativeProviderRegistrations = [];
    return result;
  } catch (e) {
    console.error(`[pi-claude-cli] 加载失败：${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}
