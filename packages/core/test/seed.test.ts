import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildStorySeed, storySeedFilename } from "../src/project/seed.js";
import { ProjectStore } from "../src/project/store.js";

let root: string;
let store: ProjectStore;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "opentomato-seed-"));
  store = await ProjectStore.create(root, "测试书");
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("buildStorySeed", () => {
  test("按类型顺序拼接、剥掉 frontmatter、带 id 与标题", async () => {
    await store.write("manuscript", "2", "---\ntitle: 第二章\nsummary: s\nkeywords: []\nstatus: draft\n---\n\n正文二\n");
    await store.write("manuscript", "1", "---\ntitle: 第一章\nsummary: s\nkeywords: []\nstatus: draft\n---\n\n正文一\n");
    await store.write("characters", "hero", "---\ntitle: 主角\nsummary: s\nkeywords: []\nstatus: draft\ntier: 主角\n---\n\n## 一句话\n\n他很强\n");
    const seed = await buildStorySeed(store, new Date("2026-09-04T10:00:00Z"));

    expect(seed.startsWith("# 故事种子 · 测试书")).toBe(true);
    expect(seed).not.toContain("tier: 主角");
    expect(seed).not.toContain("summary:");
    const iBrief = seed.indexOf("# 简介 · ");
    const iHero = seed.indexOf("# 人物 · hero · 主角");
    const iOne = seed.indexOf("# 正文 · 0001 · 第一章");
    const iTwo = seed.indexOf("# 正文 · 0002 · 第二章");
    expect(iBrief).toBeGreaterThan(-1);
    expect(iBrief).toBeLessThan(iHero);
    expect(iHero).toBeLessThan(iOne);
    expect(iOne).toBeLessThan(iTwo);
    expect(seed).toContain("## 一句话\n\n他很强");
  });

  test("文件名带书名与时间戳", () => {
    expect(storySeedFilename("测试书", new Date("2026-09-04T10:00:00Z"))).toBe("测试书-故事种子-2026-09-04 10-00.md");
  });
});
