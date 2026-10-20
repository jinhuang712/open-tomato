import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ProjectStore } from "@opentomato/core/headless";
import { createBook } from "../src/book.ts";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "ot-book-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("createBook", () => {
  test("插件加载不碰磁盘；没进入口时写作工具让作者先 /open-tomato", async () => {
    const book = createBook(root);
    await expect(book.require()).rejects.toThrow("先输入 /open-tomato");
    expect(await readdir(root)).toEqual([]);
  });

  test("/open-tomato 新建项目，之后写作工具拿到的是同一本书", async () => {
    const book = createBook(root);
    const [a, b] = await Promise.all([book.open(), book.open()]);
    expect(a).toBe(b);
    expect(await ProjectStore.exists(root)).toBe(true);
    expect(await book.require()).toBe(a);
  });

  test("已经是项目的目录（opencode 重启后）直接打开，不用重进入口", async () => {
    await ProjectStore.create(root, "旧书");
    const store = await createBook(root).require();
    expect(store.info.name).toBe("旧书");
  });
});
