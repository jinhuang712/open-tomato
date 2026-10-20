import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { DOC_KIND_IDS } from "../src/project/kinds.js";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Gate, type GateSink } from "../src/agent/gate.js";
import { createTools, type ToolContext } from "../src/agent/tools/index.js";
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
  const tool = createTools(ctx, { writableKinds: DOC_KIND_IDS, canSpawn: false, canAsk: false }).find((t) => t.name === "write_doc");
  if (!tool) throw new Error("没有 write_doc");
  return (content: string) => tool.execute("t1", { kind: "manuscript", id: "1", content }, undefined as never, undefined as never, undefined as never);
}

const DRAFT = "---\ntitle: 第一章\nsummary: 开场\nkeywords: []\nstatus: draft\nwords: 10\n---\n\n他推门进来。\n";

function toolsFor(perms: Parameters<typeof createTools>[1]) {
  const ctx: ToolContext = {
    store,
    gate: gateAnswering("approve"),
    agentId: "x",
    runCheck: async () => [],
    docsChanged: async () => [],
    search: async () => [],
  };
  const all = createTools(ctx, perms);
  return (name: string) => {
    const t = all.find((x) => x.name === name);
    if (!t) throw new Error(`没有 ${name}`);
    return (params: unknown) => t.execute("t", params as never, undefined as never, undefined as never, undefined as never);
  };
}

const textOf = (r: unknown) => (r as { content: Array<{ text?: string }> }).content.map((c) => c.text ?? "").join("");

describe("审稿记录工具", () => {
  test("评审角色有 save_review，落盘后 read_review 能读回；非评审角色没有 save_review", async () => {
    await store.write("manuscript", "3", DRAFT);
    const reviewer = toolsFor({ writableKinds: [], canSpawn: false, canAsk: false, reviewAs: "proofreader" });
    const out = await reviewer("save_review")({ chapter: "3", verdict: "有一处事实冲突", items: [{ level: "must", where: "他推门进来", issue: "上一章他被锁在外面", fix: "改成翻窗" }] });
    expect(textOf(out)).toContain("必须改 1 条");

    const writer = toolsFor({ writableKinds: DOC_KIND_IDS, canSpawn: false, canAsk: false });
    expect(() => writer("save_review")).toThrow();
    const read = textOf(await writer("read_review")({ chapter: "3" }));
    expect(read).toContain("## 校对：有一处事实冲突");
    expect(read).toContain("必须改｜他推门进来 → 上一章他被锁在外面 → 改成翻窗");
    expect(read).not.toContain("上一版正文");
  });

  test("正文改过之后读记录会标出审的是上一版", async () => {
    await store.write("manuscript", "3", DRAFT);
    const reviewer = toolsFor({ writableKinds: [], canSpawn: false, canAsk: false, reviewAs: "reader" });
    await reviewer("save_review")({ chapter: "3", verdict: "还行", items: [] });
    await store.write("manuscript", "3", DRAFT.replace("推门", "翻窗"));
    const read = textOf(await reviewer("read_review")({ chapter: "3" }));
    expect(read).toContain("（审的是上一版正文）");
    expect(read).toContain("- 没有问题");
  });

  test("审稿意见可以带上标准名，读回时跟在级别后面；只能填归这一路核对的标准", async () => {
    await store.write("manuscript", "3", DRAFT);
    const ops = toolsFor({ writableKinds: [], canSpawn: false, canAsk: false, reviewAs: "ops" });
    await ops("save_review")({
      chapter: "3",
      verdict: "憋得太久",
      items: [
        { level: "suggest", where: "他推门进来", issue: "连着三章挨打没还手", standard: "压放" },
        { level: "suggest", where: "他推门进来", issue: "开头交代太长" },
      ],
    });
    const read = textOf(await ops("read_review")({ chapter: "3" }));
    expect(read).toContain("建议看｜压放｜他推门进来 → 连着三章挨打没还手");
    expect(read).toContain("建议看｜他推门进来 → 开头交代太长");

    const def = createTools(
      {
        store,
        gate: gateAnswering("approve"),
        agentId: "x",
        runCheck: async () => [],
        docsChanged: async () => [],
        search: async () => [],
      },
      { writableKinds: [], canSpawn: false, canAsk: false, reviewAs: "ops" },
    ).find((t) => t.name === "save_review");
    const schema = JSON.stringify(def?.parameters);
    expect(schema).toContain("压放");
    expect(schema).not.toContain("线索推进");
  });

  test("没审过的章 read_review 说没有记录", async () => {
    const writer = toolsFor({ writableKinds: DOC_KIND_IDS, canSpawn: false, canAsk: false });
    expect(textOf(await writer("read_review")({ chapter: "9" }))).toContain("还没有审稿记录");
  });
});

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
