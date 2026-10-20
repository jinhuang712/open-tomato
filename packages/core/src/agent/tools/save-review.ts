import { text as textValue } from "../../text/load.js";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "./define.js";
import { Type } from "typebox";
import type { RoleId } from "../../protocol.js";
import { DOC_KINDS } from "../../project/kinds.js";
import { contentHash } from "../../project/records.js";
import { ROLES } from "../roles.js";
import { checkedBy, STANDARDS } from "../standards.js";
import { text, type ToolContext } from "./shared.js";

export function makeSaveReviewTool(ctx: ToolContext, role: RoleId): ToolDefinition {
  const { store } = ctx;
  const labels = checkedBy(role).map((id) => STANDARDS[id].label);
  const standard = Type.Optional(
    Type.Union(
      labels.map((l) => Type.Literal(l)),
      { description: textValue("tools/reviews", "save_review.description") },
    ),
  );
  return defineTool({
    name: "save_review",
    label: textValue("tools/reviews", "save_review.label"),
    description: textValue("tools/reviews", "save_review.description_2"),
    parameters: Type.Object({
      chapter: Type.String({ description: textValue("tools/reviews", "save_review.parameters.chapter.description") }),
      verdict: Type.String({ description: textValue("tools/reviews", "save_review.parameters.verdict.description") }),
      items: Type.Array(
        Type.Object({
          level: Type.Union([Type.Literal("must"), Type.Literal("suggest")], { description: textValue("tools/reviews", "save_review.parameters.items.level.description") }),
          where: Type.String({ description: textValue("tools/reviews", "save_review.parameters.items.where.description") }),
          issue: Type.String({ description: textValue("tools/reviews", "save_review.parameters.items.issue.description") }),
          fix: Type.Optional(Type.String({ description: textValue("tools/reviews", "save_review.parameters.items.fix.description") })),
          standard,
        }),
        { maxItems: 12 },
      ),
    }),
    execute: async (_id, params) => {
      const chapter = DOC_KINDS.manuscript.normalizeId(params.chapter);
      const doc = await store.read("manuscript", chapter);
      if (!doc) throw new Error(textValue("messages/materials", "save_review.execute", { v0: chapter }));
      await store.records.saveReview(chapter, { role, version: contentHash(doc.raw), verdict: params.verdict, items: params.items });
      const must = params.items.filter((i) => i.level === "must").length;
      return text(textValue("messages/materials", "save_review.execute_2", { v0: chapter, v1: ROLES[role].label, v2: must, v3: params.items.length - must }));
    },
  });
}
