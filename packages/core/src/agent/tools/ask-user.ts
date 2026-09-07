import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { formatAnswer } from "../../protocol.js";
import { repairAskArgs, resolveQuestionKind } from "./ask-args.js";
import { text, type ToolContext } from "./shared.js";

export function makeAskUserTool(ctx: ToolContext): ToolDefinition {
  return defineTool({
    name: "ask_user",
    label: "问作者",
    description:
      "向作者提出一个需要回答的问题，并等待回答。用于澄清重要信息、支持创作取舍或帮助探索继续。say 是提问前自然承接对话的话，与普通回复采用相同的表达方式。补充作答所需的背景、关键区别和重要代价；有推荐可以说明理由。可以直接在这里讲清内容，无需先调用 say；前文已经解释充分时不重复铺垫。question 只放问题本身，范围明确、容易回答。不重复询问已有答案，也不为结束当前回合而制造问题。按问题形态选 kind：\n" +
      "| kind | 作者的动作 | options |\n|---|---|---|\n" +
      "| open | 自由回答（书名、感受这类你给不出候选的） | 空 |\n" +
      "| single | 挑一个，点即发 | 短字串 2–6 个 |\n" +
      "| multi | 挑若干个（派哪几个角色、留哪几个人物） | 短字串 2–8 个；没选的就是不要 |\n" +
      "| checklist | 一组意见逐条表态改 / 不改（评审回来问返修哪几条） | 条目 2–8 个，每条一句话；没表态的会单独报给你，由你拿主意并在 say 里说一句 |\n" +
      "| compare | 并排读长稿，选一版（同一段的两种写法、两版小传） | {label, text} 2–4 个，label 短名字，text 完整正文 |\n" +
      "选项应有实质差异，帮助作者表达，同时保留其他方向；不为凑数量制造候选。解释放 say，选项使用可辨认的短名称；compare 用于需要并排阅读完整内容的比较。界面按 kind 自动补充逃生口，无需重复提供。",
    parameters: Type.Object({
      say: Type.Optional(Type.String({ description: "提问前对作者说的话。按需提供理解问题和作出选择所需的信息，可以包含判断、建议或解释。自然承接前文，不重复已讲清的内容；无需补充时可省略。" })),
      question: Type.String({ description: "问作者的问题本身，一两句，一次只问一件事；铺垫和解释放 say" }),
      kind: Type.Optional(
        Type.Union(
          [Type.Literal("open"), Type.Literal("single"), Type.Literal("multi"), Type.Literal("checklist"), Type.Literal("compare")],
          { description: "提问形态：open 自由回答 / single 挑一个 / multi 挑若干个 / checklist 逐条表态 / compare 并排对比长稿。缺省按 options 形状定" },
        ),
      ),
      options: Type.Optional(
        Type.Array(
          Type.Union([
            Type.String(),
            Type.Object({
              label: Type.String({ description: "候选的短名字，作者一眼能认出" }),
              text: Type.String({ description: "候选完整正文，支持 Markdown" }),
            }),
          ]),
          { description: "候选。single / multi / checklist 给短字串，compare 给 {label, text}，按需要提供候选，不强制给开放问题设置选项" },
        ),
      ),
      allowFreeText: Type.Optional(Type.Boolean({ description: "默认 true" })),
    }),
    prepareArguments: repairAskArgs,
    execute: async (_id, params, signal) => {
      const pending = ctx.unrelayedReports?.() ?? [];
      if (pending.length > 0 && !params.say?.trim()) {
        throw new Error(
          `${pending.join("、")}的报告尚未向作者解释。请在本次 ask_user.say 或独立 say 中讲清当前决定所需的信息，再提问；无需逐项复述报告。`,
        );
      }
      const answer = await ctx.gate.requestQuestion(
        {
          agentId: ctx.agentId,
          text: params.question,
          kind: params.kind ?? resolveQuestionKind(undefined, params.options ?? []),
          options: params.options ?? [],
          allowFreeText: params.allowFreeText ?? true,
        },
        signal,
      );
      return text(formatAnswer(answer));
    },
  });
}
