import { text as textValue } from "../../text/load.js";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "./define.js";
import { Type } from "typebox";
import { text, zhPath, type ToolContext } from "./shared.js";

export function makeSearchDocsTool(ctx: ToolContext): ToolDefinition {
  return defineTool({
    name: "search_docs",
    label: textValue("tools/materials", "search_docs.label"),
    description: textValue("tools/materials", "search_docs.description"),
    parameters: Type.Object({ query: Type.String({ description: textValue("tools/materials", "search_docs.parameters.query.description") }), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50, description: textValue("tools/materials", "search_docs.parameters.limit.description") })) }),
    execute: async (_id, params) => {
      const hits = await ctx.search(params.query, params.limit ?? 20);
      if (hits.length === 0) return text(textValue("messages/materials", "search_docs.execute"));
      return text(
        hits
          .map((h) => `- ${zhPath(h.kind, h.id)} | ${h.title}${h.section ? ` | §${h.section}` : ""} | ${h.snippet}`)
          .join("\n"),
      );
    },
  });
}
