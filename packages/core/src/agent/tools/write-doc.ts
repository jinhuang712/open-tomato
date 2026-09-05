import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { KIND_SCHEMA, assertKind, makeApproveAndWrite, type ToolContext } from "./shared.js";

export function makeWriteDocTool(ctx: ToolContext): ToolDefinition {
  const approveAndWrite = makeApproveAndWrite(ctx);
  return defineTool({
    name: "write_doc",
    label: "写文档",
    description:
      "新建文档或整篇重写：写入完整文件文本（含 frontmatter，用 doc_template 拿模板）。改已有文档的局部请用 edit_doc。会先在界面上给用户看 diff，用户批准后才真正写入；被拒时返回原因。",
    parameters: Type.Object({
      kind: KIND_SCHEMA,
      id: Type.String({ description: "文档 id：卡片用中文名（如 林尧），章号 / 卷号给数字；守则留空自动编号；简介随便填都落到同一份" }),
      content: Type.String({ description: "完整文件文本，必须以 --- 开头的 frontmatter 起始" }),
    }),
    execute: async (toolCallId, params, signal) => {
      const kind = assertKind(params.kind);
      if (!/^---\r?\n/.test(params.content)) {
        throw new Error("content 必须以 frontmatter（--- 开头）起始，先用 doc_template 拿模板");
      }
      return approveAndWrite(toolCallId, kind, params.id, params.content, signal);
    },
  });
}
