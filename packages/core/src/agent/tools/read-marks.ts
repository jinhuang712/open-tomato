import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { DOC_KINDS } from "../../project/kinds.js";
import { KIND_SCHEMA, assertKind, text, zhDir, type ToolContext } from "./shared.js";

/** 批是作者对材料说过的话的记录：写手开写前读上一章的，知道作者退回过什么、亲手改过什么 */
export function makeReadMarksTool(ctx: ToolContext): ToolDefinition {
  const { store } = ctx;
  return defineTool({
    name: "read_marks",
    label: "读作者的批",
    description: "读一份材料上作者的批：退回时选的词和说的话、放行、亲手改过的地方。写手写第 N 章前读第 N-1 章正文的批，同一句话作者不用说两遍。",
    parameters: Type.Object({ kind: KIND_SCHEMA, id: Type.String({ description: "文档 id，章号可以直接给数字" }) }),
    execute: async (_id, params) => {
      const kind = assertKind(params.kind);
      const nid = DOC_KINDS[kind].normalizeId(params.id);
      const marks = await store.records.marks(kind, nid);
      if (marks.length === 0) return text(`${zhDir(kind)}/${nid} 上作者还没批过什么。`);
      const lines: string[] = [];
      for (const m of marks) {
        const when = m.at.slice(0, 16).replace("T", " ");
        if (m.type === "reject") lines.push(`- ${when} 退回：${[m.word, m.text].filter(Boolean).join("，")}`);
        else if (m.type === "approve") lines.push(`- ${when} 放行`);
        else if (m.type === "edit") lines.push(`- ${when} 作者亲手改了：\n${(m.patch ?? "").split("\n").filter((l) => /^[+-][^+-]/.test(l)).slice(0, 24).map((l) => `    ${l}`).join("\n")}`);
        else if (m.type === "defer") lines.push(`- ${when} 作者说不欠：${m.text ?? ""}`);
        else if (m.type === "overrule") lines.push(`- ${when} 作者收回了之前的「不欠」：${m.text ?? ""}`);
        else lines.push(`- ${when} ${m.type}：${[m.word, m.text].filter(Boolean).join("，")}`);
      }
      return text(lines.join("\n"));
    },
  });
}
