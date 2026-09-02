import { app, type BrowserWindow, utilityProcess, type UtilityProcess } from "electron";
import type { Outbound, RequestEnvelope } from "@opentomato/core/protocol";

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

/**
 * 把 core 的 server 拉成 utilityProcess，做请求配对和事件转发。
 * main 进程不理解任何业务字段，只搬运。
 */
export class KernelHost {
  private child: UtilityProcess | null = null;
  private pending = new Map<string, Pending>();
  private seq = 0;
  private window: BrowserWindow | null = null;

  attach(window: BrowserWindow) {
    this.window = window;
  }

  start() {
    const entry = require.resolve("@opentomato/core/server");
    this.child = utilityProcess.fork(entry, [], {
      serviceName: "opentomato-kernel",
      stdio: "pipe",
      env: { ...process.env, OPENTOMATO_HOME: app.getPath("userData") },
    });
    this.child.stdout?.on("data", (d: Buffer) => process.stdout.write(`[kernel] ${d.toString()}`));
    this.child.stderr?.on("data", (d: Buffer) => process.stderr.write(`[kernel] ${d.toString()}`));
    this.child.on("message", (msg: Outbound) => this.onMessage(msg));
    this.child.on("exit", (code) => {
      for (const p of this.pending.values()) p.reject(new Error(`内核退出（code ${code}）`));
      this.pending.clear();
      this.window?.webContents.send("kernel:event", { type: "kernel.error", message: `内核进程退出（code ${code}）` });
      this.child = null;
    });
  }

  stop() {
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
