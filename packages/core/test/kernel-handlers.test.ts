import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Kernel } from "../src/agent/runtime.js";
import type { KernelEvent } from "../src/protocol.js";
import { fakeSessionFactory } from "./fake-session.js";
import { ProjectStore } from "../src/project/store.js";

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
  kernel = new Kernel(
    home,
    (e) => {
      events.push(e);
    },
    { sessionFactory: fakeSessionFactory().factory },
  );
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
  };
  (kernel as any).agents.set("director", fake);
  return { fake: fake as any, calls };
}

describe("project.*", () => {
  test("没模型时开项目不建主编，材料照常可读；模型到位后作者首次开口才补建", async () => {
    const other = await fs.mkdtemp(path.join(os.tmpdir(), "ot-h-proj3-"));
    await fs.rm(other, { recursive: true, force: true });
    let hasModel = false;
    const { factory, created } = fakeSessionFactory({ ready: () => hasModel });
    const evs: KernelEvent[] = [];
    const k = new Kernel(home, (e) => evs.push(e), { sessionFactory: factory });
    await k.init("test");
    try {
      await k.handle("project.create", { root: other, name: "无模型" });
      expect(created.length).toBe(0);
      expect(evs.some((e) => e.type === "project.opened")).toBe(true);
      expect(evs.some((e) => e.type === "agent.status")).toBe(false);
      // 主编不在，材料层不受影响
      const tpl = await k.handle("doc.template", { kind: "characters" });
      expect(typeof tpl).toBe("string");
      await expect(k.handle("chat.send", { text: "在吗" })).rejects.toThrow("主编还没就位");
      hasModel = true;
      await k.handle("chat.send", { text: "在吗" });
      expect(created.length).toBe(1);
      expect(created[0]!.cwd).toBe(other);
    } finally {
      await k.dispose().catch(() => {});
      await fs.rm(other, { recursive: true, force: true });
    }
  });

  test("建项目走注入的会话工厂：主编会话在项目目录下建，不碰真模型", async () => {
    const other = await fs.mkdtemp(path.join(os.tmpdir(), "ot-h-proj2-"));
    await fs.rm(other, { recursive: true, force: true });
    const { factory, created } = fakeSessionFactory();
    const k = new Kernel(home, () => {}, { sessionFactory: factory });
    await k.init("test");
    try {
      await k.handle("project.create", { root: other, name: "另一本" });
      expect(created.length).toBe(1);
      expect(created[0]!.cwd).toBe(other);
      expect(created[0]!.tools.map((t) => t.name)).toContain("write_doc");
    } finally {
      await k.dispose().catch(() => {});
      await fs.rm(other, { recursive: true, force: true });
    }
  });

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

  test("capability.run 未知 id 抛错，不惊动主编", async () => {
    const { fake, calls } = fakeLead(false);
    fake.hold = true;
    fake.nudged = true;
    await expect(kernel.handle("capability.run", { id: "nope" as any })).rejects.toThrow("未知能力");
    expect(fake.hold).toBe(true);
    expect(fake.nudged).toBe(true);
    expect(calls).toHaveLength(0);
  });

  test("暂停后点击能力解除 hold、重置 nudge，轮末继续取队列", async () => {
    const { fake, calls } = fakeLead(false);
    fake.info.status = "running";
    await kernel.handle("chat.pause", {});
    fake.nudged = true;
    fake.inbox.push({ id: "queued", label: "排队", text: "下一项" });
    await kernel.handle("capability.run", { id: "draft" });
    expect(fake.hold).toBe(false);
    expect(fake.nudged).toBe(false);
    (kernel as any).forward(fake, { type: "agent_end" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(calls.at(-1)?.[0]).toBe("下一项");
    expect(fake.inbox).toHaveLength(0);
  });

  test("capability.run 以作者身份把能力正文送给主编（锁 md 接线）", async () => {
    const { calls } = fakeLead(false);
    await kernel.handle("capability.run", { id: "draft" });
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toContain("作者点了「章节写作」");
    expect(calls[0]![0]).toContain("章节写作：派写手按章纲写一章正文");
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

  test("tool_execution_start ask_user 记 asked；tool_execution_end 转发 tool_end", async () => {
    const { fake } = fakeLead(false);
    fake.streamingMessageId = "m1";
    (kernel as any).forward(fake, { type: "tool_execution_start", toolName: "ask_user", toolCallId: "t1", args: {} });
    expect(fake.asked).toBe(true);
    (kernel as any).forward(fake, { type: "tool_execution_end", toolName: "spawn_agents", toolCallId: "t1", result: { content: "结论" }, isError: false });
    const ends = events.filter((e) => e.type === "agent.event" && (e as any).event.type === "tool_end");
    expect(ends).toHaveLength(1);
  });

  test("agent_end 触发 nudge：没问就停，补一句", async () => {
    const { fake, calls } = fakeLead(false);
    fake.info.status = "running";
    (kernel as any).forward(fake, { type: "agent_end" });
    expect(fake.nudged).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toContain("可见回应");
  });

  test("queue_update 同步已插入列表", async () => {
    const { fake } = fakeLead(false);
    (kernel as any).forward(fake, { type: "queue_update", steering: ["a", "b"] });
    expect(fake.steering).toEqual(["a", "b"]);
    expect(events.some((e) => e.type === "agent.event" && (e as any).event.type === "queue_update")).toBe(true);
  });
});

describe("models.*", () => {
  test("list 返回 providers/models/current 形态", async () => {
    const s = await kernel.handle("models.list", {});
    expect(s.providers.length).toBeGreaterThan(0);
    expect(s.models.length).toBeGreaterThan(0);
    expect(s.current).not.toBeNull();
  });

  test("OpenAI 目录包含 GPT-6 Astra", async () => {
    const s = await kernel.handle("models.list", {});
    expect(s.models.find((m) => m.provider === "openai" && m.id === "gpt-6-astra")).toMatchObject({
      name: "GPT-6 Astra",
      reasoning: true,
      contextWindow: 272000,
    });
  });

  test("select 不存在的模型抛错；切真实存在的模型换 current 并广播", async () => {
    await expect(kernel.handle("models.select", { provider: "nope", id: "nope" })).rejects.toThrow("没有这个模型");
    const s = await kernel.handle("models.list", {});
    const target = s.models.find((m) => m.available && `${m.provider}/${m.id}` !== `${s.current?.provider}/${s.current?.id}`)!;
    expect(target).toBeDefined();
    events.length = 0;
    const next = await kernel.handle("models.select", { provider: target.provider, id: target.id });
    expect(next.current).toEqual({ provider: target.provider, id: target.id });
    const st = events.filter((e) => e.type === "models.state").at(-1) as any;
    expect(st?.state.current).toEqual({ provider: target.provider, id: target.id });
  });

  test("主编上一轮被模型跑死：切模型后自动送「接着上次」，空闲时切不打扰", async () => {
    const s = await kernel.handle("models.list", {});
    const target = s.models.find((m) => m.available)!;
    const { fake, calls } = fakeLead(false);
    fake.session.setModel = async () => {};
    fake.session.setThinkingLevel = () => {};
    await kernel.handle("models.select", { provider: target.provider, id: target.id });
    expect(calls).toHaveLength(0);
    fake.info.status = "error";
    fake.info.error = "404 <!DOCTYPE html>";
    await kernel.handle("models.select", { provider: target.provider, id: target.id });
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toMatch(/^⟦stub:接着上次⟧\n上次会话被打断了/);
    expect(fake.nudged).toBe(true);
  });

  test("chat.resume 送的是同一句「接着上次」", async () => {
    const { calls } = fakeLead(false);
    await kernel.handle("chat.resume", {});
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toMatch(/^⟦stub:接着上次⟧\n/);
  });

  test("setApiKey 空 key 抛错，不碰网络", async () => {
    await expect(kernel.handle("models.setApiKey", { provider: "openai", apiKey: "  " })).rejects.toThrow("API key 为空");
  });
});

describe("chat / doc 剩余分支", () => {
  test("insert 幽灵 id 返回 null，不抛错", async () => {
    expect(await kernel.handle("chat.insert", { id: "ghost" })).toBeNull();
  });

  test("doc.write expectBefore 对不上：写入作废", async () => {
    const raw = "---\ntitle: 林尧\nsummary: 主角\nkeywords: []\nstatus: draft\ntier: 主角\n---\n\n## 一句话\n\n铁匠。\n";
    await kernel.handle("doc.write", { kind: "characters", id: "林尧", raw });
    await expect(kernel.handle("doc.write", { kind: "characters", id: "林尧", raw: `${raw}多一行。\n`, expectBefore: "过期内容" })).rejects.toThrow("作废");
  });
});

describe("capability 全流程", () => {
  test.each([
    ["talk", "聊一张卡：和作者边聊边把一个人物"],
    ["design", "卡片设计：派策划创作"],
    ["outline", "大纲编排：派编剧编排"],
    ["review", "多路审稿：多路只读评审看一章"],
    ["recap", "卷末盘点：一卷写完"],
  ])("%s 正文送给主编，范围由主编看盘面定", async (id, phrase) => {
    const { calls } = fakeLead(false);
    await kernel.handle("capability.run", { id: id as any });
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toContain(phrase);
    expect(calls[0]![0]).toContain("由盘面");
  });
});

describe("agent.retire", () => {
  /** 往表里塞一个假的子 agent，并写一条索引，模拟它已经派过一轮 */
  async function fakeChild(status: "done" | "running") {
    fakeLead(false);
    let disposed = 0;
    let unsubscribed = 0;
    const fake = {
      info: { agentId: "c1", parentId: "director", role: "writer", label: "写手", task: "写第一章", status, error: null, statusText: "" },
      session: { isStreaming: false, prompt: async () => {}, clearQueue: () => ({ steering: [], followUp: [] }), abort: async () => {}, dispose: () => void disposed++ },
      unsubscribe: () => void unsubscribed++,
      streamingMessageId: null, headBuffer: null, skipBlank: false, mode: "commit" as const, tools: [], inbox: [], steering: [], hold: false, flushRest: false, asked: false, nudged: false, pendingError: null,
    };
    (kernel as any).agents.set("c1", fake);
    const store: ProjectStore = (kernel as any).store;
    await store.saveAgentRecord({ agentId: "c1", parentId: "director", role: "writer", label: "写手", task: "写第一章", mode: "commit" });
    return { store, counts: () => ({ disposed, unsubscribed }) };
  }

  test("跑完的能退：摘表、释放会话、删索引、发 agent.retired", async () => {
    const { store, counts } = await fakeChild("done");
    await kernel.handle("agent.retire", { agentId: "c1" });
    expect((kernel as any).agents.has("c1")).toBe(false);
    expect(counts()).toEqual({ disposed: 1, unsubscribed: 1 });
    expect((await store.agentRecords()).find((r) => r.agentId === "c1")).toBeUndefined();
    expect(events.some((e) => e.type === "agent.retired" && e.agentId === "c1")).toBe(true);
  });

  test("在跑的不能退，主编不能退，不存在的报错", async () => {
    const { store } = await fakeChild("running");
    await expect(kernel.handle("agent.retire", { agentId: "c1" })).rejects.toThrow("还在跑");
    expect((kernel as any).agents.has("c1")).toBe(true);
    expect((await store.agentRecords()).some((r) => r.agentId === "c1")).toBe(true);
    await expect(kernel.handle("agent.retire", { agentId: "director" })).rejects.toThrow("主编不能退场");
    await expect(kernel.handle("agent.retire", { agentId: "nope" })).rejects.toThrow("没有这个子 agent");
  });
});

describe("cloud.download replace", () => {
  test("覆盖当前项目：先关后下，重开后是新项目", async () => {
    const root2 = await fs.mkdtemp(path.join(os.tmpdir(), "ot-h-proj2-"));
    try {
      await ProjectStore.create(root2, "第二本书");
      (kernel as any).clouds.requireCloud = () => ({ download: async () => ({ root: root2 }) });
      events.length = 0;
      const info = await kernel.handle("cloud.download", { slug: "x", dest: root, replace: true });
      expect(info.name).toBe("第二本书");
      const types = events.map((e) => e.type);
      expect(types.indexOf("project.closed")).toBeLessThan(types.lastIndexOf("project.opened"));
    } finally {
      await fs.rm(root2, { recursive: true, force: true });
    }
  });
});

describe("自然对话收尾", () => {
  for (const toolName of ["say", "ask_user"]) {
    test(`${toolName} 非空表达清除报告，收尾不追问`, () => {
      const { fake, calls } = fakeLead(false);
      (fake as any).unrelayed = ["策划"];
      (kernel as any).forward(fake, { type: "tool_execution_start", toolName, toolCallId: "speech", args: { text: "判断", say: "解释" } });
      expect((fake as any).spoke).toBe(true);
      expect((fake as any).unrelayed).toEqual([]);
      (kernel as any).forward(fake, { type: "agent_end" });
      expect(calls).toHaveLength(0);
      (kernel as any).forward(fake, { type: "agent_start" });
      expect((fake as any).spoke).toBe(false);
    });
    test(`${toolName} 空白表达不清除报告`, () => {
      const { fake } = fakeLead(false);
      (fake as any).unrelayed = ["策划"];
      (kernel as any).forward(fake, { type: "tool_execution_start", toolName, toolCallId: "blank", args: { text: "  ", say: "  " } });
      expect((fake as any).spoke).not.toBe(true);
      expect((fake as any).unrelayed).toEqual(["策划"]);
    });
  }
});
