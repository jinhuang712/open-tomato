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
      "向作者提问并等待回答，用于澄清、讨论和创作选择。解释、铺垫写在调用前的正文里，作者会在问题卡上方看到；question 只放问题本身。按问题形态选 kind：\n" +
      "| kind | 作者的动作 | options |\n|---|---|---|\n" +
      "| open | 自由回答（书名、感受这类你给不出候选的） | 空 |\n" +
      "| single | 挑一个，点即发 | 短名称字符串 |\n" +
      "| multi | 挑若干个 | 短名称字符串；没选的就是不要 |\n" +
      "| checklist | 一组意见逐条表态改 / 不改 | 条目字符串；未表态项保持未决定 |\n" +
      "| compare | 并排读长稿，选一版 | {label, text}，label 短名字，text 完整正文 |\n" +
      "选项应有实质差异，帮助作者表达，同时保留其他方向；不为凑数量制造候选。选项使用可辨认的短名称；compare 用于需要并排阅读完整内容的比较。界面按 kind 自动补充逃生口，无需重复提供。",
    parameters: Type.Object({
      question: Type.String({ description: "清楚、容易回答的问题；解释写在正文里，不塞进问题" }),
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
      const answerPromise = ctx.gate.requestQuestion(
        {
          agentId: ctx.agentId,
          text: params.question,
          kind: params.kind ?? resolveQuestionKind(undefined, params.options ?? []),
          options: params.options ?? [],
          allowFreeText: params.allowFreeText ?? true,
        },
        signal,
      );
      const answer = await answerPromise;
      return text(formatAnswer(answer));
    },
  });
}
