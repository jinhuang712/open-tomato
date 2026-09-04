import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Gate, type GateSink } from "../src/agent/gate.js";
import { createTools, type ToolContext } from "../src/agent/tools.js";
import { contentHash } from "../src/project/records.js";
import { ProjectStore } from "../src/project/store.js";
import type { ApprovalDecision } from "../src/protocol.js";

let root: string;
let store: ProjectStore;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "opentomato-"));
  store = await ProjectStore.create(root, "测试书");
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

/** 审批门一挂起就按预设答复，模拟作者点按钮 */
function gateAnswering(decision: ApprovalDecision, reason = "") {
  let gate: Gate;
  const sink: GateSink = {
    approvalRequested: (r) => queueMicrotask(() => gate.resolveApproval(r.approvalId, { decision, reason })),
    approvalClosed: () => {},
    questionRequested: () => {},
    questionClosed: () => {},
  };
  gate = new Gate(sink);
  return gate;
}

function writeDoc(gate: Gate) {
  const ctx: ToolContext = {
    store,
    gate,
    agentId: "writer-1",
    runCheck: async () => [],
    docsChanged: async () => [],
    search: async () => [],
  };
  const tool = createTools(ctx, { canWrite: true, canSpawn: false, canAsk: false }).find((t) => t.name === "write_doc");
  if (!tool) throw new Error("没有 write_doc");
  return (content: string) => tool.execute("t1", { kind: "manuscript", id: "1", content }, undefined as never, undefined as never, undefined as never);
}

const DRAFT = "---\ntitle: 第一章\nsummary: 开场\nkeywords: []\nstatus: draft\nwords: 10\n---\n\n他推门进来。\n";

describe("审批决议落批", () => {
  test("放行落一条 approve，version 是落盘内容的 hash", async () => {
    await writeDoc(gateAnswering("approve"))(DRAFT);
    const marks = await store.records.marks("manuscript", "0001");
    expect(marks.map((m) => m.type)).toEqual(["approve"]);
    expect(marks[0]?.by).toBe("author");
    expect(marks[0]?.agentId).toBe("writer-1");
    expect(marks[0]?.version).toBe(contentHash(DRAFT));
    expect(marks[0]?.word).toBeUndefined();
  });

  test("退回理由是词汇表里的词就进 word", async () => {
    await writeDoc(gateAnswering("reject", "太急"))(DRAFT);
    const [m] = await store.records.marks("manuscript", "0001");
    expect(m?.type).toBe("reject");
    expect(m?.word).toBe("太急");
    expect(m?.text).toBeUndefined();
    expect(await store.list("manuscript")).toEqual([]);
  });

  test("退回理由是作者自己的话就进 text", async () => {
    await writeDoc(gateAnswering("reject", "开头那句他不会说"))(DRAFT);
    const [m] = await store.records.marks("manuscript", "0001");
    expect(m?.word).toBeUndefined();
    expect(m?.text).toBe("开头那句他不会说");
  });
});
