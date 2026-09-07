import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { text, type ToolContext } from "./shared.js";

export function makeContinueAgentTool(ctx: ToolContext): ToolDefinition {
  const continueAgent = ctx.continueAgent!;
  return defineTool({
    name: "continue_agent",
    label: "续派子 agent",
    description:
      "接着和一个已经跑完一轮的子 agent 说话，它带着之前的上下文继续干。用于：它给了候选、作者拍板后让它在选中的候选上孵化落盘；或让它按作者意见修改。派出后立刻返回，报告做完后作为新消息送到你这里。agent 填派单名册或报告标题里的名字。不要用它重派一个全新的任务。",
    parameters: Type.Object({
      agent: Type.String({ description: "子 agent 的名字，如 策划1：派单名册和它报告的标题里都是这个" }),
      message: Type.String({ description: "发给它的消息：作者拍板了什么、接下来做什么" }),
      mode: Type.Optional(Type.Union([Type.Literal("propose"), Type.Literal("commit")], { description: "要切换它的落盘权限时给：拍板后让它落盘就传 commit；不传保持原样" })),
    }),
    execute: async (_id, params, _signal, onUpdate) => {
      const result = await continueAgent(params.agent, params.message, params.mode, (progress, details) => onUpdate?.({ ...text(progress), details }));
      return { ...text(result.text), details: result.details };
    },
  });
}
