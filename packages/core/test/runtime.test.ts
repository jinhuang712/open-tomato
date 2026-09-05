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

describe("子任务报告标签", () => {
  test("promptChild 回传结论前带报告提示，内容保真", async () => {
    const { loadPrompt } = await import("../src/agent/prompt-text.js");
    const notice = loadPrompt("shared/child-report-notice");
    const fake = {
      session: {
        prompt: async () => {},
        abort: async () => {},
        messages: [
          { role: "assistant", content: [{ type: "text", text: "三个主角方向如下……" }] },
        ],
      },
      info: { agentId: "child-1", role: "designer", label: "策划" },
    };
    const slot = { agentId: "child-1", role: "designer", label: "策划", task: "t", status: "running", error: null };
    const roster = { touch: () => {} };
    const out = await (kernel as any).promptChild(fake, "任务", slot, roster);
    expect(out).toContain(notice);
    expect(out).toContain("## 策划（designer，id=child-1）");
    expect(out).toContain("三个主角方向如下……");
  });
});

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

describe("收件箱：跑着的时候排队，轮末一并送", () => {
  function fakeLead(isStreaming: boolean) {
    const calls: Array<[string, unknown]> = [];
    const fake = {
      info: { agentId: "director", parentId: null, role: "director", label: "主编", task: "", status: "running", error: null, statusText: "" },
      session: {
        isStreaming,
        prompt: async (t: string, o?: unknown) => {
          calls.push([t, o]);
        },
        clearQueue: () => ({ steering: [], followUp: [] }),
        abort: async () => {},
        dispose: () => {},
      },
      unsubscribe: () => {},
      streamingMessageId: null,
      headBuffer: null,
      mode: "commit" as const,
      tools: [],
      inbox: [] as Array<{ id: string; label: string; text: string }>,
      steering: [] as string[],
      hold: false,
      flushRest: false,
    };
    (kernel as any).agents.set("director", fake);
    return { fake, calls };
  }
  const queueEvents = () =>
    events.filter((e) => e.type === "agent.event" && e.event.type === "queue_update").map((e) => (e as any).event.items as Array<{ label: string; inserted: boolean }>);

  test("排队进收件箱不打断；批注带自己的标签；插入立刻 steer", async () => {
    const { fake, calls } = fakeLead(true);
    await kernel.handle("chat.send", { text: "先把配角补一张", deliverAs: "followUp" });
    await kernel.handle("chat.send", { text: "⟦stub:批注1⟧\n[批注 正文/0001]\n> 他推门进来\n太急", deliverAs: "followUp" });
    expect(calls).toEqual([]);
    expect(fake.inbox.map((e) => e.label)).toEqual(["排队", "批注1"]);
    expect(queueEvents().at(-1)?.map((i) => `${i.label}:${i.inserted}`)).toEqual(["排队:false", "批注1:false"]);

    await kernel.handle("chat.insert", { id: fake.inbox[0]!.id });
    expect(calls).toEqual([["先把配角补一张", { streamingBehavior: "steer" }]]);
    expect(fake.inbox.map((e) => e.label)).toEqual(["批注1"]);
  });

  test("轮末送第一条，其余等这轮跑起来再插进去", async () => {
    const { fake, calls } = fakeLead(false);
    fake.inbox.push({ id: "a", label: "排队", text: "第一条" }, { id: "b", label: "排队", text: "第二条" });
    (kernel as any).forward(fake, { type: "agent_end" });
    await new Promise((r) => setTimeout(r, 5));
    expect(calls).toEqual([["第一条", undefined]]);
    expect(fake.inbox.map((e) => e.text)).toEqual(["第二条"]);
    expect(fake.flushRest).toBe(true);

    (kernel as any).forward(fake, { type: "agent_start" });
    expect(calls.at(-1)).toEqual(["第二条", { streamingBehavior: "steer" }]);
    expect(fake.inbox).toEqual([]);
    expect(fake.flushRest).toBe(false);
  });

  test("暂停后轮末不取件，作者再开口才送", async () => {
    const { fake, calls } = fakeLead(true);
    await kernel.handle("chat.send", { text: "排着", deliverAs: "followUp" });
    await kernel.handle("chat.pause", {});
    expect(fake.hold).toBe(true);
    fake.session.isStreaming = false;
    (kernel as any).forward(fake, { type: "agent_end" });
    await new Promise((r) => setTimeout(r, 5));
    expect(calls.filter(([t]) => t === "排着")).toEqual([]);

    await kernel.handle("question.reply", { questionId: "none", answer: "继续" });
    expect(fake.hold).toBe(false);
    (kernel as any).forward(fake, { type: "agent_end" });
    await new Promise((r) => setTimeout(r, 5));
    expect(calls.at(-1)).toEqual(["排着", undefined]);
  });
});

describe("子 agent 会话落盘", () => {
  const rec = { agentId: "child-9", parentId: "director", role: "designer" as const, label: "策划", task: "出三个主角方向", mode: "propose" as const };

  test("关项目只释放内存，索引留着；重开项目按索引接回同一个 agentId，派单方式不变，状态是 done", async () => {
    const store = (kernel as any).requireStore();
    await store.saveAgentRecord(rec);
    await kernel.handle("project.close", {});
    expect(await fs.readFile(path.join(root, ".opentomato", "sessions", "agents.json"), "utf8")).toContain("child-9");

    events.length = 0;
    await kernel.handle("project.open", { root });
    const spawned = events.filter((e) => e.type === "agent.spawned") as Array<{ type: "agent.spawned"; agent: { agentId: string; role: string; status: string; task: string } }>;
    const child = spawned.find((e) => e.agent.agentId === "child-9");
    expect(child?.agent.role).toBe("designer");
    expect(child?.agent.status).toBe("done");
    expect(child?.agent.task).toBe("出三个主角方向");
    expect((kernel as any).agents.get("child-9").mode).toBe("propose");
    expect(events.some((e) => e.type === "agent.event" && e.agentId === "child-9" && e.event.type === "history")).toBe(true);
  });

  test("主编开新会话时子 agent 退役：索引清空，会话目录删掉", async () => {
    const store = (kernel as any).requireStore();
    await store.saveAgentRecord(rec);
    await fs.mkdir(store.agentSessionDir("child-9"), { recursive: true });
    await kernel.handle("project.close", {});
    await kernel.handle("project.open", { root });
    expect((kernel as any).agents.has("child-9")).toBe(true);

    await kernel.handle("chat.new", {});
    expect(await store.agentRecords()).toEqual([]);
    expect(await fs.stat(store.agentSessionDir("child-9")).catch(() => null)).toBeNull();
    expect((kernel as any).agents.has("child-9")).toBe(false);
  });
});
