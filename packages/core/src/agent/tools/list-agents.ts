import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { AgentInfo, AgentStatus } from "../../protocol.js";
import { text, type ToolContext } from "./shared.js";

/** 每种状态对派它的人意味着什么：一个词说状态，一句话说下一步该怎么办 */
const MEANING: Record<AgentStatus, { word: string; note: string }> = {
  running: { word: "在跑", note: "报告会自己送到你这儿，不用催" },
  interrupted: { word: "被打断", note: "上一轮被杀了，报告永远不会来——这条线要接着做就重新 spawn_agents" },
  done: { word: "已交回", note: "报告交过了" },
  error: { word: "出错", note: "这一轮失败了，报告里是错误原因" },
  archived: { word: "已封存", note: "这条线收了，不能再 continue_agent" },
  idle: { word: "待命", note: "还没派过活" },
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
    label: "在场的人",
    description:
      "你派出去的人现在各是什么状态：名字 | 角色 | 状态 | 这状态意味着什么 | 任务书。便宜。接回会话后第一件事就查这个：作者按过停止、应用重开过，都会让报告永远送不到你手上，而你的上下文里只留着「已派出」。要停下来等某位交回之前，先用它确认那位真的还在跑。",
    parameters: Type.Object({}),
    execute: async () => {
      const all = listAgents();
      if (all.length === 0) return text("你还没派过人。");
      const live = all.filter((a) => a.status !== "archived");
      const sealed = all.filter((a) => a.status === "archived");
      const lines = [`派出去的人：${live.length} 位在场${sealed.length > 0 ? `，${sealed.length} 位已封存` : ""}`];
      for (const a of [...live, ...sealed]) lines.push(line(a));
      const waiting = live.filter((a) => a.status === "interrupted");
      if (waiting.length > 0) {
        lines.push("", `注意：${waiting.map((a) => a.handle || a.label).join("、")} 的报告不会来了。别再等，要么重派，要么把这条线的活自己接过来。`);
      }
      return text(lines.join("\n"));
    },
  });
}
