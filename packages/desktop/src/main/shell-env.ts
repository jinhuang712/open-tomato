import { execFileSync } from "node:child_process";

/** 出站代理相关的环境变量：从 Dock / Finder 启动时 Electron 拿不到 shell 里的这些值 */
const PROXY_KEYS = ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy"] as const;

/**
 * 从用户的登录 shell 里把代理变量补进 process.env（已有的不覆盖）。
 * 只拿代理这几项，不整份合并，避免把 shell 的 PATH 等无关变量带进内核。
 * 从终端启动时环境里已经有值，这里等于不做事。
 */
export function inheritShellProxyEnv(env: NodeJS.ProcessEnv = process.env) {
  if (process.platform === "win32") return;
  if (PROXY_KEYS.some((k) => env[k])) return;
  let out: string;
  try {
    // -l 登录 shell 读 .zprofile / .zshrc 等；-i 交互式保证 alias 之外的 export 也生效
    out = execFileSync(env.SHELL || "/bin/zsh", ["-ilc", "env"], { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return;
  }
  for (const line of out.split("\n")) {
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq);
    if ((PROXY_KEYS as readonly string[]).includes(key) && !env[key]) env[key] = line.slice(eq + 1);
  }
}
