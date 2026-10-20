import { text as textValue } from "../../text/load.js";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "./define.js";
import { Type } from "typebox";
import { DOC_KINDS } from "../../project/kinds.js";
import { KIND_SCHEMA, assertKind, text, zhDir, type ToolContext } from "./shared.js";

/** 批是作者对材料说过的话的记录：写手开写前读上一章的，知道作者退回过什么、亲手改过什么 */
export function makeReadMarksTool(ctx: ToolContext): ToolDefinition {
  const { store } = ctx;
  return defineTool({
    name: "read_marks",
    label: textValue("tools/materials", "read_marks.label"),
    description: textValue("tools/materials", "read_marks.description"),
    parameters: Type.Object({ kind: KIND_SCHEMA, id: Type.String({ description: textValue("tools/materials", "read_marks.parameters.id.description") }) }),
    execute: async (_id, params) => {
      const kind = assertKind(params.kind);
      const nid = DOC_KINDS[kind].normalizeId(params.id);
      const marks = await store.records.marks(kind, nid);
      if (marks.length === 0) return text(textValue("messages/materials", "read_marks.execute", { v0: zhDir(kind), v1: nid }));
      const lines: string[] = [];
      for (const m of marks) {
        const when = m.at.slice(0, 16).replace("T", " ");
        if (m.type === "reject") lines.push(`- ${when} 退回：${[m.word, m.text].filter(Boolean).join("，")}`);
        else if (m.type === "approve") lines.push(`- ${when} 放行`);
        else if (m.type === "edit") lines.push(textValue("messages/materials", "read_marks.execute_2", { v0: when, v1: (m.patch ?? "").split("\n").filter((l) => /^[+-][^+-]/.test(l)).slice(0, 24).map((l) => `    ${l}`).join("\n") }));
        else if (m.type === "defer") lines.push(textValue("messages/materials", "read_marks.execute_3", { v0: when, v1: m.text ?? "" }));
        else if (m.type === "overrule") lines.push(textValue("messages/materials", "read_marks.execute_4", { v0: when, v1: m.text ?? "" }));
        else lines.push(`- ${when} ${m.type}：${[m.word, m.text].filter(Boolean).join("，")}`);
      }
      return text(lines.join("\n"));
    },
  });
}
