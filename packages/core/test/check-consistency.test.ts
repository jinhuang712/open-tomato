import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
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

const card = (open: string, body: string) =>
  `---\ntitle: 陈默\nsummary: 主角\nkeywords: []\nstatus: draft\ntier: 主角\n${open}---\n\n## 一句话\n前美团小中层重生。\n\n## 外在\n${body}\n\n## 内在与欲望\n要赢。\n\n## 语音签名\n先算清楚。\n`;

describe("open 与正文一致", () => {
  test("正文说先放一放、open 为空 → 报欠账", async () => {
    await store.write("characters", "陈默", card("", "- 南方小县城（具体县市先不落细）"));
    const issues = await runCheck(store);
    expect(issues.some((i) => i.id === "陈默" && i.message.includes("先不落细") && i.level === "warning")).toBe(true);
  });
  test("open 里记了就不报", async () => {
    await store.write("characters", "陈默", card("open: [家乡细节]\n", "- 南方小县城（具体县市先不落细）"));
    const issues = await runCheck(store);
    expect(issues.some((i) => i.message.includes("open 里没有记"))).toBe(false);
  });
});
