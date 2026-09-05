import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { text, zhPath, type ToolContext } from "./shared.js";

export function makeSearchDocsTool(ctx: ToolContext): ToolDefinition {
  return defineTool({
    name: "search_docs",
    label: "搜文档",
    description: "按关键词全文检索（BM25，中英文都行）所有文档的标题 / 关键词 / 摘要 / 正文，返回命中文档的路径、标题、所在段和命中片段。找散落在各篇里的东西用它；明确知道 kind/id 的直接 read_doc，扫某一类全量用 list_docs。",
    parameters: Type.Object({ query: Type.String({ description: "关键词，如人名、术语、钩子" }), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50, description: "最多返回条数，默认 20" })) }),
    execute: async (_id, params) => {
      const hits = await ctx.search(params.query, params.limit ?? 20);
      if (hits.length === 0) return text("没有命中。");
      return text(
        hits
          .map((h) => `- ${zhPath(h.kind, h.id)} | ${h.title}${h.section ? ` | §${h.section}` : ""} | ${h.snippet}`)
          .join("\n"),
      );
    },
  });
}
