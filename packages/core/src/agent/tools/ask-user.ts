import { text as textValue } from "../../text/load.js";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "./define.js";
import { Type } from "typebox";
import { formatAnswer } from "../../protocol.js";
import { repairAskArgs, resolveQuestionKind } from "./ask-args.js";
import { text, type ToolContext } from "./shared.js";

export function makeAskUserTool(ctx: ToolContext): ToolDefinition {
  return defineTool({
    name: "ask_user",
    label: textValue("tools/conversation", "ask_user.label"),
    description:
      textValue("tools/conversation", "ask_user.description"),
    parameters: Type.Object({
      question: Type.String({ description: textValue("tools/conversation", "ask_user.parameters.question.description") }),
      kind: Type.Optional(
        Type.Union(
          [Type.Literal("open"), Type.Literal("single"), Type.Literal("multi"), Type.Literal("checklist"), Type.Literal("compare")],
          { description: textValue("tools/conversation", "ask_user.parameters.kind.description") },
        ),
      ),
      options: Type.Optional(
        Type.Array(
          Type.Union([
            Type.String(),
            Type.Object({
              label: Type.String({ description: textValue("tools/conversation", "ask_user.parameters.options.label.description") }),
              text: Type.String({ description: textValue("tools/conversation", "ask_user.parameters.options.text.description") }),
            }),
          ]),
          { description: textValue("tools/conversation", "ask_user.parameters.options.description") },
        ),
      ),
      allowFreeText: Type.Optional(Type.Boolean({ description: textValue("tools/conversation", "ask_user.parameters.allowFreeText.description") })),
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
      const note = (params as { legacySay?: true }).legacySay ? textValue("messages/session", "ask_user.execute") : "";
      return text(formatAnswer(answer) + note);
    },
  });
}
