import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { applyEdits } from "../../project/edits.js";
import { KIND_SCHEMA, assertKind, makeApproveAndWrite, zhPath, type ToolContext } from "./shared.js";

export function makeEditDocTool(ctx: ToolContext): ToolDefinition {
  const { store } = ctx;
  const approveAndWrite = makeApproveAndWrite(ctx);
  return defineTool({
    name: "edit_doc",
    label: "改文档",
    description:
      "局部修改一篇已有文档：给若干组 old/new，old 是文件里的原文片段（须唯一匹配，可多带一两行上下文），new 是替换后的文字（空串即删除）。不必复述整篇。不要拿 frontmatter 的「---」当锚点；文档还是空模板、要铺全文请用 write_doc。只改动的部分会以 diff 给用户审批；原文对不上时会报错，请重新 read_doc 取原文再改。",
    parameters: Type.Object({
      kind: KIND_SCHEMA,
      id: Type.String({ description: "文档 id，章号可以直接给数字" }),
      edits: Type.Array(
        Type.Object({
          old: Type.String({ description: "原文片段，逐字照抄（含换行）；空串表示追加到文末" }),
          new: Type.String({ description: "新文字；空串表示删除 old" }),
        }),
        { minItems: 1, maxItems: 20 },
      ),
    }),
    execute: async (toolCallId, params, signal) => {
      const kind = assertKind(params.kind);
      const doc = await store.read(kind, params.id);
      if (!doc) throw new Error(`${zhPath(kind, store.normalizeId(kind, params.id))} 不存在，新建请用 write_doc`);
      const after = applyEdits(doc.raw, params.edits);
      return approveAndWrite(toolCallId, kind, doc.id, after, signal);
    },
  });
}
