import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createTools, type ToolContext } from "../src/agent/tools/index.js";
import { loadPrompt } from "../src/agent/prompt-text.js";
import { ProjectStore } from "../src/project/store.js";

const DOCUMENT_NOTICE = loadPrompt("shared/document-notice");
const SEARCH_NOTICE = loadPrompt("shared/search-notice");

let root: string;
let store: ProjectStore;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "opentomato-notice-"));
  store = await ProjectStore.create(root, "测试书");
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const textOf = (r: unknown) => (r as { content: Array<{ text?: string }> }).content.map((c) => c.text ?? "").join("");

function toolFor(name: string, extra: Partial<ToolContext> = {}) {
  const ctx: ToolContext = {
    store,
    gate: {} as ToolContext["gate"],
    agentId: "x",
    runCheck: async () => [],
    docsChanged: async () => [],
    search: async () => [],
    ...extra,
  };
  const all = createTools(ctx, { canWrite: false, canSpawn: false, canAsk: false });
  const t = all.find((x) => x.name === name);
  if (!t) throw new Error(`没有 ${name}`);
  return (params: unknown) => t.execute("t", params as never, undefined as never, undefined as never, undefined as never);
}

describe("材料来源标签", () => {
  test("read_doc 全文与分段返回都带来源与范围，正文保真", async () => {
    await store.write("characters", "林尧", "---\ntitle: 林尧\nsummary: 主角\nkeywords: []\nstatus: draft\n---\n\n## 一句话\n\n铁匠。\n");
    const read = toolFor("read_doc");

    const full = textOf(await read({ kind: "characters", id: "林尧" }));
    expect(full.startsWith(DOCUMENT_NOTICE)).toBe(true);
    expect(full).toContain("来源：人物/林尧");
    expect(full).toContain("读取范围：全文");
    expect(full).toContain("铁匠。");
    expect(full).toContain("title: 林尧");

    const section = textOf(await read({ kind: "characters", id: "林尧", section: "一句话" }));
    expect(section.startsWith(DOCUMENT_NOTICE)).toBe(true);
    expect(section).toContain("读取范围：一句话");
    expect(section).toContain("铁匠。");
    expect(section).not.toContain("summary: 主角");
  });

  test("web_search 返回带外部材料提示，内容原样保留", async () => {
    const calls: string[] = [];
    // web_search 走 searchWeb 的真实调用路径，用 fetch 桩拦截
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
      calls.push(String(init?.body));
      return new Response(
        JSON.stringify({ result: { content: [{ type: "text", text: "Title: 某网页\nURL: https://example.com\n摘要正文" }] } }),
        { status: 200 },
      );
    }) as typeof fetch;
    try {
      const out = textOf(await toolFor("web_search")({ query: "1999年 上海 快递员 月薪" }));
      expect(out.startsWith(SEARCH_NOTICE)).toBe(true);
      expect(out).toContain("Title: 某网页");
      expect(out).toContain("URL: https://example.com");
      expect(out).toContain("摘要正文");
      expect(calls[0]).toContain("1999年");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
