import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { text, type ToolContext } from "./shared.js";

/**
 * 封存一个子 agent。何时封是判断（候选还悬着的不能封），所以是工具而不是定时清理；
 * 封了它就从在场名单退到历史里，会话留着作者能回看，但不能再 continue_agent。删是作者的事。
 */
export function makeArchiveAgentTool(ctx: ToolContext): ToolDefinition {
  const archiveAgent = ctx.archiveAgent!;
  return defineTool({
    name: "archive_agent",
    label: "封存子 agent",
    description:
      "封存一个跑完的子 agent：它退出在场名单进历史，会话保留可回看，之后不能再 continue_agent。用于：作者已拍板、它已把结果落盘、这条线上不再需要它；或它的候选被作者整体否掉、要换人重来。候选还悬着等拍板的不要封。在跑的不能封。",
    parameters: Type.Object({
      agentId: Type.String({ description: "spawn_agents 结果标题里的 id" }),
    }),
    execute: async (_id, params) => {
      await archiveAgent(params.agentId);
      return text(`${params.agentId} 已封存。`);
    },
  });
}
