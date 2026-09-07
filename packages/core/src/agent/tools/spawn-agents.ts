import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { hasOneLineStory, ONE_LINE_STORY_GATE_MESSAGE } from "../../project/gates.js";
import { ROLE_IDS, ROLES, isRoleId } from "../roles.js";
import { STORY_GATED_ROLES, text, type SpawnTask, type ToolContext } from "./shared.js";

export function makeSpawnAgentsTool(ctx: ToolContext): ToolDefinition {
  const spawn = ctx.spawn!;
  const roleList = ROLE_IDS.filter((r) => r !== "director")
    .map((r) => `${r}（${ROLES[r].label}：${ROLES[r].description}）`)
    .join("；");
  return defineTool({
    name: "spawn_agents",
    label: "派子 agent",
    description: `并行派一个或多个子 agent 干活。派出后立刻返回名册（含每人的 id），完成后报告作为新消息交回。可用角色：${roleList}。任务书说明目标、相关材料（kind/id）、本次要求和边界。mode=propose 禁止落盘；mode=commit 允许经审批写入，仅用于具体内容与写入范围已获授权的任务。可用 continue_agent 续接。派 plotter / writer 要求 简介 的「一句话故事」已填，否则会被拒。`,
    parameters: Type.Object({
      tasks: Type.Array(
        Type.Object({
          role: Type.Union(ROLE_IDS.filter((r) => r !== "director").map((r) => Type.Literal(r))),
          task: Type.String({ description: "任务书" }),
          mode: Type.Optional(Type.Union([Type.Literal("propose"), Type.Literal("commit")], { description: "propose=只出候选不落盘；commit=可以落盘。默认 commit" })),
        }),
        { minItems: 1, maxItems: 6 },
      ),
    }),
    execute: async (_id, params, _signal, onUpdate) => {
      const { store } = ctx;
      const tasks: SpawnTask[] = params.tasks.map((t) => {
        const role: unknown = t.role;
        if (!isRoleId(role) || role === "director") throw new Error(`不能派这个角色：${String(role)}`);
        return { role, task: t.task, ...(t.mode ? { mode: t.mode } : {}) };
      });
      if (tasks.some((t) => STORY_GATED_ROLES.has(t.role)) && !(await hasOneLineStory(store))) {
        throw new Error(ONE_LINE_STORY_GATE_MESSAGE);
      }
      const result = await spawn(tasks, (progress, details) => onUpdate?.({ ...text(progress), details }));
      return { ...text(result.text), details: result.details };
    },
  });
}
