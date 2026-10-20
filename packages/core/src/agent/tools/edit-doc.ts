import { text as textValue } from "../../text/load.js";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "./define.js";
import { Type } from "typebox";
import { applyEdits } from "../../project/edits.js";
import type { DocKindId } from "../../protocol.js";
import { assertKind, assertWritableKind, makeApproveAndWrite, writableKindSchema, zhPath, type ToolContext } from "./shared.js";

export function makeEditDocTool(ctx: ToolContext, writableKinds: readonly DocKindId[], bookkeepAnyKind = false): ToolDefinition {
  const { store } = ctx;
  const approveAndWrite = makeApproveAndWrite(ctx, writableKinds, bookkeepAnyKind);
  return defineTool({
    name: "edit_doc",
    label: textValue("app/tools/materials", "edit_doc.label"),
    description:
      textValue("app/tools/materials", "edit_doc.description"),
    parameters: Type.Object({
      kind: writableKindSchema(writableKinds, bookkeepAnyKind),
      id: Type.String({ description: textValue("app/tools/materials", "edit_doc.parameters.id.description") }),
      edits: Type.Array(
        Type.Object({
          old: Type.String({ description: textValue("app/tools/materials", "edit_doc.parameters.edits.old.description") }),
          new: Type.String({ description: textValue("app/tools/materials", "edit_doc.parameters.edits.new.description") }),
        }),
        { minItems: 1, maxItems: 20 },
      ),
    }),
    execute: async (toolCallId, params, signal) => {
      const kind = assertKind(params.kind);
      // 越界的先拦，不读别人的文件再报错；放开记账的角色要看改了什么才知道越不越界，交给落盘前那一查
      if (!bookkeepAnyKind) assertWritableKind(kind, writableKinds);
      const doc = await store.read(kind, params.id);
      if (!doc) throw new Error(textValue("app/messages/materials", "edit_doc.execute", { v0: zhPath(kind, store.normalizeId(kind, params.id)) }));
      const after = applyEdits(doc.raw, params.edits);
      return approveAndWrite(toolCallId, kind, doc.id, after, signal);
    },
  });
}
