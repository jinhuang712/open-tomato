import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Gate } from "../src/agent/gate.js";
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

function listOpen() {
  const ctx: ToolContext = {
    store,
    gate: new Gate({ approvalRequested: () => {}, approvalClosed: () => {}, questionRequested: () => {}, questionClosed: () => {} }),
    agentId: "x",
    runCheck: async () => [],
    docsChanged: async () => [],
    search: async () => [],
  };
  const tool = createTools(ctx, { canWrite: false, canSpawn: false, canAsk: false }).find((t) => t.name === "list_open");
  if (!tool) throw new Error("没有 list_open");
  return async () => {
    const r = await tool.execute("t", {}, undefined as never, undefined as never, undefined as never);
    return (r.content[0] as { text: string }).text;
  };
}

describe("list_open", () => {
  test("空项目说没有搁置", async () => {
    expect(await listOpen()()).toContain("没有搁置的项");
  });
  test("汇总各卡的 open，按中文路径列", async () => {
    await store.write("characters", "陈默", "---\ntitle: 陈默\nsummary: s\nkeywords: []\nstatus: draft\ntier: 主角\nopen: [家乡细节, 初创兄弟]\n---\n\n## 一句话\nx\n");
    await store.write("brief", "简介", "---\ntitle: 简介\nsummary: s\nkeywords: []\nstatus: draft\nopen: [书名]\n---\n\n## 一句话故事\nx\n");
    await store.write("world", "千团大战", "---\ntitle: 千团大战\nsummary: s\nkeywords: []\nstatus: draft\ncategory: 其他\n---\n\n## 定义\nx\n");
    const out = await listOpen()();
    expect(out).toContain("2 篇文档欠着");
    expect(out).toContain("- 简介：书名");
    expect(out).toContain("- 人物/陈默：家乡细节、初创兄弟");
    expect(out).not.toContain("千团大战");
  });
});
