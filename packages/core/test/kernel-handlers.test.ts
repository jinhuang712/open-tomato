import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Kernel } from "../src/agent/runtime.js";
import { stubPrompt, type KernelEvent } from "../src/protocol.js";
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

  test("作者手改落盘后交主编复核：带中文路径和 diff，桩标签是「作者手改」", async () => {
    await kernel.handle("doc.write", { kind: "characters", id: "林尧", raw });
    // 主编正跑着：这条排在这一轮之后送，不打断它正在做的事
    const { calls } = fakeLead(true);
    await kernel.handle("doc.write", { kind: "characters", id: "林尧", raw: raw.replace("铁匠。", "铁匠，左手缺一指。") });
    expect(calls).toHaveLength(1);
    const [text, opts] = calls[0]!;
    expect(text).toContain("⟦stub:作者手改⟧");
    expect(text).toContain("人物/林尧");
    expect(text).toContain("左手缺一指");
    expect(opts).toEqual({ streamingBehavior: "followUp" });
  });

  test("内容没变的落盘不惊动主编", async () => {
    await kernel.handle("doc.write", { kind: "characters", id: "林尧", raw });
    const { calls } = fakeLead(false);
    await kernel.handle("doc.write", { kind: "characters", id: "林尧", raw });
    expect(calls).toHaveLength(0);
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
  test("capabilities.list 15 个；roles.list 9 个含主编", async () => {
    const caps = await kernel.handle("capabilities.list", {});
    expect(caps.map((c) => c.id).sort()).toEqual([
      "but-therefore",
      "cool",
      "deeper-needs",
      "design",
      "draft",
      "fivewhy",
      "hook",
      "interview",
      "logline",
      "outline",
      "recap",
      "review",
      "seed",
      "show",
      "talk",
    ]);
    const roles = await kernel.handle("roles.list", {});
    expect(roles).toHaveLength(9);
    expect(roles.find((r) => r.id === "director")?.label).toBe("主编");
  });

  test("capability.run 未知 id 抛错，不惊动主编", async () => {
    const { fake, calls } = fakeLead(false);
    fake.hold = true;
    await expect(kernel.handle("capability.run", { id: "nope" as any })).rejects.toThrow("未知能力");
    expect(fake.hold).toBe(true);
    expect(calls).toHaveLength(0);
  });

  test("暂停后点击能力解除 hold，轮末继续取队列", async () => {
    const { fake, calls } = fakeLead(false);
    fake.info.status = "running";
    await kernel.handle("chat.pause", {});
    fake.inbox.push({ id: "queued", label: "排队", text: "下一项" });
    await kernel.handle("capability.run", { id: "draft" });
    expect(fake.hold).toBe(false);
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

  test("cancelQueued 找不到 agent / 找不到那一条都不报错；发给未知 agent 抛错", async () => {
    expect(await kernel.handle("chat.cancelQueued", { agentId: "ghost", id: "x" })).toBeNull();
    const { fake } = fakeLead(true);
    fake.inbox = [{ id: "a", label: "", text: "留着" }];
    expect(await kernel.handle("chat.cancelQueued", { id: "不存在" })).toBeNull();
    expect(fake.inbox.map((e: { id: string }) => e.id)).toEqual(["a"]);
    await expect(kernel.handle("chat.send", { text: "hi", agentId: "ghost" })).rejects.toThrow();
  });

  test("cancelQueued 只摘收件箱里那一条，pi 的队列一根手指都不碰", async () => {
    const { fake } = fakeLead(true);
    let touched = 0;
    fake.session.clearQueue = () => {
      touched++;
      return { steering: [stubPrompt("暂停", "请立刻收尾"), "作者插的话"], followUp: [] };
    };
    fake.inbox = [
      { id: "a", label: "批注1", text: stubPrompt("批注1", "这段改一下") },
      { id: "b", label: "", text: "苏晚的角色卡呢" },
    ];
    fake.steering = ["作者插的话"];
    await kernel.handle("chat.cancelQueued", { id: "a" });
    // 已交出去的撤不回，暂停请求也不该被顺手取消 —— 所以 pi 的队列不能倒
    expect(touched).toBe(0);
    expect(fake.steering).toEqual(["作者插的话"]);
    expect(fake.inbox.map((e: { id: string }) => e.id)).toEqual(["b"]);
  });

  test("abort 运行中的主编：hold 住", async () => {
    const { fake } = fakeLead(true);
    fake.info.status = "running";
    await kernel.handle("chat.abort", {});
    expect(fake.hold).toBe(true);
  });

  test("abort 先倒空 pi 队列再掐断：暂停桩丢掉，作者插的话退回收件箱", async () => {
    const { fake } = fakeLead(true);
    fake.info.status = "running";
    const order: string[] = [];
    fake.session.clearQueue = () => {
      order.push("clear");
      return { steering: [stubPrompt("暂停", "请立刻收尾"), "作者插的话"], followUp: ["作者排队的话"] };
    };
    fake.session.abort = async () => {
      order.push("abort");
    };
    fake.steering = ["x"];
    fake.flushRest = true;
    await kernel.handle("chat.abort", {});
    expect(order).toEqual(["clear", "abort"]);
    expect(fake.inbox.map((e: { text: string }) => e.text)).toEqual(["作者插的话", "作者排队的话"]);
    expect(fake.steering).toEqual([]);
    expect(fake.flushRest).toBe(false);
  });

  test("abort 指定子 agent：只碰那一个，主编不动", async () => {
    const { fake: lead } = fakeLead(true);
    lead.info.status = "running";
    let leadAborted = 0;
    lead.session.abort = async () => void leadAborted++;
    const { fake: child } = fakeLead(true);
    child.info.agentId = "child-1";
    child.info.parentId = "director";
    child.info.status = "running";
    let childAborted = 0;
    child.session.abort = async () => void childAborted++;
    (kernel as any).agents.set("director", lead);
    (kernel as any).agents.set("child-1", child);
    await kernel.handle("chat.abort", { agentId: "child-1" });
    expect(childAborted).toBe(1);
    expect(leadAborted).toBe(0);
    expect(child.hold).toBe(true);
    expect(lead.hold).toBe(false);
  });

  test("停止掐断在跑的子 agent：状态改成 interrupted，主编查得到它死了", async () => {
    const { fake: lead } = fakeLead(true);
    lead.info.status = "running";
    const { fake: child } = fakeLead(true);
    child.info.agentId = "child-1";
    child.info.parentId = "director";
    child.info.status = "running";
    (kernel as any).agents.set("director", lead);
    (kernel as any).agents.set("child-1", child);
    await kernel.handle("chat.abort", {});
    expect(child.info.status).toBe("interrupted");
    // 主编不是被打断的：它自己那轮的 agent_end 会把它带回 idle
    expect(lead.info.status).not.toBe("interrupted");
  });

  test("没在跑的子 agent 不被停止改状态：已交回的还是 done", async () => {
    const { fake: lead } = fakeLead(true);
    lead.info.status = "running";
    const { fake: child } = fakeLead(true);
    child.info.agentId = "child-2";
    child.info.parentId = "director";
    child.info.status = "done";
    (kernel as any).agents.set("director", lead);
    (kernel as any).agents.set("child-2", child);
    await kernel.handle("chat.abort", {});
    expect(child.info.status).toBe("done");
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

  test("作者答完 ask_user，同一轮里正文结尾又挂个问句：尾句直接挂开放卡，不叫模型回来重问", async () => {
    const { fake, calls } = fakeLead(false);
    fake.info.status = "running";
    (kernel as any).forward(fake, { type: "tool_execution_start", toolName: "ask_user", toolCallId: "t1", args: {} });
    (kernel as any).forward(fake, { type: "tool_execution_end", toolName: "ask_user", toolCallId: "t1", result: { content: "作者回答：并进去" }, isError: false });
    expect(fake.asked).toBe(false);
    // 作者答完，主编接着说了一段，结尾又是个问句，却没再调 ask_user
    fake.spoke = true;
    fake.tail = "地图线是并进入口战争线，还是单独立？";
    (kernel as any).forward(fake, { type: "agent_end" });
    // 没给模型发补问桩：历史保持干净，不多空转一轮
    expect(calls).toHaveLength(0);
    // 问题卡直接挂到门上：开放形态，问题原文来自尾句
    const asked = events.filter((e) => e.type === "question.requested");
    expect(asked).toHaveLength(1);
    const req = (asked[0] as any).request;
    expect(req.agentId).toBe("director");
    expect(req.kind).toBe("open");
    expect(req.text).toBe("地图线是并进入口战争线，还是单独立？");
    expect(fake.asked).toBe(true);
  });

  test("问答之前那段正文的问号不算悬空：规规矩矩问过了就不补", async () => {
    const { fake, calls } = fakeLead(false);
    fake.info.status = "running";
    // 主编正文结尾就是问句，但它规规矩矩调了 ask_user，作者也答了
    fake.spoke = true;
    fake.tail = "这三个方向你挑哪个？";
    (kernel as any).forward(fake, { type: "tool_execution_start", toolName: "ask_user", toolCallId: "t1", args: {} });
    (kernel as any).forward(fake, { type: "tool_execution_end", toolName: "ask_user", toolCallId: "t1", result: { content: "作者回答：第二个" }, isError: false });
    (kernel as any).forward(fake, { type: "agent_end" });
    expect(calls).toHaveLength(0);
  });

  test("agent_end 一个字没说也没动手：内核不补，也不再数空转", async () => {
    const { fake, calls } = fakeLead(false);
    fake.info.status = "running";
    for (let i = 0; i < 5; i++) (kernel as any).forward(fake, { type: "agent_end" });
    expect(calls).toHaveLength(0);
  });

  test("悬空问句的答案：当普通 followUp 喂回去，前缀与 ask_user 一致", async () => {
    const { fake, calls } = fakeLead(false);
    fake.info.status = "running";
    fake.spoke = true;
    fake.tail = "这三个方向你挑哪个？";
    (kernel as any).forward(fake, { type: "agent_end" });
    const asked = events.filter((e) => e.type === "question.requested");
    expect(asked).toHaveLength(1);
    const questionId = (asked[0] as any).request.questionId as string;
    (kernel as any).gate.resolveQuestion(questionId, "第二个");
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe("作者回答：第二个");
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
    expect(calls[0]![0]).toMatch(/^⟦stub:接着上次⟧\n恢复当前会话/);
    expect(calls[0]![0]).toContain("会话已重建");
    expect(calls[0]![0]).toContain("不包含新的选择、答案或执行授权");
  });

  test("chat.resume 送的是同一句「接着上次」", async () => {
    const { calls } = fakeLead(false);
    await kernel.handle("chat.resume", {});
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toMatch(/^⟦stub:接着上次⟧\n/);
  });

  for (const action of ["chat.continue", "chat.resume"] as const) {
    test(`${action} 恢复普通循环，保留可见回应兜底`, async () => {
      const { fake, calls } = fakeLead(false);
      fake.hold = true;
      await kernel.handle(action, {});
      expect(fake.hold).toBe(false);
      expect(calls).toHaveLength(1);
      expect(calls[0]![0]).toContain("不包含新的选择、答案或执行授权");
      // 送完这一句就结束：轮末内核不再补第二句
      (kernel as any).forward(fake, { type: "agent_end" });
      expect(calls).toHaveLength(1);
    });
  }

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
    ["talk", "聊一张卡：和作者一起探索人物"],
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

describe("agent.archive / agent.retire", () => {
  /** 往表里塞一个假的子 agent，并写一条索引，模拟它已经派过一轮 */
  async function fakeChild(status: "done" | "running" | "archived") {
    fakeLead(false);
    let disposed = 0;
    let unsubscribed = 0;
    const fake = {
      info: { agentId: "c1", parentId: "director", role: "writer", label: "写手", handle: "写手1", task: "写第一章", status, error: null, statusText: "" },
      session: { isStreaming: false, prompt: async () => {}, clearQueue: () => ({ steering: [], followUp: [] }), abort: async () => {}, dispose: () => void disposed++ },
      unsubscribe: () => void unsubscribed++,
      streamingMessageId: null, headBuffer: null, skipBlank: false, mode: "commit" as const, tools: [], inbox: [], steering: [], hold: false, flushRest: false, asked: false, nudged: false, pendingError: null,
    };
    (kernel as any).agents.set("c1", fake);
    const store: ProjectStore = (kernel as any).store;
    await store.saveAgentRecord({ agentId: "c1", parentId: "director", role: "writer", label: "写手", handle: "写手1", task: "写第一章", mode: "commit" });
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
    await expect(kernel.handle("agent.retire", { agentId: "director" })).rejects.toThrow("主编不能删除");
    await expect(kernel.handle("agent.retire", { agentId: "nope" })).rejects.toThrow("没有这个子 agent");
  });

  test("跑完的能封存：状态变 archived、索引记 archived、会话不动、表里还在", async () => {
    const { store, counts } = await fakeChild("done");
    await kernel.handle("agent.archive", { agentId: "c1" });
    expect((kernel as any).agents.get("c1").info.status).toBe("archived");
    expect(counts()).toEqual({ disposed: 0, unsubscribed: 0 });
    expect((await store.agentRecords()).find((r) => r.agentId === "c1")?.archived).toBe(true);
    expect(events.some((e) => e.type === "agent.status" && e.agentId === "c1" && e.status === "archived")).toBe(true);
    expect(events.some((e) => e.type === "agent.retired")).toBe(false);
  });

  test("在跑的不能封，封过的不能再封，主编不能封；封存后不能续派，但能删", async () => {
    await fakeChild("running");
    await expect(kernel.handle("agent.archive", { agentId: "c1" })).rejects.toThrow("还在跑");
    await expect(kernel.handle("agent.archive", { agentId: "director" })).rejects.toThrow("主编不能封存");
    const { store } = await fakeChild("archived");
    await expect(kernel.handle("agent.archive", { agentId: "c1" })).rejects.toThrow("已经封存");
    await expect((kernel as any).continueChild((kernel as any).resolveChild("写手1"), "再来", undefined, () => {})).rejects.toThrow("已封存");
    await kernel.handle("agent.retire", { agentId: "c1" });
    expect((kernel as any).agents.has("c1")).toBe(false);
    expect((await store.agentRecords()).find((r) => r.agentId === "c1")).toBeUndefined();
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

describe("循环接续", () => {
  test("说完一段话正常收尾：内核一句都不补，接不接下一件是主编自己的判断", () => {
    const { fake, calls } = fakeLead(false);
    (kernel as any).sendText(fake, "m1", "我的判断是……");
    expect((fake as any).spoke).toBe(true);
    (kernel as any).forward(fake, { type: "agent_end" });
    expect(calls).toHaveLength(0);
    (kernel as any).forward(fake, { type: "agent_start" });
    expect((fake as any).spoke).toBe(false);
  });

  test("作者按了暂停：轮末真停，一句都不补", () => {
    const { fake, calls } = fakeLead(false);
    fake.hold = true;
    (kernel as any).sendText(fake, "m1", "交代一下进展……");
    (kernel as any).forward(fake, { type: "agent_end" });
    expect(calls).toHaveLength(0);
  });

  test("调过工具照样不补：内核不数这一轮干没干活", () => {
    const { fake, calls } = fakeLead(false);
    (kernel as any).forward(fake, { type: "tool_execution_start", toolName: "project_overview", toolCallId: "t1", args: {} });
    (kernel as any).forward(fake, { type: "agent_end" });
    expect(calls).toHaveLength(0);
  });
  test("只有空白正文不算说过话", () => {
    const { fake } = fakeLead(false);
    (kernel as any).sendText(fake, "m1", "  \n");
    expect((fake as any).spoke).not.toBe(true);
  });
});
