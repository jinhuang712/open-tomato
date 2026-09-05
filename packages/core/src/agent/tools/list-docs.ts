import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { KIND_SCHEMA, assertKind, text, zhDir, type ToolContext } from "./shared.js";

export function makeListDocsTool(ctx: ToolContext): ToolDefinition {
  const { store } = ctx;
  return defineTool({
    name: "list_docs",
    label: "列文档",
    description: "深挖某一类文档：列出该类下全部条目的 id / title / status / summary 和 frontmatter 其他字段。看全书盘面用 project_overview；按关键词捞散落的内容用 search_docs；明确要一类的全量（比如守则一次拿全）用这个。",
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
