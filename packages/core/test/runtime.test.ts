import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Kernel } from "../src/agent/runtime.js";
import type { KernelEvent } from "../src/protocol.js";
import { stubPrompt } from "../src/protocol.js";
import { fakeSessionFactory } from "./fake-session.js";

let home: string;
let root: string;
let kernel: Kernel;
let events: KernelEvent[];

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), "ot-home-"));
  root = await fs.mkdtemp(path.join(os.tmpdir(), "ot-proj-"));
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
      info: { agentId: "child-1", role: "designer", label: "策划", handle: "策划1" },
    };
    const slot = { agentId: "child-1", role: "designer", label: "策划", handle: "策划1", task: "t", status: "running", error: null };
    const roster = { touch: () => {} };
    const out = await (kernel as any).promptChild(fake, "任务", slot, roster);
    expect(out).toContain(notice);
    expect(out).toContain("## 策划1");
    expect(out).not.toContain("child-1");
    expect(out).toContain("三个主角方向如下……");
  });
});

describe("子 agent 的名字", () => {
  test("同角色按序号排，号只增不减", () => {
    const k = kernel as any;
    expect(k.nextHandle("designer")).toBe("策划1");
    expect(k.nextHandle("designer")).toBe("策划2");
    expect(k.nextHandle("writer")).toBe("写手1");
    // 接回上次的会话：号抬到已用过的最大值，新派的不撞名
    k.noteHandle("writer", "写手4");
    expect(k.nextHandle("writer")).toBe("写手5");
  });

  test("按名字认人，旧会话里的 uuid 也认；认不出的报错带在场名单", () => {
    const k = kernel as any;
    k.agents.set("2f9c-uuid", { info: { agentId: "2f9c-uuid", role: "designer", label: "策划", handle: "策划1" } });
    expect(k.resolveChild("策划1").info.agentId).toBe("2f9c-uuid");
    expect(k.resolveChild(" 2f9c-uuid ").info.agentId).toBe("2f9c-uuid");
    expect(() => k.resolveChild("写手1")).toThrow("在场的是 策划1");
  });
});

describe("派单不阻塞主编", () => {
  function fakeLead(isStreaming: boolean, hold = false) {
    const calls: string[] = [];
    const fake = {
      info: { agentId: "director", parentId: null, role: "director", label: "主编", task: "", status: "running", error: null, statusText: "" },
      session: { isStreaming, prompt: async (t: string) => void calls.push(t), abort: async () => {}, dispose: () => {} },
      unsubscribe: () => {},
      mode: "commit" as const,
      tools: [],
      inbox: [] as Array<{ id: string; label: string; text: string }>,
      steering: [] as string[],
      hold,
      flushRest: false,
    };
    (kernel as any).agents.set("director", fake);
    return { fake, calls };
  }

  test("spawn 立刻返回名册，子 agent 跑完后报告进主编收件箱", async () => {
    const { fake, calls } = fakeLead(true);
    let finish!: (s: string) => void;
    (kernel as any).runChild = async (_p: string, task: { role: string }, slots: unknown[]) => {
      slots.push({ agentId: "c1", role: task.role, label: "策划", handle: "策划1", task: "t", status: "running", error: null });
      return { handle: "策划1", report: await new Promise<string>((r) => (finish = r)) };
    };
    const progress: string[] = [];
    const result = await (kernel as any).spawn("director", [{ role: "designer", task: "t" }], (t: string) => progress.push(t));
    expect(result.text).toContain("- 策划1：t");
    expect(result.text).not.toContain("c1");
    expect(result.details.slots.map((s: { agentId: string }) => s.agentId)).toEqual(["c1"]);
    expect(fake.inbox).toEqual([]);

    finish("## 策划1\n\n三个候选");
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toEqual([]);
    expect(fake.inbox.map((e) => e.label)).toEqual(["策划1交回"]);
    expect(fake.inbox[0]!.text).toContain("三个候选");
  });

  test("主编空着：报告直接送进去开新一轮，是谁交的写在标签上", () => {
    const { fake, calls } = fakeLead(false);
    (kernel as any).deliverReport("director", "策划1", "报告正文");
    expect(fake.inbox).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("报告正文");
    expect(calls[0]).toContain("策划1交回");
  });

  test("主编暂停中：报告进收件箱等作者开口，收件箱那条带名字标签", () => {
    const { fake, calls } = fakeLead(false, true);
    (kernel as any).deliverReport("director", "策划1", "报告正文");
    expect(calls).toEqual([]);
    expect(fake.inbox.map((e) => e.label)).toEqual(["策划1交回"]);
  });

  test("收件箱里的报告轮末送出去", async () => {
    const { fake, calls } = fakeLead(false);
    fake.inbox.push({ id: "r1", label: "策划1交回", text: "报告" });
    (kernel as any).flushInbox(fake);
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toHaveLength(1);
  });

  test("同角色的两位各自交回，报告正文完整传递", () => {
    const { calls } = fakeLead(false);
    const report = "方案依据与取舍\n".repeat(3000);
    (kernel as any).deliverReport("director", "策划1", report);
    (kernel as any).deliverReport("director", "策划2", "第二份报告");
    expect(calls[0]).toContain("策划1交回");
    expect(calls[0]).toContain(report);
    expect(calls[1]).toContain("策划2交回");
  });

  test("派单人已不在：报告丢弃不报错", () => {
    (kernel as any).agents.delete("director");
    expect(() => (kernel as any).deliverReport("director", "策划1", "x")).not.toThrow();
  });
});

describe("派单方式随 agent 广播", () => {
  test("setMode 改了就发 agent.mode，没变不发", () => {
    const fake = {
      info: { agentId: "c2", parentId: "director", role: "designer", label: "策划", status: "done", error: null, statusText: "", mode: "commit" },
      session: { setActiveToolsByName: () => {} },
      mode: "commit",
      tools: ["write_doc", "read_doc"],
    };
    (kernel as any).agents.set("c2", fake);
    (kernel as any).setMode(fake, "propose");
    (kernel as any).setMode(fake, "propose");
    const modes = events.filter((e) => e.type === "agent.mode");
    expect(modes).toEqual([{ type: "agent.mode", agentId: "c2", mode: "propose" }]);
    expect(fake.info.mode).toBe("propose");
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
  const queueUpdates = () => events.filter((e) => e.type === "agent.event" && (e as any).event.type === "queue_update");
  const queueEvents = () => queueUpdates().map((e) => (e as any).event.items as Array<{ label: string; text: string; inserted: boolean }>);
  const queueHold = () => queueUpdates().map((e) => (e as any).event.hold as boolean);

  test("排队进收件箱不打断；批注带自己的标签，普通一句话没有标签；打断立刻 steer", async () => {
    const { fake, calls } = fakeLead(true);
    await kernel.handle("chat.send", { text: "先把配角补一张", deliverAs: "followUp" });
    await kernel.handle("chat.send", { text: "⟦stub:批注1⟧\n[批注 正文/0001]\n> 他推门进来\n太急", deliverAs: "followUp" });
    expect(calls).toEqual([]);
    // 什么时候送由分组标题说，所以普通一句话不再挂「排队」这个标签
    expect(fake.inbox.map((e) => e.label)).toEqual(["", "批注1"]);
    expect(queueEvents().at(-1)?.map((i) => `${i.label}:${i.inserted}`)).toEqual([":false", "批注1:false"]);

    await kernel.handle("chat.insert", { id: fake.inbox[0]!.id });
    expect(calls).toEqual([["先把配角补一张", { streamingBehavior: "steer" }]]);
    expect(fake.inbox.map((e) => e.label)).toEqual(["批注1"]);
  });

  test("单条取消：只从收件箱摘掉那一条，别人不动", async () => {
    const { fake, calls } = fakeLead(true);
    await kernel.handle("chat.send", { text: "先把配角补一张", deliverAs: "followUp" });
    await kernel.handle("chat.send", { text: "苏晚的角色卡呢", deliverAs: "followUp" });
    await kernel.handle("chat.cancelQueued", { id: fake.inbox[0]!.id });
    expect(fake.inbox.map((e) => e.text)).toEqual(["苏晚的角色卡呢"]);
    // 取消不发出去任何东西，也不落回输入框
    expect(calls).toEqual([]);
    expect(queueEvents().at(-1)?.length).toBe(1);
  });

  test("子 agent 交回的报告不占作者队列的一行，他也撤不掉、插不动", async () => {
    const { fake, calls } = fakeLead(true);
    await kernel.handle("chat.send", { text: "苏晚的角色卡呢", deliverAs: "followUp" });
    (kernel as any).deliverReport("director", "策划4", "## 策划4\n\n全线按博弈细节向加详完了");
    // 报告和作者的话同在一个收件箱，轮末一并送
    expect(fake.inbox.map((e) => e.label)).toEqual(["", "策划4交回"]);
    // 但队列条是作者的话在哪儿等着，报告不是他说的，不该占一行
    expect(queueEvents().at(-1)?.map((i) => i.text)).toEqual(["苏晚的角色卡呢"]);

    // 就算拿着报告那条的 id 来，也动不了它：撤掉等于主编永远读不到这份活儿
    const reportId = fake.inbox[1]!.id;
    await kernel.handle("chat.cancelQueued", { id: reportId });
    await kernel.handle("chat.insert", { id: reportId });
    expect(fake.inbox.map((e) => e.label)).toEqual(["", "策划4交回"]);
    expect(calls).toEqual([]);
  });

  test("queue_update 带 hold；暂停桩不占作者队列的一行", async () => {
    const { fake } = fakeLead(true);
    await kernel.handle("chat.send", { text: "苏晚的角色卡呢", deliverAs: "followUp" });
    expect(queueHold().at(-1)).toBe(false);

    // pi 的 steering 队列里既有作者插过的话，也有内核合成的暂停桩
    fake.steering = [stubPrompt("暂停", "请立刻收尾"), "第二章那段对白太长了"];
    fake.hold = true;
    (kernel as any).emitQueue(fake);
    expect(queueHold().at(-1)).toBe(true);
    expect(queueEvents().at(-1)?.map((i) => `${i.text}:${i.inserted}`)).toEqual([
      "第二章那段对白太长了:true",
      "苏晚的角色卡呢:false",
    ]);
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

  test("封存过的子 agent 重开项目接回来仍是 archived", async () => {
    const store = (kernel as any).requireStore();
    await store.saveAgentRecord({ ...rec, archived: true });
    await kernel.handle("project.close", {});
    events.length = 0;
    await kernel.handle("project.open", { root });
    const spawned = events.filter((e) => e.type === "agent.spawned") as Array<{ type: "agent.spawned"; agent: { agentId: string; status: string } }>;
    expect(spawned.find((e) => e.agent.agentId === "child-9")?.agent.status).toBe("archived");
  });

  /** 报告的回路是内存里一个 Promise，进程一没就断了。索引上这一笔是唯一能证明它交回过的东西 */
  const reopenStatus = async (rec2: Record<string, unknown>) => {
    const store = (kernel as any).requireStore();
    await store.saveAgentRecord(rec2);
    await kernel.handle("project.close", {});
    events.length = 0;
    await kernel.handle("project.open", { root });
    const spawned = events.filter((e) => e.type === "agent.spawned") as Array<{ type: "agent.spawned"; agent: { agentId: string; status: string } }>;
    return spawned.find((e) => e.agent.agentId === "child-9")?.agent.status;
  };

  test("派出去还没交回就被杀的，接回来是 interrupted，不是 done", async () => {
    expect(await reopenStatus({ ...rec, reported: false })).toBe("interrupted");
  });

  test("交回过报告的接回来是 done", async () => {
    expect(await reopenStatus({ ...rec, reported: true })).toBe("done");
  });

  test("旧索引没有这个字段：按交回过算，不冤枉它", async () => {
    expect(await reopenStatus({ ...rec })).toBe("done");
  });

  test("封存优先于被打断：封存过的就算没交回也还是 archived", async () => {
    expect(await reopenStatus({ ...rec, reported: false, archived: true })).toBe("archived");
  });

  test("promptChild 出了结论就在索引上落 reported，成功和失败都算交回", async () => {
    const store = (kernel as any).requireStore();
    const roster = { touch: () => {} };
    const slot = { agentId: "child-9", role: "designer", label: "策划", handle: "策划1", task: "t", status: "running", error: null };
    const live = (ok: boolean) => ({
      session: { prompt: async () => { if (!ok) throw new Error("被停了"); }, abort: async () => {}, messages: [{ role: "assistant", content: [{ type: "text", text: "结论" }] }] },
      info: { agentId: "child-9", role: "designer", label: "策划", handle: "策划1" },
    });
    const reported = async () => (await store.agentRecords()).find((r: { agentId: string }) => r.agentId === "child-9")?.reported;

    await store.saveAgentRecord({ ...rec, reported: false });
    await (kernel as any).promptChild(live(true), "任务", slot, roster);
    expect(await reported()).toBe(true);

    await store.saveAgentRecord({ ...rec, reported: false });
    await (kernel as any).promptChild(live(false), "任务", slot, roster);
    expect(await reported()).toBe(true);
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

describe("ephemeral 一次性子 agent", () => {
  const slotOf = (slots: unknown[]) => (slots[0] as { agentId: string; handle: string }).agentId;

  test("runChild 不落盘、不进索引，报告照常交回，状态是 done", async () => {
    const k = kernel as any;
    const store = k.requireStore();
    const slots: unknown[] = [];
    const { handle, report } = await k.runChild("director", { role: "proofreader", task: "看一章", ephemeral: true }, slots, { touch: () => {} });
    expect(handle).toBe("校对1");
    expect(report).toContain("## 校对1");
    const agentId = slotOf(slots);
    expect(k.ephemeralAgents.has(agentId)).toBe(true);
    expect(k.agents.get(agentId).info.status).toBe("done");
    expect(await store.agentRecords()).toEqual([]);
    expect(await fs.stat(store.agentSessionDir(agentId)).catch(() => null)).toBeNull();
  });

  test("spawn 名册给一次性标出来", async () => {
    const k = kernel as any;
    const result = await k.spawn("director", [{ role: "proofreader", task: "看一章", ephemeral: true }], () => {});
    expect(result.text).toContain("校对1");
    expect(result.text).toContain("一次性，交回即焚");
  });

  test("一次性的不能 continue_agent，要接着做就重派", async () => {
    const k = kernel as any;
    const slots: unknown[] = [];
    await k.runChild("director", { role: "proofreader", task: "看一章", ephemeral: true }, slots, { touch: () => {} });
    const live = k.resolveChild("校对1");
    await expect(k.continueChild(live, "再看", undefined, () => {})).rejects.toThrow("一次性");
  });

  test("一次性的能封存：只改内存状态，不写索引", async () => {
    const k = kernel as any;
    const store = k.requireStore();
    const slots: unknown[] = [];
    await k.runChild("director", { role: "proofreader", task: "看一章", ephemeral: true }, slots, { touch: () => {} });
    await k.archiveChild(slotOf(slots));
    expect(k.agents.get(slotOf(slots)).info.status).toBe("archived");
    expect(await store.agentRecords()).toEqual([]);
  });

  test("spawn_agents 工具透传 ephemeral，不传就不带", async () => {
    const { makeSpawnAgentsTool } = await import("../src/agent/tools/spawn-agents.js");
    const store = (kernel as any).requireStore();
    await store.write("manuscript", "1", "---\ntitle: 第一章\nsummary: 开场\nkeywords: []\nstatus: draft\nwords: 0\nrevision: 0\n---\n\n正文。\n");
    const seen: unknown[] = [];
    const tool = makeSpawnAgentsTool({ store, spawn: async (tasks: unknown) => { seen.push(tasks); return { text: "ok", details: { slots: [] } }; } } as any);
    const exec = tool.execute as any;
    await exec("t1", { tasks: [{ role: "proofreader", task: "t", ephemeral: true }] }, new AbortController().signal, undefined);
    expect(seen).toEqual([[{ role: "proofreader", task: "t", ephemeral: true }]]);
    await exec("t2", { tasks: [{ role: "proofreader", task: "t" }] }, new AbortController().signal, undefined);
    expect(seen[1]).toEqual([{ role: "proofreader", task: "t" }]);
  });
});

describe("fork 转交进首条消息", () => {
  test("全文包进新会话首条提示，工具结果剥掉，任务书置顶在最后", async () => {
    const prompts: string[] = [];
    const f = fakeSessionFactory({ onPrompt: (t) => prompts.push(t) });
    const home2 = await fs.mkdtemp(path.join(os.tmpdir(), "ot-home-"));
    const root2 = await fs.mkdtemp(path.join(os.tmpdir(), "ot-proj-"));
    await fs.rm(root2, { recursive: true, force: true });
    const k2 = new Kernel(home2, () => {}, { sessionFactory: f.factory });
    try {
      await k2.init("test");
      await k2.handle("project.create", { root: root2, name: "b" });
      const kk = k2 as any;
      kk.agents.set("director", {
        info: { agentId: "director", parentId: null, role: "director", label: "主编", handle: "主编", task: "", status: "idle", error: null, statusText: "", mode: "commit" },
        session: {
          sessionManager: {
            getBranch: () => [
              { type: "message", id: "m1", parentId: null, timestamp: "", message: { role: "user", content: "陈默要更痞一点" } },
              { type: "message", id: "m2", parentId: "m1", timestamp: "", message: { role: "assistant", content: "好，语音签名加黑话" } },
              { type: "message", id: "m3", parentId: "m2", timestamp: "", message: { role: "toolResult", toolCallId: "t", toolName: "read_doc", content: "文档全文……" } },
            ],
          },
        },
        unsubscribe: () => {}, streamingMessageId: null, headBuffer: null, skipBlank: false, mode: "commit", tools: [],
        inbox: [], steering: [], hold: false, flushRest: false, asked: false, pendingError: null,
      });
      await kk.runChild("director", { role: "designer", task: "落人物卡陈默", fork: true }, [], { touch: () => {} });
      const first = prompts[0] ?? "";
      expect(first).toContain("陈默要更痞一点");
      expect(first).toContain("语音签名加黑话");
      expect(first).not.toContain("文档全文……");
      expect(first).toContain("本次任务：落人物卡陈默");
    } finally {
      await k2.dispose().catch(() => {});
      await fs.rm(home2, { recursive: true, force: true });
      await fs.rm(root2, { recursive: true, force: true });
    }
  });

  test("派单人会话不在就派单失败，不静默吞掉", async () => {
    const k = kernel as any;
    const slots: unknown[] = [];
    const roster = { touch: () => {} };
    const { report } = await k.runChild("nobody", { role: "designer", task: "t", fork: true }, slots, roster);
    expect(report).toContain("派单失败");
  });
});

describe("spawn 预检", () => {
  const BRIEF = "---\ntitle: 简介\nsummary: 立项\nkeywords: []\nstatus: draft\n---\n\n## 一句话故事\n\n有人要什么\n";
  const CHAPTER = "---\ntitle: 第一章\nsummary: 开场\nkeywords: []\nstatus: draft\nvolume: '01'\ncharacters: []\n---\n\n## 本章目标\n\n活。\n";
  const MANUSCRIPT = "---\ntitle: 第一章\nsummary: 开场\nkeywords: []\nstatus: draft\nwords: 0\nrevision: 0\n---\n\n正文。\n";

  async function spawnTool() {
    const { makeSpawnAgentsTool } = await import("../src/agent/tools/spawn-agents.js");
    const store = (kernel as any).requireStore();
    const seen: unknown[] = [];
    const tool = makeSpawnAgentsTool({ store, spawn: async (tasks: unknown) => { seen.push(tasks); return { text: "ok", details: { slots: [] } }; } } as any);
    return { exec: tool.execute as any, seen };
  }

  test("写手没章纲可依：直接拒，指回大纲编排", async () => {
    const store = (kernel as any).requireStore();
    await store.write("brief", "简介", BRIEF);
    const { exec, seen } = await spawnTool();
    await expect(exec("t1", { tasks: [{ role: "writer", task: "写第一章" }] }, new AbortController().signal, undefined)).rejects.toThrow("还没有章纲");
    expect(seen).toEqual([]);
  });

  test("评审没正文可审：直接拒", async () => {
    const { exec, seen } = await spawnTool();
    await expect(exec("t1", { tasks: [{ role: "proofreader", task: "看第一章" }] }, new AbortController().signal, undefined)).rejects.toThrow("还没有正文可审");
    expect(seen).toEqual([]);
  });

  test("材料齐了就放行，不拦", async () => {
    const store = (kernel as any).requireStore();
    await store.write("brief", "简介", BRIEF);
    await store.write("chapters", "1", CHAPTER);
    await store.write("manuscript", "1", MANUSCRIPT);
    const { exec, seen } = await spawnTool();
    await exec("t1", { tasks: [{ role: "writer", task: "写第一章" }, { role: "proofreader", task: "看第一章" }] }, new AbortController().signal, undefined);
    expect(seen).toHaveLength(1);
  });
});

describe("落盘轮交回带封存提醒，候选轮不带", () => {
  const slot = { agentId: "child-1", role: "writer", label: "写手", handle: "写手1", task: "t", status: "running", error: null };
  const roster = { touch: () => {} };
  const liveWith = (mode: string) => ({
    session: { prompt: async () => {}, abort: async () => {}, messages: [{ role: "assistant", content: [{ type: "text", text: "结论" }] }] },
    info: { agentId: "child-1", role: "writer", label: "写手", handle: "写手1" },
    mode,
  });

  test("commit 交回带一句封存提醒，判断留给主编", async () => {
    const out = await (kernel as any).promptChild(liveWith("commit"), "任务", slot, roster);
    expect(out).toContain("结论");
    expect(out).toContain("archive_agent");
    expect(out).toContain("写手1");
  });

  test("propose 交回不带：候选悬着不能封", async () => {
    const out = await (kernel as any).promptChild(liveWith("propose"), "任务", slot, roster);
    expect(out).toContain("结论");
    expect(out).not.toContain("archive_agent");
  });
});
