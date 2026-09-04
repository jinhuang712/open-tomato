import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Kernel } from "../src/agent/runtime.js";
import type { KernelEvent } from "../src/protocol.js";

let home: string;
let root: string;
let kernel: Kernel;
let events: KernelEvent[];

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), "ot-home-"));
  root = await fs.mkdtemp(path.join(os.tmpdir(), "ot-proj-"));
  await fs.rm(root, { recursive: true, force: true });
  events = [];
  kernel = new Kernel(home, (e) => {
    events.push(e);
  });
  await kernel.init("test");
  await kernel.handle("project.create", { root, name: "测试书" });
  events.length = 0;
});

afterEach(async () => {
  await kernel.dispose().catch(() => {});
  await fs.rm(home, { recursive: true, force: true });
  await fs.rm(root, { recursive: true, force: true });
});

const statuses = () => events.filter((e) => e.type === "agent.status") as Array<{ type: "agent.status"; agentId: string; status: string; error: string | null }>;

describe("作者手改落批", () => {
  test("doc.write 内容有变就落一条 edit 批，带 patch 与前后 hash", async () => {
    const before = "---\ntitle: 林尧\nsummary: 主角\nkeywords: []\nstatus: draft\ntier: 主角\n---\n\n## 一句话\n\n铁匠。\n";
    await kernel.handle("doc.write", { kind: "characters", id: "林尧", raw: before });
    const after = before.replace("铁匠。", "铁匠，左手缺一指。");
    await kernel.handle("doc.write", { kind: "characters", id: "林尧", raw: after, expectBefore: before });
    // 内容没变的保存不落批
    await kernel.handle("doc.write", { kind: "characters", id: "林尧", raw: after });

    const store = (kernel as any).requireStore();
    const marks = await store.records.marks("characters", "林尧");
    expect(marks.map((m: { type: string }) => m.type)).toEqual(["edit", "edit"]);
    expect(marks[1].by).toBe("author");
    expect(marks[1].before).not.toBe(marks[1].version);
    expect(marks[1].patch).toContain("+铁匠，左手缺一指。");
  });
});

describe("dispose 不留幽灵状态", () => {
  test("退场的子 agent 收到 done，之后它的滞后更新被吞掉", async () => {
    const k = kernel as any;
    const fake = {
      info: { agentId: "child-1", parentId: "director", role: "writer", label: "写手", task: "写", status: "running", error: null, statusText: "" },
      session: { abort: async () => {}, dispose: () => {} },
      unsubscribe: () => {},
      streamingMessageId: null,
      headBuffer: null,
      mode: "commit" as const,
      tools: [],
    };
    k.agents.set("child-1", fake);
    await k.disposeAgents();
    const done = statuses().filter((e) => e.agentId === "child-1");
    expect(done.map((e) => e.status)).toEqual(["done"]);

    // 滞后的 error（abort 触发旧 run reject 等）不能再翻出来
    events.length = 0;
    k.setStatus(fake, "error", "late abort");
    expect(statuses()).toEqual([]);
  });

  test("setStatus 认对象不认 id：不在表里的旧 live 发不出事件", async () => {
    const k = kernel as any;
    const current = k.agents.get("director");
    const stale = { info: { ...current.info } };
    k.setStatus(stale, "error", "ghost");
    expect(statuses()).toEqual([]);
    // 表里的对象照常能发
    k.setStatus(current, "error", "real");
    expect(statuses().map((e) => [e.agentId, e.status, e.error])).toEqual([["director", "error", "real"]]);
  });

  test("chat.new 时旧 lead 的 run 报错不会污染新会话", async () => {
    const k = kernel as any;
    const live = k.agents.get("director");
    let rejectRun!: (e: Error) => void;
    const pending = new Promise<never>((_, rej) => {
      rejectRun = rej;
    });
    pending.catch(() => {});
    live.info.status = "running";
    live.session = {
      isStreaming: false,
      prompt: () => pending,
      abort: async () => {
        rejectRun(new Error("aborted"));
      },
      dispose: () => {},
    };
    k.sendTo("director", "hi");
    events.length = 0;
    await kernel.handle("chat.new", {});
    await new Promise((r) => setTimeout(r, 50));
    const leadErrors = statuses().filter((e) => e.agentId === "director" && e.status === "error");
    expect(leadErrors).toEqual([]);
  });
});
