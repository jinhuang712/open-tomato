import { text as textValue } from "../../text/load.js";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "./define.js";
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
    label: textValue("tools/agents", "archive_agent.label"),
    description:
      textValue("tools/agents", "archive_agent.description"),
    parameters: Type.Object({
      agent: Type.String({ description: textValue("tools/agents", "archive_agent.parameters.agent.description") }),
    }),
    execute: async (_id, params) => {
      await archiveAgent(params.agent);
      return text(textValue("messages/agents", "archive_agent.execute", { v0: params.agent }));
    },
  });
}
