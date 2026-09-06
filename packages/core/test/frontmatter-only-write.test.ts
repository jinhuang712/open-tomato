import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Gate, type GateSink } from "../src/agent/gate.js";
import { createTools, type ToolContext } from "../src/agent/tools/index.js";
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

/** 一旦有人敲审批门就记下来，并放行，方便断言「到底敲没敲」 */
function tools() {
  const asked: string[] = [];
  let gate: Gate;
  const sink: GateSink = {
    approvalRequested: (r) => {
      asked.push(r.path);
      queueMicrotask(() => gate.resolveApproval(r.approvalId, { decision: "approve", reason: "" }));
    },
    approvalClosed: () => {},
    questionRequested: () => {},
    questionClosed: () => {},
  };
  gate = new Gate(sink);
  const ctx: ToolContext = { store, gate, agentId: "lead", runCheck: async () => [], docsChanged: async () => [], search: async () => [] };
  const all = createTools(ctx, { canWrite: true, canSpawn: false, canAsk: false });
  const call = (name: string, params: unknown) => {
    const t = all.find((x) => x.name === name);
    if (!t) throw new Error(`没有 ${name}`);
    return t.execute("t", params as never, undefined as never, undefined as never, undefined as never);
  };
  return { asked, call };
}

const textOf = (r: unknown) => (r as { content: Array<{ text?: string }> }).content.map((c) => c.text ?? "").join("");
const CARD = "---\ntitle: 陈默\nsummary: 主角\nkeywords: []\nstatus: draft\ntier: 主角\nopen: [家乡细节]\n---\n\n## 定位\n重生的外卖员。\n";

describe("只改 frontmatter 不过审批门", () => {
  test("edit_doc 只改 open 清单：直接落盘，不敲门", async () => {
    await store.write("characters", "陈默", CARD);
    const { asked, call } = tools();
    const out = await call("edit_doc", { kind: "characters", id: "陈默", edits: [{ old: "open: [家乡细节]", new: "open: [家乡细节, 初创兄弟]" }] });
    expect(asked).toEqual([]);
    expect(textOf(out)).toContain("无需作者审批");
    const doc = await store.read("characters", "陈默");
    expect(doc?.raw).toContain("初创兄弟");
  });

  test("正文也动了：照旧敲门", async () => {
    await store.write("characters", "陈默", CARD);
    const { asked, call } = tools();
    await call("edit_doc", { kind: "characters", id: "陈默", edits: [{ old: "重生的外卖员。", new: "重生的外卖骑手。" }] });
    expect(asked.length).toBe(1);
  });

  test("新建文档：哪怕正文为空也敲门", async () => {
    const { asked, call } = tools();
    await call("write_doc", { kind: "characters", id: "许燃", content: "---\ntitle: 许燃\nsummary: 兄弟\nkeywords: []\nstatus: draft\ntier: 重要配角\n---\n" });
    expect(asked.length).toBe(1);
  });
});
