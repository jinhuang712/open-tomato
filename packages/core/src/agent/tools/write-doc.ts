import { text as textValue } from "../../text/load.js";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "./define.js";
import { Type } from "typebox";
import type { DocKindId } from "../../protocol.js";
import { assertKind, makeApproveAndWrite, writableKindSchema, type ToolContext } from "./shared.js";

export function makeWriteDocTool(ctx: ToolContext, writableKinds: readonly DocKindId[]): ToolDefinition {
  const approveAndWrite = makeApproveAndWrite(ctx, writableKinds);
  return defineTool({
    name: "write_doc",
    label: textValue("tools/materials", "write_doc.label"),
    description:
      textValue("tools/materials", "write_doc.description"),
    parameters: Type.Object({
      kind: writableKindSchema(writableKinds),
      id: Type.String({ description: textValue("tools/materials", "write_doc.parameters.id.description") }),
      content: Type.String({ description: textValue("tools/materials", "write_doc.parameters.content.description") }),
    }),
    execute: async (toolCallId, params, signal) => {
      const kind = assertKind(params.kind);
      if (!/^---\r?\n/.test(params.content)) {
        throw new Error(textValue("messages/materials", "write_doc.execute"));
      }
      return approveAndWrite(toolCallId, kind, params.id, params.content, signal);
    },
  });
}
