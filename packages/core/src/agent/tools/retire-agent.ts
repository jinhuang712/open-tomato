import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { text, type ToolContext } from "./shared.js";

/**
 * 让一个子 agent 退场。何时退是判断（候选还悬着的不能退），所以是工具而不是定时清理；
 * 退了会话就没了，之后只能重新 spawn_agents。
 */
export function makeRetireAgentTool(ctx: ToolContext): ToolDefinition {
  const retireAgent = ctx.retireAgent!;
  return defineTool({
    name: "retire_agent",
    label: "让子 agent 退场",
    description:
      "让一个跑完的子 agent 退场，它的会话和上下文随之删除，之后不能再 continue_agent。用于：作者已拍板、它已把结果落盘、这条线上不再需要它；或它的候选被作者整体否掉、要换人重来。候选还悬着等拍板的不要退。在跑的不能退。",
    parameters: Type.Object({
      agentId: Type.String({ description: "spawn_agents 结果标题里的 id" }),
    }),
    execute: async (_id, params) => {
      await retireAgent(params.agentId);
      return text(`${params.agentId} 已退场。`);
    },
  });
}
