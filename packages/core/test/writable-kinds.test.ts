import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Gate, type GateSink } from "../src/agent/gate.js";
import { ROLES } from "../src/agent/roles.js";
import { createTools, type ToolContext } from "../src/agent/tools/index.js";
import type { RoleId } from "../src/protocol.js";
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

/** 按角色的可写范围拼工具；敲了审批门就记下并放行 */
function toolsFor(role: RoleId) {
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
  const ctx: ToolContext = { store, gate, agentId: role, runCheck: async () => [], docsChanged: async () => [], search: async () => [] };
  const def = ROLES[role];
  const all = createTools(ctx, { writableKinds: def.writableKinds, bookkeepAnyKind: def.bookkeepAnyKind ?? false, canSpawn: def.canSpawn, canAsk: def.canAsk });
  const call = (name: string, params: unknown) => {
    const t = all.find((x) => x.name === name);
    if (!t) throw new Error(`没有 ${name}`);
    return t.execute("t", params as never, undefined as never, undefined as never, undefined as never);
  };
  const schemaOf = (name: string) => all.find((x) => x.name === name)?.parameters as { properties: { kind: { description: string } } } | undefined;
  return { asked, call, all, schemaOf };
}

const CARD = "---\ntitle: 陈默\nsummary: 主角\nkeywords: []\nstatus: draft\ntier: 主角\n---\n\n## 一句话\n重生的外卖员。\n";
const CHAPTER = "---\ntitle: 第一章\nsummary: 开场\nkeywords: []\nstatus: draft\nwords: 12\nrevision: 0\n---\n\n夜里下着雨。\n";
const MILESTONE = "---\ntitle: 多多一统\nsummary: 三方归一\nkeywords: []\nstatus: draft\norder: 11\nthreads: []\n---\n\n## 发生什么\n三方归一。\n\n## 之后不可逆的变化\n市场只剩一家。\n";

describe("角色只能写自己那类材料", () => {
  test("写手 write_doc 人物卡：直接拒，不敲审批门，文件不建", async () => {
    const { asked, call } = toolsFor("writer");
    await expect(call("write_doc", { kind: "characters", id: "陈默", content: CARD })).rejects.toThrow("不归你写");
    expect(asked).toEqual([]);
    expect(await store.read("characters", "陈默")).toBeNull();
  });

  test("写手 edit_doc 人物卡：也拒，报错里说清能写什么", async () => {
    await store.write("characters", "陈默", CARD);
    const { asked, call } = toolsFor("writer");
    await expect(call("edit_doc", { kind: "characters", id: "陈默", edits: [{ old: "外卖员", new: "骑手" }] })).rejects.toThrow("正文");
    expect(asked).toEqual([]);
    expect((await store.read("characters", "陈默"))?.raw).toContain("外卖员");
  });

  test("写手写正文：照常过审批门落盘", async () => {
    const { asked, call } = toolsFor("writer");
    await call("write_doc", { kind: "manuscript", id: "1", content: CHAPTER });
    expect(asked.length).toBe(1);
    expect(await store.read("manuscript", "1")).not.toBeNull();
  });

  test("主编不写正文：kind=manuscript 被拒", async () => {
    const { asked, call } = toolsFor("director");
    await expect(call("write_doc", { kind: "manuscript", id: "1", content: CHAPTER })).rejects.toThrow("不归你写");
    expect(asked).toEqual([]);
  });

  test("主编把孤立的里程碑标 retired：只动记账字段，不敲审批门直接落盘", async () => {
    await store.write("milestones", "多多一统", MILESTONE);
    const { asked, call } = toolsFor("director");
    await call("edit_doc", { kind: "milestones", id: "多多一统", edits: [{ old: "status: draft", new: "status: retired" }] });
    expect(asked).toEqual([]);
    expect((await store.read("milestones", "多多一统"))?.raw).toContain("status: retired");
  });

  test("主编改里程碑正文：拒，报错里说清只能改记账字段", async () => {
    await store.write("milestones", "多多一统", MILESTONE);
    const { asked, call } = toolsFor("director");
    await expect(call("edit_doc", { kind: "milestones", id: "多多一统", edits: [{ old: "市场只剩一家", new: "市场只剩两家" }] })).rejects.toThrow("记账字段");
    expect(asked).toEqual([]);
    expect((await store.read("milestones", "多多一统"))?.raw).toContain("市场只剩一家");
  });

  test("主编改里程碑的结构字段 order：不是记账，同样拒", async () => {
    await store.write("milestones", "多多一统", MILESTONE);
    const { call } = toolsFor("director");
    await expect(call("edit_doc", { kind: "milestones", id: "多多一统", edits: [{ old: "order: 11", new: "order: 3" }] })).rejects.toThrow("记账字段");
  });

  test("主编 edit_doc 的 kind 说明补了一句其他类型只能改记账字段；编剧的没有", () => {
    expect(toolsFor("director").schemaOf("edit_doc")!.properties.kind.description).toContain("记账字段");
    expect(toolsFor("plotter").schemaOf("edit_doc")!.properties.kind.description).not.toContain("记账字段");
  });

  test("写工具的 kind 参数说明只列该角色能写的类型", () => {
    const { schemaOf } = toolsFor("writer");
    const desc = schemaOf("write_doc")!.properties.kind.description;
    expect(desc).toContain("manuscript");
    expect(desc).not.toContain("characters");
  });

  test("只读角色没有写工具", () => {
    const { all } = toolsFor("proofreader");
    expect(all.map((t) => t.name)).not.toContain("write_doc");
    expect(all.map((t) => t.name)).not.toContain("edit_doc");
  });
});
