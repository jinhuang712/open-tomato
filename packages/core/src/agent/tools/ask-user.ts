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
      "| single | 挑一个，点即发 | 短名称字符串 |\n" +
      "| multi | 挑若干个 | 短名称字符串；没选的就是不要 |\n" +
      "| checklist | 一组意见逐条表态改 / 不改 | 条目字符串；未表态项保持未决定 |\n" +
      "| compare | 并排读长稿，选一版 | {label, text}，label 短名字，text 完整正文 |\n" +
      "| open | 自由回答（他的感受、只有他知道的事，你给不出候选的） | 空 |\n" +
      "默认摆候选：作者点一下比他组织一段话省力得多，能想出两三个有实质差异的方向就摆出来让他选，其中可以有一个他没要求但你有理由的，附上代价。open 只留给你确实给不出候选的问题——「不知道作者想要什么」不是用 open 的理由，那正是该摆候选的时候。\n" +
      "发出前把 question 念一遍：里面只要排出了「A、B 还是 C」「哪种」「哪个方向」，候选就已经在你手上了——把 A、B、C 挪进 options 走 single，别把选项连着问句一起塞进 question 再标 open，那样作者得自己打字把你刚说的话重述一遍。\n" +
      "候选之间要有实质差异，不为凑数量硬造；用可辨认的短名称，说明写在正文里，不塞进 label。compare 用于需要并排阅读完整内容的比较。界面按 kind 自动补充逃生口，无需重复提供。",
    parameters: Type.Object({
      question: Type.String({ description: "一个清楚、容易回答的问题；一次只问一件事，两个问题分两次问，解释写在正文里，不塞进问题" }),
      kind: Type.Optional(
        Type.Union(
          [Type.Literal("open"), Type.Literal("single"), Type.Literal("multi"), Type.Literal("checklist"), Type.Literal("compare")],
          { description: "提问形态：single 挑一个 / multi 挑若干个 / checklist 逐条表态 / compare 并排对比长稿 / open 自由回答。缺省按 options 形状定" },
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
          { description: "候选。single / multi / checklist 给短字串，compare 给 {label, text}；想得出候选就给，只有确实给不出时才留空走 open" },
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
      // 旧会话的历史里满是 ask_user.say，模型会照着写：内容作者看到了，但下次该直接写正文
      const note = (params as { legacySay?: true }).legacySay ? "\n\n（say 字段已废弃：这次的解释作者看到了，以后解释直接写在正文里，ask_user 只放问题。）" : "";
      return text(formatAnswer(answer) + note);
    },
  });
}
