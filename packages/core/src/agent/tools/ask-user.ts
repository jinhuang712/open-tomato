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
      "向作者提一个问题，等作者在界面上回答。先在 say 里对作者讲清来龙去脉（刚做了什么、几个候选各是什么路子、差在哪、各自的代价），question 只装问题本身。**按问题形态选 kind**，作者面对一个问题要做的动作只有五种：\n" +
      "| kind | 作者的动作 | options |\n|---|---|---|\n" +
      "| open | 自由回答（书名、感受这类你给不出候选的） | 空 |\n" +
      "| single | 挑一个，点即发 | 短字串 2–6 个 |\n" +
      "| multi | 挑若干个（派哪几个角色、留哪几个人物） | 短字串 2–8 个；没选的就是不要 |\n" +
      "| checklist | 一组意见逐条表态改 / 不改（评审回来问返修哪几条） | 条目 2–8 个，每条一句话；没表态的会单独报给你，由你拿主意并在 say 里说一句 |\n" +
      "| compare | 并排读长稿，选一版（同一段的两种写法、两版小传） | {label, text} 2–4 个，label 短名字，text 完整正文 |\n" +
      "开放问题也尽量给 2–4 个你替作者想好的具体候选（书名就直接给 3 个备选），作者点一下就能选，也能自由输入。选项卡不替代解释：子 agent 刚交回报告，要先用 say 逐条转达，没转达就问会被打回。界面会按 kind 自动补逃生口（换一批 / 混搭 / 你替我定 / 全改 / 先放一放……），你不用重复给。",
    parameters: Type.Object({
      say: Type.String({ description: "问之前对作者说的话：刚做了什么、为什么现在要问、候选之间差在哪。作者先看到这段，再看到问题" }),
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
          { description: "候选。single / multi / checklist 给短字串，compare 给 {label, text}；开放问题也尽量给具体候选，例如书名就直接给 3 个备选书名" },
        ),
      ),
      allowFreeText: Type.Optional(Type.Boolean({ description: "默认 true" })),
    }),
    prepareArguments: repairAskArgs,
    execute: async (_id, params, signal) => {
      const pending = ctx.unrelayedReports?.() ?? [];
      if (pending.length > 0) {
        throw new Error(
          `${pending.join("、")}的报告作者一个字都看不到。先讲清，再问：用 say 把报告读懂后用作者的词重新讲一遍——结论是什么、几个候选各是哪本书、差在哪、各要付什么代价、查到什么硬约束——讲全了再 ask_user。解释放 say 里，不塞进选项。`,
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
