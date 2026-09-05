import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { RoleId } from "../../protocol.js";
import { DOC_KINDS } from "../../project/kinds.js";
import { contentHash } from "../../project/records.js";
import { ROLES } from "../roles.js";
import { text, type ToolContext } from "./shared.js";

export function makeSaveReviewTool(ctx: ToolContext, role: RoleId): ToolDefinition {
  const { store } = ctx;
  return defineTool({
    name: "save_review",
    label: "落审稿记录",
    description: "把这一轮评审结论落进审稿记录。一路评审一份文件，各写各的；同一章审多轮就追加。must 是必须改（章纲承诺没做到、事实冲突、出戏），suggest 是建议看；最多 12 条，where 引原文前 10 字左右。清单写这里不写回复里，回主编只说结论和条数。",
    parameters: Type.Object({
      chapter: Type.String({ description: "章号，直接给数字" }),
      verdict: Type.String({ description: "一句话结论" }),
      items: Type.Array(
        Type.Object({
          level: Type.Union([Type.Literal("must"), Type.Literal("suggest")], { description: "must 必须改 / suggest 建议看" }),
          where: Type.String({ description: "位置：引原文前 10 字左右" }),
          issue: Type.String({ description: "问题是什么" }),
          fix: Type.Optional(Type.String({ description: "建议怎么改" })),
        }),
        { maxItems: 12 },
      ),
    }),
    execute: async (_id, params) => {
      const chapter = DOC_KINDS.manuscript.normalizeId(params.chapter);
      const doc = await store.read("manuscript", chapter);
      if (!doc) throw new Error(`正文/${chapter} 不存在，审的是哪一章？`);
      await store.records.saveReview(chapter, { role, version: contentHash(doc.raw), verdict: params.verdict, items: params.items });
      const must = params.items.filter((i) => i.level === "must").length;
      return text(`已记录第 ${chapter} 章的${ROLES[role].label}评审：必须改 ${must} 条、建议看 ${params.items.length - must} 条。回主编时只说结论和条数。`);
    },
  });
}
