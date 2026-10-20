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

const call = async (name: string, input: Record<string, unknown> = {}, agent = "主编") => {
  const tool = tools.get(name);
  if (!tool) throw new Error(`没有工具 ${name}`);
  const context = {
    id: "call-1",
    agent,
    signal: new AbortController().signal,
  } as unknown as ToolContext;
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
  tools = new Map(materialTools(async () => store).map((tool) => [tool.name, tool]));
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
        "read_review",
        "run_check",
        "save_review",
        "search_docs",
        "volume_rhythm",
      ].toSorted(),
    );
    for (const tool of tools.values()) {
      expect(Object.getOwnPropertySymbols(tool.input)).toEqual([]);
      expect(tool.options).toEqual({ codemode: false, permission: `opentomato.${tool.name}` });
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

  test("宿主只适配工具说明，材料和审稿记录中的工具名称保持原文", async () => {
    const quoted = "ask_user spawn_agents continue_agent write_doc edit_doc web_search {{example}}";
    await store.write("characters", "林尧", CARD + "\n" + quoted + "\n");
    expect(await call("read_doc", { kind: "characters", id: "林尧" })).toContain(quoted);
    expect(tools.get("read_doc")!.description).toContain("局部修改前必须先用它拿原文");
    expect(tools.get("read_doc")!.description).not.toContain("edit_doc");
    const body = await call("load_capability", { id: "design" });
    expect(body).toContain("只出候选，不落盘");
    expect(body).not.toMatch(/mode=propose|write_doc|spawn_agents/);
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
    expect(await call("load_capability", { id: "interview" })).toContain("你加载了「立项访谈」");
  });

  test("save_review 以调用它的那一路评审落记录，read_review 读得到；别的角色落不了", async () => {
    await store.write(
      "manuscript",
      "0001",
      "---\ntitle: 雨夜\nsummary: 回城\n---\n\n雨下了一夜。\n",
    );
    const review = {
      chapter: "1",
      verdict: "节奏偏慢",
      items: [{ level: "must", where: "雨下了一夜", issue: "开头没有钩子" }],
    };
    expect(await call("save_review", review, "文编")).toContain("文编评审：必须改 1 条");
    expect(await call("read_review", { chapter: "1" }, "写手")).toContain("## 文编：节奏偏慢");
    await expect(call("save_review", review, "写手")).rejects.toThrow("只有评审");
  });
});
