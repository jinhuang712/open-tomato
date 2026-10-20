import { text as textValue } from "../../text/load.js";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "./define.js";
import { Type } from "typebox";
import { templateNotes } from "../../project/kinds.js";
import { KIND_SCHEMA, assertKind, text, type ToolContext } from "./shared.js";

export function makeDocTemplateTool(ctx: ToolContext): ToolDefinition {
  const { store } = ctx;
  return defineTool({
    name: "doc_template",
    label: textValue("tools/materials", "doc_template.label"),
    description: textValue("tools/materials", "doc_template.description"),
    parameters: Type.Object({ kind: KIND_SCHEMA }),
    execute: async (_id, params) => {
      const kind = assertKind(params.kind);
      return text(`${store.template(kind)}\n${templateNotes(kind)}`);
    },
  });
}
