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

async function onRequest(raw: unknown) {
  const req = raw as Partial<RequestEnvelope>;
  if (!req || req.kind !== "request" || typeof req.id !== "string" || typeof req.method !== "string") return;
  try {
    const result = await kernel.handle(req.method, (req.params ?? {}) as never);
    send({ kind: "response", id: req.id, ok: true, result });
  } catch (e) {
    send({ kind: "response", id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) });
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
  rl.on("close", () => void kernel.dispose().finally(() => process.exit(0)));
}

process.on("uncaughtException", (e) => send({ kind: "event", event: { type: "kernel.error", message: `uncaught: ${e.message}` } }));
process.on("unhandledRejection", (e) =>
  send({ kind: "event", event: { type: "kernel.error", message: `unhandled: ${e instanceof Error ? e.message : String(e)}` } }),
);

kernel.init(VERSION).catch((e: unknown) => {
  send({ kind: "event", event: { type: "kernel.error", message: `内核启动失败：${e instanceof Error ? e.message : String(e)}` } });
});
