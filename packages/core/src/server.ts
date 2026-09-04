/**
 * 内核进程入口。
 * 在 Electron utilityProcess 里通过 process.parentPort 收发；
 * 直接 `node dist/server.js` 跑时退化为 stdin / stdout JSONL，方便终端调试。
 */
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Kernel } from "./agent/runtime.js";
import type { Outbound, RequestEnvelope } from "./protocol.js";

/** 版本只在 package.json 维护一份，这里读出来 */
const VERSION = (() => {
  try {
    const pkg = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json");
    return (JSON.parse(readFileSync(pkg, "utf8")) as { version?: string }).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

interface ParentPort {
  on(event: "message", listener: (e: { data: unknown }) => void): void;
  postMessage(message: unknown): void;
}

const parentPort = (process as unknown as { parentPort?: ParentPort }).parentPort;
const home = process.env.OPENTOMATO_HOME ?? path.join(os.homedir(), ".opentomato");

const send = (msg: Outbound) => {
  if (parentPort) parentPort.postMessage(msg);
  else process.stdout.write(`${JSON.stringify(msg)}\n`);
};

const kernel = new Kernel(home, (event) => send({ kind: "event", event }));

/** 还没回的请求数：stdio 模式 stdin 关了也要等它们落定，不能悄悄吞掉 */
let inFlight = 0;

async function onRequest(raw: unknown) {
  const req = raw as Partial<RequestEnvelope>;
  if (!req || req.kind !== "request" || typeof req.id !== "string" || typeof req.method !== "string") return;
  inFlight++;
  try {
    const result = await kernel.handle(req.method, (req.params ?? {}) as never);
    send({ kind: "response", id: req.id, ok: true, result });
  } catch (e) {
    send({ kind: "response", id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) });
  } finally {
    inFlight--;
  }
}

if (parentPort) {
  parentPort.on("message", (e) => void onRequest(e.data));
} else {
  const rl = createInterface({ input: process.stdin });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    try {
      void onRequest(JSON.parse(line));
    } catch {
      send({ kind: "event", event: { type: "kernel.error", message: `无法解析请求：${line.slice(0, 80)}` } });
    }
  });
  // stdin 关了不等于活干完了：等在途请求落定（最多 10 秒，内核 handle 内部会等 init）再退出；没等完就是丢请求，非零码
  rl.on("close", () => {
    const deadline = Date.now() + 10_000;
    const drain = async () => {
      while (inFlight > 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    };
    void drain().then(() => kernel.dispose().finally(() => process.exit(inFlight > 0 ? 1 : 0)));
  });
}

process.on("uncaughtException", (e) => send({ kind: "event", event: { type: "kernel.error", message: `uncaught: ${e.message}` } }));
process.on("unhandledRejection", (e) =>
  send({ kind: "event", event: { type: "kernel.error", message: `unhandled: ${e instanceof Error ? e.message : String(e)}` } }),
);

kernel.init(VERSION).catch((e: unknown) => {
  send({ kind: "event", event: { type: "kernel.error", message: `内核启动失败：${e instanceof Error ? e.message : String(e)}` } });
});
