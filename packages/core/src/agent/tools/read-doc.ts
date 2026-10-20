import { text as textValue } from "../../text/load.js";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "./define.js";
import { Type } from "typebox";
import { KIND_SCHEMA, assertKind, text, zhPath, type ToolContext } from "./shared.js";

const DOCUMENT_NOTICE = textValue("messages/session", "document-notice");

export function makeReadDocTool(ctx: ToolContext): ToolDefinition {
  const { store } = ctx;
  return defineTool({
    name: "read_doc",
    label: textValue("tools/materials", "read_doc.label"),
    description: textValue("tools/materials", "read_doc.description"),
    parameters: Type.Object({
      kind: KIND_SCHEMA,
      id: Type.String({ description: textValue("tools/materials", "read_doc.parameters.id.description") }),
      section: Type.Optional(Type.String({ description: textValue("tools/materials", "read_doc.parameters.section.description") })),
    }),
    execute: async (_id, params) => {
      const kind = assertKind(params.kind);
      const doc = await store.read(kind, params.id);
      if (!doc) throw new Error(textValue("messages/materials", "read_doc.execute", { v0: zhPath(kind, store.normalizeId(kind, params.id)) }));
      const prefix = textValue("messages/materials", "read_doc.execute_2", { v0: DOCUMENT_NOTICE, v1: doc.path, v2: params.section || "全文" });
      if (params.section) {
        const s = await store.readSection(kind, params.id, params.section);
        if (s === null) throw new Error(textValue("messages/materials", "read_doc.execute_3", { v0: doc.path, v1: params.section, v2: doc.sections.join(" / ") }));
        return text(prefix + s);
      }
      return text(prefix + doc.raw);
    },
  });
}
