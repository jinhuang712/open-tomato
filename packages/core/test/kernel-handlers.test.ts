import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Kernel } from "../src/agent/runtime.js";
import type { KernelEvent } from "../src/protocol.js";

/**
 * handle() 各域分发的行为锁。全部走公开 handle()，不断言内部结构，
 * 以便后面把 handle 按域拆文件、抽 CloudManager 时逐字保行为。
 * hermetic：只用 tmp 目录，不碰网络与真实模型。
 */
let home: string;
let root: string;
let kernel: Kernel;
let events: KernelEvent[];

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), "ot-h-home-"));
  root = await fs.mkdtemp(path.join(os.tmpdir(), "ot-h-proj-"));
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

/** 把主编换成假会话，拦住真模型调用并录下发过去的话 */
function fakeLead(isStreaming: boolean) {
  const calls: Array<[string, unknown]> = [];
  const fake = {
    info: { agentId: "director", parentId: null, role: "director", label: "主编", task: "", status: "idle", error: null, statusText: "" },
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
    skipBlank: false,
    mode: "commit" as const,
    tools: [],
    inbox: [] as Array<{ id: string; label: string; text: string }>,
    steering: [] as string[],
    hold: false,
    flushRest: false,
    asked: false,
    nudged: false,
    unexplained: false,
  };
  (kernel as any).agents.set("director", fake);
  return { fake: fake as any, calls };
}

describe("project.*", () => {
  test("recent 列出当前项目；forget 摘掉", async () => {
    expect(await kernel.handle("project.recent", {})).toContain(root);
    await kernel.handle("project.forget", { root });
    expect(await kernel.handle("project.recent", {})).not.toContain(root);
  });

  test("exportSeed 文件名带项目名与故事种子，内容以一级标题开头", async () => {
    const seed = await kernel.handle("project.exportSeed", {});
    expect(seed.filename).toContain("测试书");
    expect(seed.filename).toContain("故事种子");
    expect(seed.filename.endsWith(".md")).toBe(true);
    expect(seed.content.startsWith("# 故事种子 · 测试书")).toBe(true);
  });

  test("create 已存在路径抛错；open 非项目抛错", async () => {
    await expect(kernel.handle("project.create", { root, name: "重复" })).rejects.toThrow();
    await expect(kernel.handle("project.open", { root: path.join(os.tmpdir(), "ot-h-nope") })).rejects.toThrow();
  });
});

describe("doc.* / search", () => {
  const raw = "---\ntitle: 林尧\nsummary: 主角\nkeywords: []\nstatus: draft\ntier: 主角\n---\n\n## 一句话\n\n铁匠。\n";

  test("write 后 read 回全文；不存在的返回 null", async () => {
    await kernel.handle("doc.write", { kind: "characters", id: "林尧", raw });
    const doc = await kernel.handle("doc.read", { kind: "characters", id: "林尧" });
    expect(doc?.raw).toContain("## 一句话");
    expect(doc?.sections).toContain("一句话");
    expect(await kernel.handle("doc.read", { kind: "characters", id: "不存在的人" })).toBeNull();
  });

  test("非法 kind 抛错并列出可选", async () => {
    await expect(kernel.handle("doc.read", { kind: "不存在", id: "1" })).rejects.toThrow("未知的 kind");
  });

  test("doc.template 返回带 frontmatter 的空模板", async () => {
    const tpl = await kernel.handle("doc.template", { kind: "characters" });
    expect(tpl.startsWith("---\n")).toBe(true);
  });

  test("search.query 无命中返回空数组", async () => {
    expect(await kernel.handle("search.query", { query: "锟斤拷烫不存在" })).toEqual([]);
  });
});

describe("capabilities / roles", () => {
  test("capabilities.list 7 个；roles.list 9 个含主编", async () => {
    const caps = await kernel.handle("capabilities.list", {});
    expect(caps.map((c) => c.id).sort()).toEqual(["design", "draft", "interview", "outline", "recap", "review", "talk"]);
    const roles = await kernel.handle("roles.list", {});
    expect(roles).toHaveLength(9);
    expect(roles.find((r) => r.id === "director")?.label).toBe("主编");
  });

  test("capability.run 未知 id 与缺必填参数都抛错", async () => {
    await expect(kernel.handle("capability.run", { id: "nope" as any, params: {} })).rejects.toThrow("未知能力");
    await expect(kernel.handle("capability.run", { id: "draft", params: {} })).rejects.toThrow("缺参数");
  });

  test("capability.run 把渲染好的指令发给主编（锁 md 接线）", async () => {
    const { calls } = fakeLead(false);
    await kernel.handle("capability.run", { id: "draft", params: { chapter: "12" } });
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toContain("请写第 12 章正文");
  });
});

describe("approval / question 幽灵回执", () => {
  test("approval.reply 找不到也让 UI 撤卡，不抛错", async () => {
    await kernel.handle("approval.reply", { approvalId: "ghost", decision: "approve" });
    const ev = events.find((e) => e.type === "approval.resolved") as any;
    expect(ev?.approvalId).toBe("ghost");
  });

  test("question.reply 找不到也让 UI 撤卡，不抛错", async () => {
    await kernel.handle("question.reply", { questionId: "ghost", answer: "继续" });
    const ev = events.find((e) => e.type === "question.resolved") as any;
    expect(ev?.questionId).toBe("ghost");
  });
});

describe("chat.*", () => {
  test("sessionFile 主编返回路径；未知 agent 返回 null", async () => {
    const file = await kernel.handle("chat.sessionFile", {});
    expect(typeof file).toBe("string");
    expect(file).toContain("sessions");
    expect(await kernel.handle("chat.sessionFile", { agentId: "ghost" })).toBeNull();
  });

  test("clearQueue 空队列返回空 texts；发给未知 agent 抛错", async () => {
    expect(await kernel.handle("chat.clearQueue", {})).toEqual({ texts: [] });
    await expect(kernel.handle("chat.send", { text: "hi", agentId: "ghost" })).rejects.toThrow();
  });

  test("abort 运行中的主编：hold 住", async () => {
    const { fake } = fakeLead(true);
    fake.info.status = "running";
    await kernel.handle("chat.abort", {});
    expect(fake.hold).toBe(true);
  });
});

describe("cloud.* 无配置", () => {
  test("status 未配置；list/upload 无配置抛错", async () => {
    expect(await kernel.handle("cloud.status", {})).toEqual({ configured: false, url: null, bucket: null });
    await expect(kernel.handle("cloud.list", {})).rejects.toThrow("还没有配置云端存储");
    await expect(kernel.handle("cloud.upload", {})).rejects.toThrow("还没有配置云端存储");
  });
});

describe("restoreChildren 容错", () => {
  test("索引里未知 role 的记录被删掉，不炸", async () => {
    const store = (kernel as any).requireStore();
    await store.saveAgentRecord({ agentId: "bad-1", parentId: "director", role: "nope", label: "坏", task: "t", mode: "commit" });
    await kernel.handle("project.close", {});
    await kernel.handle("project.open", { root });
    const recs = await store.agentRecords();
    expect(recs.find((r: { agentId: string }) => r.agentId === "bad-1")).toBeUndefined();
  });
});

describe("forward 事件映射", () => {
  test("message_start/end：状态行不进正文", async () => {
    const { fake } = fakeLead(false);
    (kernel as any).forward(fake, {
      type: "message_start",
      message: { role: "assistant", content: [{ type: "text", text: "» 正在核对人物卡\n\n正文开始" }], timestamp: 1 },
    });
    const starts = events.filter((e) => e.type === "agent.event" && (e as any).event.type === "message_start");
    expect(starts).toHaveLength(1);
    expect(fake.streamingMessageId).not.toBeNull();
  });

  test("tool_execution_start ask_user 记 asked；end spawn_agents 成功记 unexplained", async () => {
    const { fake } = fakeLead(false);
    fake.streamingMessageId = "m1";
    (kernel as any).forward(fake, { type: "tool_execution_start", toolName: "ask_user", toolCallId: "t1", args: {} });
    expect(fake.asked).toBe(true);
    (kernel as any).forward(fake, { type: "tool_execution_end", toolName: "spawn_agents", toolCallId: "t1", result: { content: "结论" }, isError: false });
    expect(fake.unexplained).toBe(true);
    const ends = events.filter((e) => e.type === "agent.event" && (e as any).event.type === "tool_end");
    expect(ends).toHaveLength(1);
  });

  test("agent_end 触发 nudge：没问就停，补一句", async () => {
    const { fake, calls } = fakeLead(false);
    fake.info.status = "running";
    (kernel as any).forward(fake, { type: "agent_end" });
    expect(fake.nudged).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toContain("ask_user");
  });

  test("queue_update 同步已插入列表", async () => {
    const { fake } = fakeLead(false);
    (kernel as any).forward(fake, { type: "queue_update", steering: ["a", "b"] });
    expect(fake.steering).toEqual(["a", "b"]);
    expect(events.some((e) => e.type === "agent.event" && (e as any).event.type === "queue_update")).toBe(true);
  });
});
