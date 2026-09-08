import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { hasOneLineStory, ONE_LINE_STORY_GATE_MESSAGE } from "../../project/gates.js";
import { ROLE_IDS, ROLES, isRoleId } from "../roles.js";
import { REVIEW_ROLES, STORY_GATED_ROLES, text, type SpawnTask, type ToolContext } from "./shared.js";

export function makeSpawnAgentsTool(ctx: ToolContext): ToolDefinition {
  const spawn = ctx.spawn!;
  const roleList = ROLE_IDS.filter((r) => r !== "director")
    .map((r) => `${r}（${ROLES[r].label}：${ROLES[r].description}）`)
    .join("；");
  return defineTool({
    name: "spawn_agents",
    label: "派子 agent",
    description: `并行派一个或多个子 agent 干活。派出后立刻返回名册（每人一个名字，如 策划1），完成后报告作为新消息交回。可用角色：${roleList}。任务书三行：干什么（kind/id）、按哪个决定、落盘边界；背景已在文档里就不重讲，刚聊透的落地贴上拍板结论几行。mode=propose 禁止落盘；mode=commit 允许经审批写入，仅用于具体内容与写入范围已获授权的任务。ephemeral=true 是一次性任务（评审小检等无状态判断）：会话只在内存、不落盘，报告交回即焚，不能 continue_agent；需要迭代、同线续派的别用。fork=true 会把主编与作者的讨论全文转交过去（刚聊透的落地用），任务书只写增量，与纪要冲突以任务书为准；问策、评审通常不用。同线迭代用 continue_agent 续派原人，不要重派全新任务。派 plotter / writer 要求 简介 的「一句话故事」已填，否则会被拒。`,
    parameters: Type.Object({
      tasks: Type.Array(
        Type.Object({
          role: Type.Union(ROLE_IDS.filter((r) => r !== "director").map((r) => Type.Literal(r))),
          task: Type.String({ description: "任务书" }),
          mode: Type.Optional(Type.Union([Type.Literal("propose"), Type.Literal("commit")], { description: "propose=只出候选不落盘；commit=可以落盘。默认 commit" })),
          ephemeral: Type.Optional(Type.Boolean({ description: "一次性任务：会话只在内存、不落盘，报告交回即焚，不能续派。评审小检这类无状态判断用；需要迭代的别用。默认 false" })),
          fork: Type.Optional(Type.Boolean({ description: "带上主编与作者的讨论全文转交，任务书只写增量。刚聊透的落地用；问策、评审通常不用。默认 false" })),
        }),
        { minItems: 1, maxItems: 6 },
      ),
    }),
    execute: async (_id, params, _signal, onUpdate) => {
      const { store } = ctx;
      const tasks: SpawnTask[] = params.tasks.map((t) => {
        const role: unknown = t.role;
        if (!isRoleId(role) || role === "director") throw new Error(`不能派这个角色：${String(role)}`);
        return { role, task: t.task, ...(t.mode ? { mode: t.mode } : {}), ...(t.ephemeral === true ? { ephemeral: true } : {}), ...(t.fork === true ? { fork: true } : {}) };
      });
      if (tasks.some((t) => STORY_GATED_ROLES.has(t.role)) && !(await hasOneLineStory(store))) {
        throw new Error(ONE_LINE_STORY_GATE_MESSAGE);
      }
      // 无谓派单的粗闸：写手没章纲可依、评审没正文可审，派出去也是空转一轮
      if (tasks.some((t) => t.role === "writer") && (await store.list("chapters")).length === 0) {
        throw new Error("还没有章纲，写手无从下笔；先走大纲编排把章纲排出来");
      }
      if (tasks.some((t) => REVIEW_ROLES.has(t.role)) && (await store.list("manuscript")).length === 0) {
        throw new Error("还没有正文可审；先把章节写出来");
      }
      const result = await spawn(tasks, (progress, details) => onUpdate?.({ ...text(progress), details }));
      return { ...text(result.text), details: result.details };
    },
  });
}
