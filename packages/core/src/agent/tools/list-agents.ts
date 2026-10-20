import { text as textValue } from "../../text/load.js";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "./define.js";
import { Type } from "typebox";
import type { AgentInfo, AgentStatus } from "../../protocol.js";
import { text, type ToolContext } from "./shared.js";

/** 每种状态对派它的人意味着什么：一个词说状态，一句话说下一步该怎么办 */
const MEANING: Record<AgentStatus, { word: string; note: string }> = {
  running: { word: "在跑", note: textValue("app/messages/agents", "list_agents.running.note") },
  interrupted: { word: textValue("app/messages/agents", "list_agents.interrupted.word"), note: textValue("app/messages/agents", "list_agents.interrupted.note") },
  done: { word: textValue("app/messages/agents", "list_agents.done.word"), note: textValue("app/messages/agents", "list_agents.done.note") },
  error: { word: "出错", note: textValue("app/messages/agents", "list_agents.error.note") },
  archived: { word: textValue("app/messages/agents", "list_agents.archived.word"), note: textValue("app/messages/agents", "list_agents.archived.note") },
  idle: { word: "待命", note: textValue("app/messages/agents", "list_agents.idle.note") },
};

/** 任务书可能很长，名单上只要认得出是哪一件 */
function clip(task: string): string {
  const one = task.replace(/\s+/g, " ").trim();
  return one.length > 60 ? `${one.slice(0, 60)}…` : one;
}

function line(a: AgentInfo): string {
  const m = MEANING[a.status];
  const why = a.status === "error" && a.error ? `${m.note}：${a.error}` : m.note;
  return `- ${a.handle || a.label} | ${a.label} | ${m.word} | ${why} | ${clip(a.task)}`;
}

/**
 * 派出去的人现在什么状态。
 *
 * 存在的理由：报告的回路是内存里一个 Promise，作者按停止或应用重开都会把它掐断，
 * 而你的上下文里只留着自己说过的「已派出」。不查就会坐等一个不会来的回音——
 * 那是「戛然而止」最常见的一种，不是没活干，是把死人当活人等。
 */
export function makeListAgentsTool(ctx: ToolContext): ToolDefinition {
  const listAgents = ctx.listAgents!;
  return defineTool({
    name: "list_agents",
    label: textValue("app/tools/agents", "list_agents.label"),
    description:
      textValue("app/tools/agents", "list_agents.description"),
    parameters: Type.Object({}),
    execute: async () => {
      const all = listAgents();
      if (all.length === 0) return text(textValue("app/messages/agents", "list_agents.execute"));
      const live = all.filter((a) => a.status !== "archived");
      const sealed = all.filter((a) => a.status === "archived");
      const lines = [textValue("app/messages/agents", "list_agents.execute_3", { v0: live.length, v1: sealed.length > 0 ? textValue("app/messages/agents", "list_agents.execute_2", { v0: sealed.length }) : "" })];
      for (const a of [...live, ...sealed]) lines.push(line(a));
      const waiting = live.filter((a) => a.status === "interrupted");
      if (waiting.length > 0) {
        lines.push("", textValue("app/messages/agents", "list_agents.execute_4", { v0: waiting.map((a) => a.handle || a.label).join("、") }));
      }
      return text(lines.join("\n"));
    },
  });
}
