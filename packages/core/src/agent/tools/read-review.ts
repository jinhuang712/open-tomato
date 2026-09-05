import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { DOC_KINDS } from "../../project/kinds.js";
import { contentHash } from "../../project/records.js";
import { ROLES } from "../roles.js";
import { text, type ToolContext } from "./shared.js";

/** 审稿记录是模型之间的公共记录：评审写、写手返修读、主编汇总读，作者不读 */
export function makeReadReviewTool(ctx: ToolContext): ToolDefinition {
  const { store } = ctx;
  return defineTool({
    name: "read_review",
    label: "读审稿记录",
    description: "读一章的审稿记录：每一路评审最近一轮的结论与清单。写手返修前、主编汇总前先读这个，不要让别人复述。",
    parameters: Type.Object({ chapter: Type.String({ description: "章号，直接给数字" }) }),
    execute: async (_id, params) => {
      const chapter = DOC_KINDS.manuscript.normalizeId(params.chapter);
      const rounds = await store.records.latestReviews(chapter);
      if (rounds.length === 0) return text(`第 ${chapter} 章还没有审稿记录。`);
      const doc = await store.read("manuscript", chapter).catch(() => null);
      const current = doc ? contentHash(doc.raw) : null;
      const lines: string[] = [];
      for (const r of rounds) {
        const stale = current && r.version !== current ? "（审的是上一版正文）" : "";
        lines.push(`## ${ROLES[r.role].label}${stale}：${r.verdict}`);
        if (r.items.length === 0) lines.push("- 没有问题");
        for (const it of r.items) lines.push(`- ${it.level === "must" ? "必须改" : "建议看"}｜${it.where} → ${it.issue}${it.fix ? ` → ${it.fix}` : ""}`);
      }
      return text(lines.join("\n"));
    },
  });
}
