import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Info as ToolInfo, ToolContext } from "@opencode/plugin/promise/tool";
import { ProjectStore } from "@opentomato/core/headless";
import { materialTools } from "../src/tools.ts";

let root: string;
let store: ProjectStore;
let tools: Map<string, ToolInfo>;

const call = async (name: string, input: Record<string, unknown> = {}) => {
  const tool = tools.get(name);
  if (!tool) throw new Error(`没有工具 ${name}`);
  const context = { id: "call-1", signal: new AbortController().signal } as unknown as ToolContext;
  const result = await tool.execute(input as never, context);
  return String(result.content);
};

const CARD = `---
title: 林尧
summary: 退役刑警，想把妹妹找回来
tier: 主角
---

## 一句话

退役刑警，想把妹妹找回来。
`;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "ot-plugin-"));
  store = await ProjectStore.create(root, "测试书");
  tools = new Map(materialTools(store).map((tool) => [tool.name, tool]));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("materialTools", () => {
  test("工具名与 core 一致，参数是纯 JSON Schema，不进 codemode", () => {
    expect([...tools.keys()].toSorted()).toEqual(
      [
        "doc_template",
        "list_docs",
        "list_open",
        "load_capability",
        "project_overview",
        "read_doc",
        "run_check",
        "search_docs",
      ].toSorted(),
    );
    for (const tool of tools.values()) {
      expect(Object.getOwnPropertySymbols(tool.input)).toEqual([]);
      expect(tool.options).toEqual({ codemode: false, permission: "opentomato" });
    }
  });

  test("read_doc 读全文、按段读，list_docs 列出来", async () => {
    await store.write("characters", "林尧", CARD);
    expect(await call("read_doc", { kind: "人物", id: "林尧" })).toContain("退役刑警");
    expect(await call("read_doc", { kind: "characters", id: "林尧", section: "一句话" })).toContain(
      "想把妹妹找回来",
    );
    expect(await call("list_docs", { kind: "人物" })).toContain("林尧 | 林尧");
  });

  test("读不存在的文档报错，错误带中文路径", async () => {
    await expect(call("read_doc", { kind: "人物", id: "没有这人" })).rejects.toThrow(
      "人物/没有这人",
    );
  });

  test("search_docs 能搜到刚写的卡，run_check 报主角缺语音签名", async () => {
    await store.write("characters", "林尧", CARD);
    expect(await call("search_docs", { query: "妹妹" })).toContain("人物/林尧");
    expect(await call("run_check")).toContain("语音签名");
  });

  test("load_capability 给出能力正文", async () => {
    expect(await call("load_capability", { id: "interview" })).toContain("你进入「立项访谈」");
  });
});
