import { describe, expect, test } from "bun:test";
import { buildForkPrompt, forkSections, MAX_FORK_CHARS } from "../src/agent/kernel/fork.js";

const msg = (role: string, content: unknown, id = role) => ({ type: "message", id, parentId: null, timestamp: "", message: { role, content } });

describe("fork 转交", () => {
  test("只留人话：toolResult 整条扔，toolCall 片段扔，文本留下", () => {
    const sections = forkSections([
      msg("user", "陈默要更痞一点", "m1"),
      msg("assistant", [{ type: "text", text: "好" }, { type: "toolCall", id: "t1", name: "read_doc", arguments: {} }], "m2"),
      { type: "message", id: "m3", parentId: null, timestamp: "", message: { role: "toolResult", toolCallId: "t1", toolName: "read_doc", content: "文档全文……" } },
    ] as never);
    expect(sections.map((s) => s.who)).toEqual(["作者", "主编"]);
    expect(sections[0]!.text).toBe("陈默要更痞一点");
    expect(sections[1]!.text).toBe("好");
  });

  test("系统桩剥掉（别线报告/暂停），作者批注留下", () => {
    const sections = forkSections([
      msg("user", "⟦stub:策划1交回⟧\n三个候选", "m1"),
      msg("user", "⟦stub:暂停⟧\n收尾", "m2"),
      msg("user", "⟦引用 批注 人物/陈默⟧\n他不会这么说\n⟦/引用⟧\n这里太端着了", "m3"),
    ] as never);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.text).toContain("这里太端着了");
  });

  test("compaction 小结带上，非消息记录跳过", () => {
    const sections = forkSections([
      { type: "compaction", id: "c1", parentId: null, timestamp: "", summary: "前情：定了三卷结构", firstKeptEntryId: "m1", tokensBefore: 1 },
      { type: "custom", id: "x1", parentId: null, timestamp: "" },
      msg("user", "继续", "m1"),
    ] as never);
    expect(sections.map((s) => s.who)).toEqual(["小结", "作者"]);
  });

  test("分支没料就原样返回任务，不包空围栏", () => {
    expect(buildForkPrompt([], "落人物卡陈默")).toBe("落人物卡陈默");
  });

  test("正常组装：围栏 + 全文 + 任务，任务书在最后", () => {
    const out = buildForkPrompt([msg("user", "陈默要更痞", "m1"), msg("assistant", "好", "m2")] as never, "落人物卡陈默");
    expect(out).toContain("【作者】\n陈默要更痞");
    expect(out).toContain("【主编】\n好");
    expect(out).toContain("本次任务：落人物卡陈默");
    expect(out.indexOf("本次任务：落人物卡")).toBeGreaterThan(out.indexOf("陈默要更痞"));
  });

  test("超长截最老的，截了就明说", () => {
    const big = "啊".repeat(1000);
    const entries = Array.from({ length: Math.ceil(MAX_FORK_CHARS / 1000) + 5 }, (_, i) => msg(i % 2 ? "assistant" : "user", `${big}${i}`, `m${i}`));
    const out = buildForkPrompt(entries as never, "任务");
    expect(out).toContain("因过长省略");
    expect(out).not.toContain(`${big}0`);
    expect(out).toContain("本次任务：任务");
  });

  test("spawn_agents 工具透传 fork", async () => {
    const { makeSpawnAgentsTool } = await import("../src/agent/tools/spawn-agents.js");
    const seen: unknown[] = [];
    const tool = makeSpawnAgentsTool({ spawn: async (tasks: unknown) => { seen.push(tasks); return { text: "ok", details: { slots: [] } }; } } as any);
    await (tool.execute as any)("t1", { tasks: [{ role: "designer", task: "t", fork: true }] }, new AbortController().signal, undefined);
    expect(seen).toEqual([[{ role: "designer", task: "t", fork: true }]]);
  });
});
