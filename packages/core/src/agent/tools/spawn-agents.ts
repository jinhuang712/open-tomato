import { text as textValue } from "../../text/load.js";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "./define.js";
import { Type } from "typebox";
import { ROLE_IDS, ROLES, isRoleId } from "../roles.js";
import { dispatchProblem, text, type SpawnTask, type ToolContext } from "./shared.js";

export function makeSpawnAgentsTool(ctx: ToolContext): ToolDefinition {
  const spawn = ctx.spawn!;
  const roleList = ROLE_IDS.filter((r) => r !== "director")
    .map((r) => `${r}（${ROLES[r].label}：${ROLES[r].description}）`)
    .join("；");
  return defineTool({
    name: "spawn_agents",
    label: textValue("tools/agents", "spawn_agents.label"),
    description: textValue("tools/agents", "spawn_agents.description", { v0: roleList }),
    parameters: Type.Object({
      tasks: Type.Array(
        Type.Object({
          role: Type.Union(ROLE_IDS.filter((r) => r !== "director").map((r) => Type.Literal(r))),
          task: Type.String({ description: textValue("tools/agents", "spawn_agents.parameters.tasks.task.description") }),
          mode: Type.Optional(Type.Union([Type.Literal("propose"), Type.Literal("commit")], { description: textValue("tools/agents", "spawn_agents.parameters.tasks.mode.description") })),
          ephemeral: Type.Optional(Type.Boolean({ description: textValue("tools/agents", "spawn_agents.parameters.tasks.ephemeral.description") })),
          fork: Type.Optional(Type.Boolean({ description: textValue("tools/agents", "spawn_agents.parameters.tasks.fork.description") })),
        }),
        { minItems: 1, maxItems: 6 },
      ),
    }),
    execute: async (_id, params, _signal, onUpdate) => {
      const { store } = ctx;
      const tasks: SpawnTask[] = params.tasks.map((t) => {
        const role: unknown = t.role;
        if (!isRoleId(role) || role === "director") throw new Error(textValue("messages/agents", "spawn_agents.execute", { v0: String(role) }));
        return { role, task: t.task, ...(t.mode ? { mode: t.mode } : {}), ...(t.ephemeral === true ? { ephemeral: true } : {}), ...(t.fork === true ? { fork: true } : {}) };
      });
      const problem = await dispatchProblem(store, tasks.map((t) => t.role));
      if (problem) throw new Error(problem);
      const result = await spawn(tasks, (progress, details) => onUpdate?.({ ...text(progress), details }));
      return { ...text(result.text), details: result.details };
    },
  });
}
