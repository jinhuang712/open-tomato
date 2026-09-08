import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Gate, type GateSink } from "../src/agent/gate.js";
import { createTools, type ToolContext } from "../src/agent/tools/index.js";
import { DOC_KIND_IDS } from "../src/project/kinds.js";
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

/** 审批门一敲就按 answer 给的那份回话——模拟作者在审阅里按 ⌘E 改过之后再批准 */
function tools(answer: (after: string) => { decision: "approve" | "reject"; reason: string; content?: string }) {
  let gate: Gate;
  const sink: GateSink = {
    approvalRequested: (r) => queueMicrotask(() => gate.resolveApproval(r.approvalId, answer(r.after))),
    approvalClosed: () => {},
    questionRequested: () => {},
    questionClosed: () => {},
  };
  gate = new Gate(sink);
  const ctx: ToolContext = { store, gate, agentId: "planner", runCheck: async () => [], docsChanged: async () => [], search: async () => [] };
  const all = createTools(ctx, { writableKinds: DOC_KIND_IDS, canSpawn: false, canAsk: false });
  return (name: string, params: unknown) => {
    const t = all.find((x) => x.name === name);
    if (!t) throw new Error(`没有 ${name}`);
    return t.execute("t", params as never, undefined as never, undefined as never, undefined as never);
  };
}

const textOf = (r: unknown) => (r as { content: Array<{ text?: string }> }).content.map((c) => c.text ?? "").join("");
const PROPOSED = "---\ntitle: 陈默\nsummary: 主角\nkeywords: []\nstatus: draft\ntier: 主角\n---\n\n## 定位\n重生的外卖员。\n";

describe("审阅里自行批改后批准", () => {
  test("落盘的是作者那版，不是 agent 提的那版", async () => {
    const call = tools((after) => ({ decision: "approve", reason: "", content: after.replace("外卖员", "外卖骑手") }));
    await call("write_doc", { kind: "characters", id: "陈默", content: PROPOSED });
    const doc = await store.read("characters", "陈默");
    expect(doc?.raw).toContain("重生的外卖骑手。");
    expect(doc?.raw).not.toContain("重生的外卖员。");
  });

  test("回话里明说落的不是 agent 那版，免得它接着在自己那版上改", async () => {
    const call = tools((after) => ({ decision: "approve", reason: "", content: after.replace("外卖员", "外卖骑手") }));
    const out = await call("write_doc", { kind: "characters", id: "陈默", content: PROPOSED });
    expect(textOf(out)).toContain("作者亲手改过的版本");
    expect(textOf(out)).toContain("read_doc");
  });

  test("除了放行，另记一条 edit 批：作者动了哪儿写手下次读得到", async () => {
    const call = tools((after) => ({ decision: "approve", reason: "", content: after.replace("外卖员", "外卖骑手") }));
    await call("write_doc", { kind: "characters", id: "陈默", content: PROPOSED });
    const marks = await store.records.marks("characters", "陈默");
    expect(marks.map((m) => m.type)).toEqual(["edit", "approve"]);
    expect(marks[0]?.patch).toContain("外卖骑手");
    expect(marks[0]?.by).toBe("author");
    // 放行记的版本是真正落盘的那份，不是 agent 提的那份
    const doc = await store.read("characters", "陈默");
    expect(marks[1]?.version).toBe(marks[0]?.version);
    expect(doc?.raw).toContain("外卖骑手");
  });

  test("进了编辑器但一字没动：当普通放行，不记 edit 批", async () => {
    const call = tools((after) => ({ decision: "approve", reason: "", content: after }));
    const out = await call("write_doc", { kind: "characters", id: "陈默", content: PROPOSED });
    expect(textOf(out)).not.toContain("作者亲手改过");
    const marks = await store.records.marks("characters", "陈默");
    expect(marks.map((m) => m.type)).toEqual(["approve"]);
  });

  test("末尾换行的有无不算改动：previewWrite 会补，作者那份别因此被当成改过", async () => {
    const call = tools((after) => ({ decision: "approve", reason: "", content: after.replace(/\n$/, "") }));
    await call("write_doc", { kind: "characters", id: "陈默", content: PROPOSED });
    const marks = await store.records.marks("characters", "陈默");
    expect(marks.map((m) => m.type)).toEqual(["approve"]);
  });

  test("拒绝时捎来的 content 不作数：退回就是退回，不能顺手落盘", async () => {
    await store.write("characters", "陈默", PROPOSED);
    const call = tools((after) => ({ decision: "reject", reason: "太单薄", content: after.replace("外卖员", "外卖骑手") }));
    await call("edit_doc", { kind: "characters", id: "陈默", edits: [{ old: "重生的外卖员。", new: "重生的外卖小哥。" }] });
    const doc = await store.read("characters", "陈默");
    expect(doc?.raw).toContain("重生的外卖员。");
    const marks = await store.records.marks("characters", "陈默");
    expect(marks.map((m) => m.type)).toEqual(["reject"]);
  });
});
