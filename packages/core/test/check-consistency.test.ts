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

const thread = (status: string) =>
  `---\ntitle: 三方归一\nsummary: 三方合并\nkeywords: []\nstatus: ${status}\ntype: 主题\n---\n\n## 起点\n三方同城。\n\n## 终点\n合成一家。\n`;
const chapter = `---\ntitle: 前世最后一天\nsummary: 开篇\nkeywords: []\nstatus: draft\nvolume: 1\ncharacters: []\nthreads: []\nwords: 3000\n---\n\n## 本章目标\n开篇。\n\n## 场景序列\n- 出租屋 / 陈默 / 送单 / 选了继续 / 猝死\n\n## 信息控制\n揭示：\n- 重生\n隐藏：\n- 谁在背后\n\n## 章末钩子\n醒来。\n`;

describe("孤儿线索", () => {
  test("没被章纲指向的线索 → 建议改", async () => {
    await store.write("chapters", "1", chapter);
    await store.write("threads", "三方归一", thread("draft"));
    const issues = await runCheck(store);
    expect(issues.some((i) => i.id === "三方归一" && i.message.includes("没有任何章纲或里程碑指向"))).toBe(true);
  });
  test("已退场的线索不算孤儿", async () => {
    await store.write("chapters", "1", chapter);
    await store.write("threads", "三方归一", thread("retired"));
    const issues = await runCheck(store);
    expect(issues.some((i) => i.id === "三方归一" && i.message.includes("没有任何章纲或里程碑指向"))).toBe(false);
  });
});

const milestone = (title: string, order: number, status: string) =>
  `---\ntitle: ${title}\nsummary: ${title}\nkeywords: []\nstatus: ${status}\norder: ${order}\nthreads: []\n---\n\n## 发生什么\n${title}。\n\n## 之后不可逆的变化\n定局。\n`;
const volume = `---\ntitle: 闵行起步\nsummary: 第一卷\nkeywords: []\nstatus: draft\nmilestones: []\nchapters: 1-30\n---\n\n## 本卷目标\n起步。\n\n## 里程碑分配\n无。\n\n## 人物落点\n无。\n\n## 卷末状态\n跑通。\n`;

describe("退场的里程碑不参与记账", () => {
  test("两张 draft 卡撞 order → 必须修", async () => {
    await store.write("milestones", "点评收编", milestone("点评收编", 11, "draft"));
    await store.write("milestones", "多多一统", milestone("多多一统", 11, "draft"));
    const issues = await runCheck(store);
    expect(issues.some((i) => i.level === "error" && i.message.includes("order=11 重复"))).toBe(true);
  });
  test("其中一张已退场 → 不算撞号", async () => {
    await store.write("milestones", "点评收编", milestone("点评收编", 11, "draft"));
    await store.write("milestones", "多多一统", milestone("多多一统", 11, "retired"));
    const issues = await runCheck(store);
    expect(issues.some((i) => i.message.includes("order=11 重复"))).toBe(false);
  });
  test("已退场的里程碑不报「没有卷纲覆盖」", async () => {
    await store.write("volumes", "01", volume);
    await store.write("milestones", "多多一统", milestone("多多一统", 11, "retired"));
    await store.write("milestones", "点评收编", milestone("点评收编", 12, "draft"));
    const issues = await runCheck(store);
    expect(issues.some((i) => i.id === "多多一统" && i.message.includes("没有任何卷纲覆盖"))).toBe(false);
    expect(issues.some((i) => i.id === "点评收编" && i.message.includes("没有任何卷纲覆盖"))).toBe(true);
  });
});
