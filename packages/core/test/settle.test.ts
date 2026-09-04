import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Gate } from "../src/agent/gate.js";
import { createTools, type ToolContext } from "../src/agent/tools.js";
import { runCheck } from "../src/project/check.js";
import { ProjectStore } from "../src/project/store.js";

let root: string;
let store: ProjectStore;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "opentomato-"));
  store = await ProjectStore.create(root, "测试书");
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const fm = (fields: Record<string, string>, body: string) =>
  `---\n${Object.entries({ title: "t", summary: "s", keywords: "[]", status: "draft", ...fields })
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n")}\n---\n\n${body}`;

function toolsFor(perms: Parameters<typeof createTools>[1]) {
  const gate = new Gate({ approvalRequested: () => {}, approvalClosed: () => {}, questionRequested: () => {}, questionClosed: () => {} });
  const ctx: ToolContext = { store, gate, agentId: "x", runCheck: () => runCheck(store), docsChanged: () => runCheck(store), search: async () => [] };
  const all = createTools(ctx, perms);
  return (name: string) => {
    const t = all.find((x) => x.name === name);
    if (!t) throw new Error(`没有 ${name}`);
    return (params: unknown) => t.execute("t", params as never, undefined as never, undefined as never, undefined as never);
  };
}
const textOf = (r: unknown) => (r as { content: Array<{ text?: string }> }).content.map((c) => c.text ?? "").join("");

/** 一条线从第 1 章后 20 章没推进：机检该报停滞 */
async function stalledThread() {
  await store.write("threads", "复仇", fm({ type: "主线" }, "## 起点\n\n甲\n\n## 终点\n\n乙\n"));
  await store.write("chapters", "1", fm({ volume: "01", characters: "[]", threads: "[复仇]", words: "10" }, "## 本章目标\n\n a\n\n## 场景序列\n\n b\n\n## 信息控制\n\n c\n\n## 章末钩子\n\n d\n"));
  for (let i = 1; i <= 21; i++) {
    if (i > 1) await store.write("chapters", String(i), fm({ volume: "01", characters: "[]", threads: "[]", words: "10" }, "## 本章目标\n\n a\n\n## 场景序列\n\n b\n\n## 信息控制\n\n c\n\n## 章末钩子\n\n d\n"));
    await store.write("manuscript", String(i), fm({ words: "10" }, "正文。\n"));
  }
}

describe("作者说不欠", () => {
  test("settle 之后机检对这条线的建议改闭嘴，reopen 之后又报", async () => {
    await stalledThread();
    const stall = (issues: Awaited<ReturnType<typeof runCheck>>) => issues.filter((i) => i.kind === "threads" && i.id === "复仇" && i.message.includes("没再推进"));
    expect(stall(await runCheck(store)).length).toBe(1);

    const director = toolsFor({ canWrite: true, canSpawn: true, canAsk: true });
    const out = textOf(await director("settle")({ kind: "threads", id: "复仇", mode: "defer", text: "这条线故意沉两卷" }));
    expect(out).toContain("不欠");
    expect(stall(await runCheck(store)).length).toBe(0);

    await director("settle")({ kind: "threads", id: "复仇", mode: "reopen", text: "该动了" });
    expect(stall(await runCheck(store)).length).toBe(1);
  });

  test("必须修不受 defer 影响", async () => {
    await store.write("threads", "残缺", fm({ type: "暗线" }, "## 起点\n\n甲\n\n## 终点\n\n乙\n"));
    await store.records.appendMark({ kind: "threads", id: "残缺", type: "defer", by: "director", text: "先放" });
    const errs = (await runCheck(store)).filter((i) => i.kind === "threads" && i.id === "残缺" && i.level === "error");
    expect(errs.length).toBeGreaterThan(0);
  });

  test("非主编没有 settle", () => {
    const writer = toolsFor({ canWrite: true, canSpawn: false, canAsk: false });
    expect(() => writer("settle")).toThrow();
  });
});

describe("read_marks", () => {
  test("列出退回词、放行、手改与不欠", async () => {
    await store.write("manuscript", "1", fm({ words: "10" }, "正文。\n"));
    await store.records.appendMark({ kind: "manuscript", id: "0001", type: "reject", by: "author", word: "太急" });
    await store.records.appendMark({ kind: "manuscript", id: "0001", type: "approve", by: "author" });
    await store.records.appendMark({ kind: "manuscript", id: "0001", type: "edit", by: "author", patch: "--- a\n+++ b\n@@\n-他推门进来。\n+他翻窗进来。\n" });
    const any = toolsFor({ canWrite: true, canSpawn: false, canAsk: false });
    const out = textOf(await any("read_marks")({ kind: "manuscript", id: "1" }));
    expect(out).toContain("退回：太急");
    expect(out).toContain("放行");
    expect(out).toContain("+他翻窗进来。");
    expect(out).not.toContain("+++ b");
  });

  test("没批过就说没批过", async () => {
    const any = toolsFor({ canWrite: true, canSpawn: false, canAsk: false });
    expect(textOf(await any("read_marks")({ kind: "characters", id: "林尧" }))).toContain("还没批过");
  });
});

describe("volume_rhythm", () => {
  test("按卷纲区间列出每章字数、线索、钩子", async () => {
    await store.write("volumes", "1", fm({ milestones: "[]", chapters: "1-3" }, "## 卷目标\n\n x\n"));
    const ch = (threads: string, hook: string) => fm({ volume: "01", characters: "[]", threads, words: "10" }, `## 本章目标\n\n a\n\n## 场景序列\n\n b\n\n## 信息控制\n\n c\n\n## 章末钩子\n\n${hook}\n`);
    await store.write("chapters", "1", ch("[复仇]", "他听见门外有人"));
    await store.write("chapters", "2", ch("[]", "待填"));
    await store.write("manuscript", "1", fm({ words: "0" }, "一二三四五六七八九十。\n"));
    const any = toolsFor({ canWrite: true, canSpawn: false, canAsk: false });
    const out = textOf(await any("volume_rhythm")({ volume: "1" }));
    expect(out).toContain("| 1 | 11 | 复仇 | 有 |");
    expect(out).toContain("| 2 | 未写 | 无 | 空 |");
    expect(out).not.toContain("| 3 |");
  });
});
