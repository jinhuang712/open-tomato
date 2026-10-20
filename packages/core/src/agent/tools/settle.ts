import { text as textValue } from "../../text/load.js";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "./define.js";
import { Type } from "typebox";
import { DOC_KINDS } from "../../project/kinds.js";
import { KIND_SCHEMA, assertKind, text, zhDir, type ToolContext } from "./shared.js";

/** 作者说「这笔账不欠」：唯一允许主编代作者写的批。机检对这份材料的建议改随之闭嘴，直到作者收回 */
export function makeSettleTool(ctx: ToolContext): ToolDefinition {
  const { store } = ctx;
  return defineTool({
    name: "settle",
    label: textValue("tools/materials", "settle.label"),
    description:
      textValue("tools/materials", "settle.description"),
    parameters: Type.Object({
      kind: KIND_SCHEMA,
      id: Type.String({ description: textValue("tools/materials", "settle.parameters.id.description") }),
      mode: Type.Union([Type.Literal("defer"), Type.Literal("reopen")], { description: textValue("tools/materials", "settle.parameters.mode.description") }),
      text: Type.String({ description: textValue("tools/materials", "settle.parameters.text.description") }),
    }),
    execute: async (_id, params) => {
      const kind = assertKind(params.kind);
      const nid = DOC_KINDS[kind].normalizeId(params.id);
      if (!(await store.read(kind, nid))) throw new Error(textValue("messages/materials", "settle.execute", { v0: zhDir(kind), v1: nid }));
      await store.records.appendMark({ kind, id: nid, type: params.mode === "defer" ? "defer" : "overrule", by: "director", text: params.text });
      await ctx.docsChanged();
      return text(params.mode === "defer" ? textValue("messages/materials", "settle.execute_2", { v0: zhDir(kind), v1: nid }) : textValue("messages/materials", "settle.execute_3", { v0: zhDir(kind), v1: nid }));
    },
  });
}
