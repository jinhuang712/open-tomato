import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { repairAskArgs } from "./ask-args.js";
import { text, type ToolContext } from "./shared.js";

export function makeAskUserTool(ctx: ToolContext): ToolDefinition {
  return defineTool({
    name: "ask_user",
    label: "问作者",
    description:
      "向作者提一个问题，等作者在界面上回答。先在 say 里对作者讲清来龙去脉（刚做了什么、几个候选各是什么路子、差在哪、各自的代价），question 只装问题本身。**每次都要给 options**：封闭问题给明确选项；开放问题（书名、故事、人名这类）给 2–4 个你替作者想好的具体候选，作者点一下就能选，也能自由输入。候选是一大段文字（比如同一段的两种写法、两版人物小传）时，用 {label, text} 形式：label 是短名字（「主角是 A」「留白版」），text 是完整正文，界面会把它们并排铺开给作者对比。选项卡不替代解释：子 agent 刚交回的东西作者看不到原话，尤其要在 say 里讲清再问。界面会按候选形态自动补逃生口（换一批 / 混搭 / 你替我定 / 先放一放），你不用重复给。",
    parameters: Type.Object({
      say: Type.String({ description: "问之前对作者说的话：刚做了什么、为什么现在要问、候选之间差在哪。作者先看到这段，再看到问题" }),
      question: Type.String({ description: "问作者的问题本身，一两句，一次只问一件事；铺垫和解释放 say" }),
      options: Type.Optional(
        Type.Array(
          Type.Union([
            Type.String(),
            Type.Object({
              label: Type.String({ description: "候选的短名字，作者一眼能认出" }),
              text: Type.String({ description: "候选完整正文，支持 Markdown" }),
            }),
          ]),
          { description: "可选项 2–6 个。开放问题也要给具体候选，例如书名就直接给 3 个备选书名；长文本候选用 {label, text}" },
        ),
      ),
      allowFreeText: Type.Optional(Type.Boolean({ description: "默认 true" })),
    }),
    prepareArguments: repairAskArgs,
    execute: async (_id, params, signal) => {
      const answer = await ctx.gate.requestQuestion(
        {
          agentId: ctx.agentId,
          text: params.question,
          options: params.options ?? [],
          allowFreeText: params.allowFreeText ?? true,
        },
        signal,
      );
      return text(`作者回答：${answer}`);
    },
  });
}
