import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { SearchIndex, tokenize } from "../src/project/search.js";
import { ProjectStore } from "../src/project/store.js";

describe("tokenize", () => {
  test("中文出单字和双字，英文整词", () => {
    expect(tokenize("主角林尧 sword2")).toEqual(["主", "主角", "角", "角林", "林", "林尧", "尧", "sword2"]);
  });
});

describe("SearchIndex", () => {
  let root: string;
  let store: ProjectStore;
  const card = (title: string, summary: string, keywords: string, extra: string, body: string) =>
    `---\ntitle: ${title}\nsummary: ${summary}\nkeywords: [${keywords}]\nstatus: draft\n${extra}---\n\n${body}\n`;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "ot-search-"));
    store = await ProjectStore.create(root, "书");
    await store.write("characters", "lin-yao", card("林尧", "主角，被逐出铁匠行会的少年", "主角, 铁匠", "tier: 主角\n", "## 语音签名\n\n短句，爱说“成”。\n\n## 关系\n\n和师父决裂。"));
    await store.write("characters", "shifu", card("老铁", "林尧的师父", "师父, 铁匠", "tier: 关键对手\n", "## 一句话\n\n把主角逐出行会的人。"));
    await store.write("world", "guild", card("铁匠行会", "北境最大的铸造组织", "行会", "category: 势力\n", "## 定义\n\n主角曾经的归属。"));
    await store.write("threads", "main", card("重铸镇国剑", "主线", "主线, 剑", "type: 主线\n", "## 起点\n\n林尧捡到半张图谱。"));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  test("「主角」优先出主角本人，其余按相关度排", async () => {
    const idx = await SearchIndex.build(store);
    const hits = idx.query("主角");
    expect(hits[0]?.id).toBe("lin-yao");
    expect(hits.map((h) => h.id)).toContain("guild");
    expect(hits.map((h) => h.id)).toContain("shifu");
  });

  test("snippet 落在命中的段", async () => {
    const idx = await SearchIndex.build(store);
    const hit = idx.query("图谱").find((h) => h.id === "main");
    expect(hit?.section).toBe("起点");
    expect(hit?.snippet).toContain("图谱");
  });

  test("没命中返回空", async () => {
    const idx = await SearchIndex.build(store);
    expect(idx.query("量子计算")).toEqual([]);
  });
});
