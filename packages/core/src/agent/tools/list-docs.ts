import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "./define.js";
import { Type } from "typebox";
import { KIND_SCHEMA, assertKind, text, zhDir, type ToolContext } from "./shared.js";

export function makeListDocsTool(ctx: ToolContext): ToolDefinition {
  const { store } = ctx;
  return defineTool({
    name: "list_docs",
    label: "列文档",
    description: "查看某一类的全部文档：列出这一类每篇文档的 id / title / status / summary 和 frontmatter 其他字段。看全书盘面用 project_overview；按关键词找分散在各篇里的内容用 search_docs；需要某一类的全部文档（比如一次读完所有守则）用这个。",
    parameters: Type.Object({ kind: KIND_SCHEMA }),
    execute: async (_id, params) => {
      const kind = assertKind(params.kind);
      const docs = await store.list(kind);
      if (docs.length === 0) return text(`${zhDir(kind)} 下没有文档。`);
      return text(
        docs
          .map((d) => {
            const extra = Object.entries(d.extra)
              .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
              .join(" ");
            return `- ${d.id} | ${d.title} | ${d.status} | ${d.summary}${extra ? ` | ${extra}` : ""}`;
          })
          .join("\n"),
      );
    },
  });
}
