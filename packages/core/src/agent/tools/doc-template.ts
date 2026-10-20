import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "./define.js";
import { Type } from "typebox";
import { templateNotes } from "../../project/kinds.js";
import { KIND_SCHEMA, assertKind, text, type ToolContext } from "./shared.js";

export function makeDocTemplateTool(ctx: ToolContext): ToolDefinition {
  const { store } = ctx;
  return defineTool({
    name: "doc_template",
    label: "文档模板",
    description: "拿某一类文档的空白模板（完整文件文本），后面附上必填 / 可选的字段和段落清单。用 write_doc 新建时，在模板基础上填写：只填已定的字段和段，不预置「待填」占位；作者说先放一放的项记进 frontmatter open。",
    parameters: Type.Object({ kind: KIND_SCHEMA }),
    execute: async (_id, params) => {
      const kind = assertKind(params.kind);
      return text(`${store.template(kind)}\n${templateNotes(kind)}`);
    },
  });
}
