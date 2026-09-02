import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCheck } from "../src/project/check.js";
import { migrateLegacySessions, ProjectStore } from "../src/project/store.js";

let root: string;
let store: ProjectStore;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "opentomato-"));
  store = await ProjectStore.create(root, "测试书");
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("ProjectStore", () => {
  test("create 建目录和守则", async () => {
    expect(await ProjectStore.exists(root)).toBe(true);
    const guides = await store.list("guide");
    expect(guides.map((g) => g.id).sort()).toEqual(["偏好", "文风", "立项", "铁律"].sort());
  });

  test("open 读回项目名", async () => {
    const again = await ProjectStore.open(root);
    expect(again.info.name).toBe("测试书");
  });

  test("open 迁移旧英文目录布局", async () => {
    const legacy = await fs.mkdtemp(path.join(os.tmpdir(), "ot-legacy-"));
    await fs.mkdir(path.join(legacy, ".opentomato"), { recursive: true });
    await fs.writeFile(path.join(legacy, ".opentomato/project.json"), JSON.stringify({ format: 1, root: legacy, name: "旧书", createdAt: "2026-01-01T00:00:00.000Z" }));
    await fs.mkdir(path.join(legacy, "outline/chapters"), { recursive: true });
    await fs.mkdir(path.join(legacy, "guide"), { recursive: true });
    await fs.writeFile(path.join(legacy, "outline/chapters/0001.md"), "---\ntitle: 开局\nsummary: s\nkeywords: []\nstatus: draft\nvolume: 1\ncharacters: []\n---\n\nx\n");
    await fs.writeFile(path.join(legacy, "guide/brief.md"), "---\ntitle: 立项简报\nsummary: s\nkeywords: []\nstatus: draft\n---\n\nx\n");
    const s = await ProjectStore.open(legacy);
    expect((await s.list("chapters")).map((h) => h.path)).toEqual(["章纲/0001.md"]);
    expect((await s.list("guide")).map((h) => h.id)).toEqual(["立项"]);
    await fs.rm(legacy, { recursive: true, force: true });
  });

  test("open 非项目目录报错", async () => {
    const other = await fs.mkdtemp(path.join(os.tmpdir(), "not-"));
    await expect(ProjectStore.open(other)).rejects.toThrow("不是 OpenTomato 项目");
    await fs.rm(other, { recursive: true, force: true });
  });

  test("章号规范成四位", () => {
    expect(store.normalizeId("chapters", "12")).toBe("0012");
    expect(store.normalizeId("manuscript", "第3章")).toBe("0003");
    expect(store.normalizeId("volumes", "1")).toBe("01");
    expect(store.normalizeId("characters", "Lin Yao")).toBe("lin-yao");
    expect(store.normalizeId("characters", "林尧")).toBe("林尧");
  });

  test("write / read / section", async () => {
    const raw = `---\ntitle: 林尧\nsummary: 主角\nkeywords: [主角]\nstatus: draft\ntier: 主角\n---\n\n## 语音签名\n\n短句。\n\n## 关系\n\n待定\n`;
    const h = await store.write("characters", "lin-yao", raw);
    expect(h.path).toBe("人物/lin-yao.md");
    expect(h.extra.tier).toBe("主角");
    const doc = await store.read("characters", "lin-yao");
    expect(doc?.sections).toEqual(["语音签名", "关系"]);
    expect(await store.readSection("characters", "lin-yao", "语音签名")).toBe("短句。");
  });

  test("previewWrite 出 unified diff", async () => {
    await store.write("world", "sect", "---\ntitle: 铁盟\nsummary: a\nkeywords: []\nstatus: draft\n---\n\n旧\n");
    const p = await store.previewWrite("world", "sect", "---\ntitle: 铁盟\nsummary: a\nkeywords: []\nstatus: draft\n---\n\n新\n");
    expect(p.isNew).toBe(false);
    expect(p.patch).toContain("-旧");
    expect(p.patch).toContain("+新");
  });

  test("search 命中 title / keywords", async () => {
    await store.write("threads", "main", "---\ntitle: 寻剑\nsummary: 主线\nkeywords: [剑, 复仇]\nstatus: draft\ntype: 主线\n---\n\n起点\n");
    expect((await store.search("复仇")).map((h) => h.id)).toEqual(["main"]);
    expect((await store.search("不存在的词")).length).toBe(0);
  });
});

describe("runCheck", () => {
  test("空项目只有守则的 warning", async () => {
    const issues = await runCheck(store);
    expect(issues.every((i) => i.kind === "guide")).toBe(true);
  });

  test("章纲引用不存在的人物报 error", async () => {
    await store.write(
      "chapters",
      "1",
      "---\ntitle: 开局\nsummary: s\nkeywords: []\nstatus: draft\nvolume: 1\ncharacters: [ghost]\n---\n\n## 本章目标\n\nx\n",
    );
    const issues = await runCheck(store);
    const msgs = issues.filter((i) => i.kind === "chapters").map((i) => i.message);
    expect(msgs.some((m) => m.includes("ghost"))).toBe(true);
    expect(msgs.some((m) => m.includes("卷纲"))).toBe(true);
  });

  test("章号断档报 warning", async () => {
    const mk = (n: string) => `---\ntitle: c${n}\nsummary: s\nkeywords: []\nstatus: draft\nvolume: 1\ncharacters: []\n---\n\nx\n`;
    await store.write("volumes", "1", "---\ntitle: v\nsummary: s\nkeywords: []\nstatus: draft\nchapters: 1-3\n---\n\nx\n");
    await store.write("chapters", "1", mk("1"));
    await store.write("chapters", "3", mk("3"));
    const issues = await runCheck(store);
    expect(issues.some((i) => i.message.includes("断档：2"))).toBe(true);
  });

  test("残留待填", async () => {
    await store.write("manuscript", "1", "---\ntitle: 第一章\nsummary: s\nkeywords: []\nstatus: draft\n---\n\n待填\n");
    const issues = await runCheck(store);
    const hit = issues.find((i) => i.kind === "manuscript" && i.message.includes("待填"));
    expect(hit?.level).toBe("error");
  });
});

describe("会话目录", () => {
  test("create 建 .opentomato/sessions/lead 与 .gitignore", async () => {
    const dir = store.leadSessionsDir;
    expect(dir).toBe(path.join(root, ".opentomato/sessions/lead"));
    expect((await fs.stat(dir)).isDirectory()).toBe(true);
    expect(await fs.readFile(path.join(root, ".opentomato/.gitignore"), "utf8")).toBe("sessions/\n");
  });

  test("open 不覆盖已有 .gitignore", async () => {
    await fs.writeFile(path.join(root, ".opentomato/.gitignore"), "custom\n");
    await ProjectStore.open(root);
    expect(await fs.readFile(path.join(root, ".opentomato/.gitignore"), "utf8")).toBe("custom\n");
  });

  test("migrateLegacySessions 只搬 cwd 匹配的 jsonl", async () => {
    const legacy = await fs.mkdtemp(path.join(os.tmpdir(), "ot-sessions-"));
    const header = (cwd: string) => `${JSON.stringify({ type: "session", version: 3, id: "x", cwd })}\n{"type":"message"}\n`;
    await fs.writeFile(path.join(legacy, "a.jsonl"), header(root));
    await fs.writeFile(path.join(legacy, "b.jsonl"), header("/somewhere/else"));
    await fs.writeFile(path.join(legacy, "c.jsonl"), "not json\n");
    await fs.writeFile(path.join(legacy, "d.txt"), header(root));
    const moved = await migrateLegacySessions(legacy, root);
    expect(moved).toBe(1);
    expect((await fs.readdir(store.leadSessionsDir)).sort()).toEqual(["a.jsonl"]);
    expect((await fs.readdir(legacy)).sort()).toEqual(["b.jsonl", "c.jsonl", "d.txt"]);
    // 再跑一次是幂等的
    expect(await migrateLegacySessions(legacy, root)).toBe(0);
    await fs.rm(legacy, { recursive: true, force: true });
  });

  test("migrateLegacySessions 目录不存在返回 0", async () => {
    expect(await migrateLegacySessions(path.join(root, "nope"), root)).toBe(0);
  });
});
