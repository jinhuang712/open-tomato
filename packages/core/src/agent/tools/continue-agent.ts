import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { text, type ToolContext } from "./shared.js";

export function makeContinueAgentTool(ctx: ToolContext): ToolDefinition {
  const continueAgent = ctx.continueAgent!;
  return defineTool({
    name: "continue_agent",
    label: "续派子 agent",
    description:
      "接着和一个已经跑完一轮的子 agent 说话，它带着之前的上下文继续干。用于：它给了候选、作者拍板后让它在选中的候选上孵化落盘；或让它按作者意见修改。agentId 从 spawn_agents 结果的标题里取。不要用它重派一个全新的任务。",
    parameters: Type.Object({
      agentId: Type.String({ description: "spawn_agents 结果标题里的 id" }),
      message: Type.String({ description: "发给它的消息：作者拍板了什么、接下来做什么" }),
      mode: Type.Optional(Type.Union([Type.Literal("propose"), Type.Literal("commit")], { description: "要切换它的落盘权限时给：拍板后让它落盘就传 commit；不传保持原样" })),
    }),
    execute: async (_id, params, signal, onUpdate) => {
      const result = await continueAgent(params.agentId, params.message, params.mode, (progress, details) => onUpdate?.({ ...text(progress), details }), signal);
      return { ...text(result.text), details: result.details };
    },
  });
}
