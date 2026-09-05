import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { DOC_KINDS } from "../../project/kinds.js";
import { KIND_SCHEMA, assertKind, text, zhDir, type ToolContext } from "./shared.js";

/** 作者说「这笔账不欠」：唯一允许主编代作者写的批。机检对这份材料的建议改随之闭嘴，直到作者收回 */
export function makeSettleTool(ctx: ToolContext): ToolDefinition {
  const { store } = ctx;
  return defineTool({
    name: "settle",
    label: "记下作者说不欠",
    description:
      "作者明确说某份材料的账不欠了（「这条线故意沉两卷」「这个坑留白不填」）就记一条；作者改主意说又欠了就 reopen。只在作者明确说了之后用，不要自己判断。记了之后机检对它的建议改不再报，必须修照报。",
    parameters: Type.Object({
      kind: KIND_SCHEMA,
      id: Type.String({ description: "文档 id" }),
      mode: Type.Union([Type.Literal("defer"), Type.Literal("reopen")], { description: "defer 不欠 / reopen 又欠了" }),
      text: Type.String({ description: "作者的原话" }),
    }),
    execute: async (_id, params) => {
      const kind = assertKind(params.kind);
      const nid = DOC_KINDS[kind].normalizeId(params.id);
      if (!(await store.read(kind, nid))) throw new Error(`${zhDir(kind)}/${nid} 不存在`);
      await store.records.appendMark({ kind, id: nid, type: params.mode === "defer" ? "defer" : "overrule", by: "director", text: params.text });
      await ctx.docsChanged();
      return text(params.mode === "defer" ? `记下了：${zhDir(kind)}/${nid} 不欠，机检对它的建议改不再报。` : `记下了：${zhDir(kind)}/${nid} 重新算欠账。`);
    },
  });
}
