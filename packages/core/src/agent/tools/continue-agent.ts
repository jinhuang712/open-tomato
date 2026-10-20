import { text as textValue } from "../../text/load.js";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "./define.js";
import { Type } from "typebox";
import { text, type ToolContext } from "./shared.js";

export function makeContinueAgentTool(ctx: ToolContext): ToolDefinition {
  const continueAgent = ctx.continueAgent!;
  return defineTool({
    name: "continue_agent",
    label: textValue("app/tools/agents", "continue_agent.label"),
    description:
      textValue("app/tools/agents", "continue_agent.description"),
    parameters: Type.Object({
      agent: Type.String({ description: textValue("app/tools/agents", "continue_agent.parameters.agent.description") }),
      message: Type.String({ description: textValue("app/tools/agents", "continue_agent.parameters.message.description") }),
      mode: Type.Optional(Type.Union([Type.Literal("propose"), Type.Literal("commit")], { description: textValue("app/tools/agents", "continue_agent.parameters.mode.description") })),
    }),
    execute: async (_id, params, _signal, onUpdate) => {
      const result = await continueAgent(params.agent, params.message, params.mode, (progress, details) => onUpdate?.({ ...text(progress), details }));
      return { ...text(result.text), details: result.details };
    },
  });
}
