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
  test("create 建目录、预置简介，守则为空", async () => {
    expect(await ProjectStore.exists(root)).toBe(true);
    const briefs = await store.list("brief");
    expect(briefs.map((b) => b.path)).toEqual(["简介.md"]);
    expect(await store.list("rules")).toEqual([]);
  });

  test("简介是单例：任何 id 都落到 简介.md", async () => {
    expect(store.relPath("brief", "随便")).toBe("简介.md");
    await store.write("brief", "", "---\ntitle: 简介\nsummary: s\nkeywords: []\nstatus: draft\n---\n\n## 一句话故事\n\n有了\n");
    const briefs = await store.list("brief");
    expect(briefs.map((b) => b.path)).toEqual(["简介.md"]);
  });

  test("守则不传 id 自动编号", async () => {
    const rule = (t: string) => `---\ntitle: ${t}\nsummary: s\nkeywords: []\nstatus: draft\nlevel: 必须\nscope: 对白\n---\n`;
    const p1 = await store.previewWrite("rules", "", rule("主角不说脏话"));
    expect(p1.path).toBe("守则/001.md");
    await store.write("rules", p1.id, p1.after);
    const p2 = await store.previewWrite("rules", "", rule("不写梦境开场"));
    expect(p2.id).toBe("002");
    expect(store.normalizeId("rules", "7")).toBe("007");
    // write 空 id 也自动编号，和 previewWrite 一致
    const h = await store.write("rules", "", rule("不写梦境开场"));
    expect(h.id).toBe("002");
    expect(h.path).toBe("守则/002.md");
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
    await fs.writeFile(path.join(legacy, "guide/brief.md"), "---\ntitle: 立项简报\nsummary: s\nkeywords: []\nstatus: draft\n---\n\n## 一句话故事\n\nx\n");
    await fs.writeFile(path.join(legacy, "guide/rules.md"), "---\ntitle: 铁律\nsummary: s\nkeywords: []\nstatus: draft\n---\n\n## 条目\n\n- 主角不能死\n- 不写穿越\n");
    await fs.writeFile(path.join(legacy, "guide/style.md"), "---\ntitle: 文风\nsummary: s\nkeywords: []\nstatus: draft\n---\n\n## 条目\n\n待定\n");
    const s = await ProjectStore.open(legacy);
    expect((await s.list("chapters")).map((h) => h.path)).toEqual(["章纲/0001.md"]);
    const [brief] = await s.list("brief");
    expect(brief!.path).toBe("简介.md");
    expect(brief!.title).toBe("简介");
    const rules = await s.list("rules");
    expect(rules.map((r) => [r.id, r.title, r.extra.level, r.extra.scope])).toEqual([
      ["001", "主角不能死", "必须", "全局"],
      ["002", "不写穿越", "必须", "全局"],
    ]);
    expect(await fs.readdir(path.join(legacy, "守则"))).toEqual(["001.md", "002.md"]);
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

  test("write 带 expectBefore：审批期间文件被改就拒写", async () => {
    const v1 = "---\ntitle: 铁盟\nsummary: a\nkeywords: []\nstatus: draft\n---\n\n旧\n";
    const v2 = v1.replace("旧", "作者手改");
    const v3 = v1.replace("旧", "agent 稿");
    await store.write("world", "sect", v1);
    const p = await store.previewWrite("world", "sect", v3);
    await store.write("world", "sect", v2);
    await expect(store.write("world", "sect", p.after, { expectBefore: p.before })).rejects.toThrow("审批期间被改过");
    expect((await store.read("world", "sect"))!.raw).toBe(v2);
    await store.write("world", "sect", p.after, { expectBefore: v2 });
    expect((await store.read("world", "sect"))!.raw).toBe(v3);
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
  test("空项目只有简介的 warning", async () => {
    const issues = await runCheck(store);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((i) => i.kind === "brief" && i.level === "warning")).toBe(true);
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

  test("断档文案：单缺口只写一个数字，不叠床（章纲断档：2）", async () => {
    const mk = (n: string) => `---\ntitle: c${n}\nsummary: s\nkeywords: []\nstatus: draft\nvolume: 1\ncharacters: []\n---\n\n## 本章目标\n\nx\n`;
    await store.write("volumes", "1", "---\ntitle: v\nsummary: s\nkeywords: []\nstatus: draft\nchapters: 1-3\n---\n\nx\n");
    await store.write("chapters", "1", mk("1"));
    await store.write("chapters", "3", mk("3"));
    const issues = await runCheck(store);
    const hit = issues.find((i) => i.message.includes("断档"));
    expect(hit?.message).toBe("章纲断档：2");
  });

  test("缺必填段按 tier 条件算：主角缺语音签名报，配角不报", async () => {
    const mk = (tier: string) => `---\ntitle: 甲\nsummary: s\nkeywords: []\nstatus: draft\ntier: ${tier}\n---\n\n## 一句话\n\nx\n\n## 外在\n\nx\n\n## 内在与欲望\n\nx\n`;
    await store.write("characters", "lead", mk("主角"));
    await store.write("characters", "extra", mk("一般配角"));
    const issues = await runCheck(store);
    const of = (id: string) => issues.filter((i) => i.kind === "characters" && i.id === id).map((i) => i.message);
    expect(of("lead")).toEqual(["缺必填段：语音签名"]);
    expect(of("extra")).toEqual([]);
    const lead = issues.find((i) => i.kind === "characters" && i.id === "lead");
    expect(lead?.fix).toBe("人物「甲」还缺「语音签名」段，帮我补上");
  });

  test("段落只写了「待定」报 warning，点名段", async () => {
    await store.write("characters", "a", "---\ntitle: 甲\nsummary: s\nkeywords: []\nstatus: draft\ntier: 一般配角\n---\n\n## 一句话\n\nx\n\n## 外在\n\nx\n\n## 内在与欲望\n\nx\n\n## 关系\n\n待定\n\n## 弧光\n\n待定（以后再说）\n");
    const issues = await runCheck(store);
    const hit = issues.find((i) => i.kind === "characters" && i.message.includes("待定"));
    expect(hit?.level).toBe("warning");
    expect(hit?.message).toContain("关系、弧光");
  });

  test("线索 type 不在四类之内报 error，合法值不报", async () => {
    const mk = (type: string) => `---\ntitle: 复仇\nsummary: s\nkeywords: []\nstatus: draft\ntype: ${type}\n---\n\n## 起点\n\nx\n\n## 终点\n\nx\n`;
    await store.write("threads", "bad", mk("暗线"));
    await store.write("threads", "ok", mk("小故事"));
    const issues = await runCheck(store);
    const of = (id: string) => issues.filter((i) => i.kind === "threads" && i.id === id);
    expect(of("bad").map((i) => i.message)).toEqual(["type=暗线 不在取值范围内（主线 / 支线 / 主题 / 小故事）"]);
    expect(of("bad")[0]?.level).toBe("error");
    expect(of("ok")).toEqual([]);
  });

  test("里程碑引用不存在的线索报 error", async () => {
    await store.write("threads", "复仇", "---\ntitle: 复仇\nsummary: s\nkeywords: []\nstatus: draft\ntype: 主线\n---\n\n## 起点\n\nx\n\n## 终点\n\nx\n");
    await store.write("milestones", "m1", "---\ntitle: 灭门\nsummary: s\nkeywords: []\nstatus: draft\norder: 1\nthreads: [复仇, 幽灵]\n---\n\n## 发生什么\n\nx\n\n## 之后不可逆的变化\n\nx\n");
    const issues = await runCheck(store);
    expect(issues.filter((i) => i.kind === "milestones").map((i) => i.message)).toEqual(["引用了不存在的线索卡「幽灵」"]);
  });

  test("孤儿线索 / 孤儿里程碑：大纲排起来之后才报", async () => {
    const thread = (id: string) => store.write("threads", id, `---\ntitle: ${id}\nsummary: s\nkeywords: []\nstatus: draft\ntype: 支线\n---\n\n## 起点\n\nx\n\n## 终点\n\nx\n`);
    const ms = (id: string, order: number) => store.write("milestones", id, `---\ntitle: ${id}\nsummary: s\nkeywords: []\nstatus: draft\norder: ${order}\nthreads: []\n---\n\n## 发生什么\n\nx\n\n## 之后不可逆的变化\n\nx\n`);
    await thread("复仇");
    await thread("暗恋");
    await ms("灭门", 1);
    await ms("重逢", 2);
    const before = await runCheck(store);
    expect(before.some((i) => i.message.includes("没有任何"))).toBe(false);

    await store.write("volumes", "1", "---\ntitle: v\nsummary: s\nkeywords: []\nstatus: draft\nmilestones: [灭门]\nchapters: 1-3\n---\n\n## 本卷目标\n\nx\n\n## 里程碑分配\n\nx\n\n## 人物落点\n\nx\n\n## 卷末状态\n\nx\n");
    await store.write("chapters", "1", "---\ntitle: c1\nsummary: s\nkeywords: []\nstatus: draft\nvolume: 1\ncharacters: []\nthreads: [复仇]\n---\n\n## 本章目标\n\nx\n\n## 场景序列\n\nx\n\n## 信息控制\n\nx\n\n## 章末钩子\n\nx\n");
    const after = await runCheck(store);
    const orphans = after.filter((i) => i.message.includes("没有任何"));
    expect(orphans.map((i) => `${i.kind}/${i.id}`).sort()).toEqual(["milestones/重逢", "threads/暗恋"]);
    expect(orphans.every((i) => i.level === "warning")).toBe(true);
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
