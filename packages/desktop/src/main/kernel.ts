import { existsSync } from "node:fs";
import { join } from "node:path";
import { app, type BrowserWindow, utilityProcess, type UtilityProcess } from "electron";
import type { Outbound, RequestEnvelope } from "@opentomato/core/protocol";

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

/** 一分钟内最多自动拉起这么多次，再挂就不救了，避免崩溃死循环 */
const RESTART_LIMIT = 3;
const RESTART_WINDOW_MS = 60_000;

/**
 * 把 core 的 server 拉成 utilityProcess，做请求配对和事件转发。
 * main 进程不理解任何业务字段，只搬运。
 * 内核意外退出会自动重拉；重拉后 core 会重新发 kernel.ready，渲染层据此恢复状态。
 */
export class KernelHost {
  private child: UtilityProcess | null = null;
  private pending = new Map<string, Pending>();
  private seq = 0;
  private window: BrowserWindow | null = null;
  private stopping = false;
  private restarts: number[] = [];

  attach(window: BrowserWindow) {
    this.window = window;
  }

  start() {
    this.stopping = false;
    this.spawn();
  }

  stop() {
    this.stopping = true;
    this.child?.kill();
    this.child = null;
  }

  request(method: string, params: unknown): Promise<unknown> {
    if (!this.child) return Promise.reject(new Error("内核未启动"));
    const id = String(++this.seq);
    const envelope: RequestEnvelope = { kind: "request", id, method: method as RequestEnvelope["method"], params: params as never };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child!.postMessage(envelope);
    });
  }

  private spawn() {
    const child = utilityProcess.fork(resolveServerEntry(), [], {
      serviceName: "opentomato-kernel",
      stdio: "pipe",
      env: { ...process.env, OPENTOMATO_HOME: app.getPath("userData") },
    });
    this.child = child;
    child.stdout?.on("data", (d: Buffer) => process.stdout.write(`[kernel] ${d.toString()}`));
    child.stderr?.on("data", (d: Buffer) => process.stderr.write(`[kernel] ${d.toString()}`));
    child.on("message", (msg: Outbound) => this.onMessage(msg));
    child.on("exit", (code) => {
      if (this.child !== child) return;
      this.child = null;
      for (const p of this.pending.values()) p.reject(new Error(`内核退出（code ${code}）`));
      this.pending.clear();
      if (this.stopping) return;
      this.onCrash(code);
    });
  }

  private onCrash(code: number) {
    const now = Date.now();
    this.restarts = this.restarts.filter((t) => now - t < RESTART_WINDOW_MS);
    if (this.restarts.length >= RESTART_LIMIT) {
      this.emitError(`内核进程退出（code ${code}），一分钟内已重启 ${RESTART_LIMIT} 次，不再自动重启，请重开 App`);
      return;
    }
    this.restarts.push(now);
    this.emitError(`内核进程退出（code ${code}），正在重启…`);
    this.spawn();
  }

  private emitError(message: string) {
    this.window?.webContents.send("kernel:event", { type: "kernel.error", message });
  }

  private onMessage(msg: Outbound) {
    if (msg.kind === "event") {
      this.window?.webContents.send("kernel:event", msg.event);
      return;
    }
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    if (msg.ok) p.resolve(msg.result);
    else p.reject(new Error(msg.error));
  }
}

/**
 * 内核入口：开发态走 workspace 里的 @opentomato/core；
 * 打包后 node_modules 不进 asar，用 electron-builder extraResources 拷到 Resources/core/dist。
 */
function resolveServerEntry(): string {
  if (app.isPackaged) {
    const packaged = join(process.resourcesPath, "core", "dist", "server.js");
    if (existsSync(packaged)) return packaged;
  }
  return require.resolve("@opentomato/core/server");
}
