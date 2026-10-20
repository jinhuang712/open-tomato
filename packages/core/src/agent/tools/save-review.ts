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
      { description: "这条意见对应哪条标准，填「归你核对的标准」里的名字；其他检查不填" },
    ),
  );
  return defineTool({
    name: "save_review",
    label: "落审稿记录",
    description: "把这一轮评审结论落进审稿记录。一路评审一份文件，各写各的；同一章审多轮就追加。must 是必须改（章纲承诺没做到、事实冲突、出戏），suggest 是建议看；最多 12 条，where 引原文前 10 字左右。正式清单写这里；向主编报告结论和条数，并可详细说明依据、影响和取舍。",
    parameters: Type.Object({
      chapter: Type.String({ description: "章号，直接给数字" }),
      verdict: Type.String({ description: "一句话结论" }),
      items: Type.Array(
        Type.Object({
          level: Type.Union([Type.Literal("must"), Type.Literal("suggest")], { description: "must 必须改 / suggest 建议看" }),
          where: Type.String({ description: "位置：引原文前 10 字左右" }),
          issue: Type.String({ description: "问题是什么" }),
          fix: Type.Optional(Type.String({ description: "建议怎么改" })),
          standard,
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
      return text(`已记录第 ${chapter} 章的${ROLES[role].label}评审：必须改 ${must} 条、建议看 ${params.items.length - must} 条。向主编报告结论和条数，并按需要说明依据、影响和取舍。`);
    },
  });
}
