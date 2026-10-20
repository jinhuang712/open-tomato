import { text as textValue } from "../../text/load.js";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "./define.js";
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
    label: textValue("tools/reviews", "read_review.label"),
    description: textValue("tools/reviews", "read_review.description"),
    parameters: Type.Object({ chapter: Type.String({ description: textValue("tools/reviews", "read_review.parameters.chapter.description") }) }),
    execute: async (_id, params) => {
      const chapter = DOC_KINDS.manuscript.normalizeId(params.chapter);
      const rounds = await store.records.latestReviews(chapter);
      if (rounds.length === 0) return text(textValue("messages/materials", "read_review.execute", { v0: chapter }));
      const doc = await store.read("manuscript", chapter).catch(() => null);
      const current = doc ? contentHash(doc.raw) : null;
      const lines: string[] = [];
      for (const r of rounds) {
        const stale = current && r.version !== current ? textValue("messages/materials", "read_review.execute_2") : "";
        lines.push(`## ${ROLES[r.role].label}${stale}：${r.verdict}`);
        if (r.items.length === 0) lines.push(textValue("messages/materials", "read_review.execute_3"));
        for (const it of r.items) {
          const tag = it.standard ? `${it.standard}｜` : "";
          lines.push(
            `- ${it.level === "must" ? textValue("messages/materials", "read_review.execute_4") : textValue("messages/materials", "read_review.execute_5")}｜${tag}${it.where} → ${it.issue}${it.fix ? ` → ${it.fix}` : ""}`,
          );
        }
      }
      return text(lines.join("\n"));
    },
  });
}
