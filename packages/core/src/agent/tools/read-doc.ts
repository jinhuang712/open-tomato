import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { KIND_SCHEMA, assertKind, text, zhPath, type ToolContext } from "./shared.js";

export function makeReadDocTool(ctx: ToolContext): ToolDefinition {
  const { store } = ctx;
  return defineTool({
    name: "read_doc",
    label: "读文档",
    description: "读一篇文档全文（含 frontmatter）。只关心某段就传 section，只取该「## 段名」下的内容，省上下文；section 写错会报错并列出现有段名。edit_doc 前必须先用它拿原文；章号可以直接给数字。",
    parameters: Type.Object({
      kind: KIND_SCHEMA,
      id: Type.String({ description: "文档 id，章号可以直接给数字" }),
      section: Type.Optional(Type.String({ description: "段名，例如「语音签名」" })),
    }),
    execute: async (_id, params) => {
      const kind = assertKind(params.kind);
      const doc = await store.read(kind, params.id);
      if (!doc) throw new Error(`${zhPath(kind, store.normalizeId(kind, params.id))} 不存在`);
      if (params.section) {
        const s = await store.readSection(kind, params.id, params.section);
        if (s === null) throw new Error(`${doc.path} 没有「${params.section}」段，现有段：${doc.sections.join(" / ")}`);
        return text(s);
      }
      return text(doc.raw);
    },
  });
}
