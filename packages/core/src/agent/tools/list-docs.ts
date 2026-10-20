import { text as textValue } from "../../text/load.js";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "./define.js";
import { Type } from "typebox";
import { KIND_SCHEMA, assertKind, text, zhDir, type ToolContext } from "./shared.js";

export function makeListDocsTool(ctx: ToolContext): ToolDefinition {
  const { store } = ctx;
  return defineTool({
    name: "list_docs",
    label: textValue("tools/materials", "list_docs.label"),
    description: textValue("tools/materials", "list_docs.description"),
    parameters: Type.Object({ kind: KIND_SCHEMA }),
    execute: async (_id, params) => {
      const kind = assertKind(params.kind);
      const docs = await store.list(kind);
      if (docs.length === 0) return text(textValue("messages/materials", "list_docs.execute", { v0: zhDir(kind) }));
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
