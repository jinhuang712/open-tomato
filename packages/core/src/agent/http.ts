import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import * as undici from "undici";

/**
 * 出站 HTTP 与 pi CLI 对齐：pi 启动时会装一个读 HTTP(S)_PROXY / NO_PROXY 的 undici 全局 dispatcher，
 * 而 Node 自带的 fetch 默认忽略这些环境变量。我们走的是 pi 的库 API，这一步不会自动发生，
 * 得自己做一遍，否则同一份 ~/.pi/agent 配置在 pi 里能用、在这里却直连被地区拦截。
 *
 * pi-coding-agent 没有从包入口导出 configureHttpDispatcher，这里按它的实现复刻（含 pi 全局设置里的 httpProxy）。
 */

const DEFAULT_HTTP_IDLE_TIMEOUT_MS = 300_000;
// Node 默认 250ms 的 happy-eyeballs 超时在高延迟链路上会误杀正常连接
const AUTO_SELECT_FAMILY_ATTEMPT_TIMEOUT_MS = 2_000;

let installed = false;

/** 读 ~/.pi/agent/settings.json 的 httpProxy；环境变量已有值时不覆盖，与 pi 一致 */
export function applyPiProxySettings(agentDir = path.join(os.homedir(), ".pi", "agent")) {
  let proxy: string | undefined;
  try {
    const raw = JSON.parse(readFileSync(path.join(agentDir, "settings.json"), "utf8")) as { httpProxy?: unknown };
    if (typeof raw.httpProxy === "string") proxy = raw.httpProxy.trim() || undefined;
  } catch {
    // 没有 settings.json 或不是合法 JSON：只按环境变量走
  }
  if (!proxy) return;
  process.env.HTTP_PROXY ??= proxy;
  process.env.HTTPS_PROXY ??= proxy;
}

/** 装上尊重代理环境变量的全局 dispatcher 与同一实现的 fetch；重复调用无副作用 */
export function configureHttpDispatcher(timeoutMs = DEFAULT_HTTP_IDLE_TIMEOUT_MS) {
  if (installed) return;
  installed = true;
  const dispatcher = new undici.EnvHttpProxyAgent({
    allowH2: false,
    proxyTunnel: true,
    bodyTimeout: timeoutMs,
    headersTimeout: timeoutMs,
    connect: { autoSelectFamilyAttemptTimeout: AUTO_SELECT_FAMILY_ATTEMPT_TIMEOUT_MS },
  });
  // undici 在中断流式响应时可能对内部 Client 发 error 事件；不吃掉会让进程崩
  (dispatcher as unknown as NodeJS.EventEmitter).on("error", () => {});
  undici.setGlobalDispatcher(dispatcher);
  // fetch 与 dispatcher 用同一份 undici，避免 Node 自带 fetch 与 npm undici 混用时解压出错
  undici.install?.();
}

/** 内核启动时调一次：先补 pi 设置里的代理，再装 dispatcher */
export function setupOutboundHttp() {
  applyPiProxySettings();
  configureHttpDispatcher();
}
