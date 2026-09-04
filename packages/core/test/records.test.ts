import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { contentHash } from "../src/project/records.js";
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

describe("批", () => {
  test("一份材料一个 jsonl，只追加，按写入顺序读回", async () => {
    await store.records.appendMark({ kind: "manuscript", id: "0001", type: "reject", by: "author", word: "太急" });
    await store.records.appendMark({ kind: "manuscript", id: "0001", type: "approve", by: "author", version: contentHash("正文") });
    await store.records.appendMark({ kind: "manuscript", id: "0002", type: "approve", by: "author" });

    const marks = await store.records.marks("manuscript", "0001");
    expect(marks.map((m) => m.type)).toEqual(["reject", "approve"]);
    expect(marks[0]?.word).toBe("太急");
    expect(marks[1]?.version).toBe(contentHash("正文"));
    expect(marks.every((m) => typeof m.at === "string")).toBe(true);
    expect(await store.records.markedIds("manuscript")).toEqual(["0001", "0002"]);
  });

  test("没批过的材料读回空，不报错", async () => {
    expect(await store.records.marks("characters", "林尧")).toEqual([]);
    expect(await store.records.markedIds("threads")).toEqual([]);
  });

  test("批落在 .opentomato/marks 下，不在材料目录里", async () => {
    await store.records.appendMark({ kind: "characters", id: "林尧", type: "edit", by: "author", patch: "" });
    expect(await fs.readFile(path.join(root, ".opentomato", "marks", "characters", "林尧.jsonl"), "utf8")).toContain('"type":"edit"');
    expect(await store.list("characters")).toEqual([]);
  });
});

describe("审稿记录", () => {
  test("一路一个文件，各写各的，读时按时间合并", async () => {
    await store.records.saveReview("0003", { role: "ops", version: "v1", verdict: "留得住", items: [{ level: "suggest", where: "开头", issue: "慢" }] });
    await store.records.saveReview("0003", { role: "proofreader", version: "v1", verdict: "有冲突", items: [{ level: "must", where: "第二段", issue: "他不识字却读了信", fix: "改成让人念" }] });

    const dir = path.join(root, ".opentomato", "reviews", "0003");
    expect((await fs.readdir(dir)).sort()).toEqual(["ops.json", "proofreader.json"]);
    const all = await store.records.reviews("0003");
    expect(all.map((r) => r.role)).toEqual(["ops", "proofreader"]);
    expect(all[1]?.items[0]?.level).toBe("must");
  });

  test("同一路审两轮追加，latestReviews 每路只取最近一轮", async () => {
    await store.records.saveReview("0003", { role: "reader", version: "v1", verdict: "一般", items: [] });
    await store.records.saveReview("0003", { role: "reader", version: "v2", verdict: "好多了", items: [] });
    expect((await store.records.reviews("0003")).length).toBe(2);
    const latest = await store.records.latestReviews("0003");
    expect(latest.length).toBe(1);
    expect(latest[0]?.verdict).toBe("好多了");
  });

  test("没审过的章读回空", async () => {
    expect(await store.records.reviews("0099")).toEqual([]);
  });
});
