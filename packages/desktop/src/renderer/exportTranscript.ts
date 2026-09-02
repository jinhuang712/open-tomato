import type { AgentInfo, UiMessage, UiPart } from "@opentomato/core/protocol";
import { displayPath } from "./doclink";
import { state } from "./state";

const TOOL_LABELS: Record<string, string> = {
  project_overview: "看盘面",
  list_docs: "列文档",
  read_doc: "读文档",
  search_docs: "搜文档",
  doc_template: "拿模板",
  run_check: "一致性机检",
  write_doc: "写文档",
  ask_user: "问作者",
  spawn_agents: "派子 agent",
};

const ROLE_LABELS: Record<string, string> = {
  architect: "设定师",
  planner: "结构师",
  writer: "执笔",
  critic_market: "市场评审",
  critic_reader: "读者评审",
  critic_voice: "文风评审",
  continuity: "连续性审校",
  arbiter: "裁决",
};

const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));

/** 一条工具调用压成一两行人能读的话，不带 JSON */
function toolLine(part: Extract<UiPart, { type: "tool" }>): string[] {
  const a = (part.args ?? {}) as Record<string, unknown>;
  const label = TOOL_LABELS[part.name] ?? part.name;
  const failed = part.status === "error";
  switch (part.name) {
    case "ask_user": {
      const lines = [`> **问作者**：${s(a.question)}`];
      const opts = Array.isArray(a.options) ? (a.options as string[]) : [];
      if (opts.length) lines.push(`> 选项：${opts.join(" / ")}`);
      lines.push(`> **答**：${part.output.replace(/^作者回答：/, "") || "（未回答）"}`);
      return lines;
    }
    case "write_doc": {
      const rejected = part.output.startsWith("用户拒绝");
      return [`> ✍️ ${rejected ? "拒绝写入" : part.status === "running" ? "等待审批" : "已写入"} ${displayPath(s(a.kind), s(a.id))}${rejected ? `：${part.output}` : ""}`];
    }
    case "read_doc":
      return [`> 📄 读 ${displayPath(s(a.kind), s(a.id))}${a.section ? ` · ${s(a.section)}` : ""}`];
    case "spawn_agents": {
      const tasks = Array.isArray(a.tasks) ? (a.tasks as Array<{ role: string; task: string }>) : [];
      const lines = [`> 👥 派子 agent：${tasks.map((t) => ROLE_LABELS[t.role] ?? t.role).join("、")}`];
      for (const t of tasks) lines.push(`>`, `> **${ROLE_LABELS[t.role] ?? t.role} 的任务书**`, ...t.task.split("\n").map((l) => `> ${l}`));
      if (part.output) lines.push(`>`, `> **回传**`, ...part.output.split("\n").map((l) => `> ${l}`));
      return lines;
    }
    case "search_docs":
      return [`> 🔍 搜「${s(a.query)}」`];
    case "run_check":
      return [`> ✅ 一致性机检：${part.output.split("\n")[0] ?? ""}`];
    default:
      return [`> 🔧 ${label}${failed ? "（失败）" : ""}`];
  }
}

function messageBlock(m: UiMessage, agentLabel: string): string {
  const who = m.role === "user" ? "作者" : agentLabel;
  const time = new Date(m.createdAt).toLocaleString("zh-CN", { hour12: false });
  const lines: string[] = [`### ${who} · ${time}`, ""];
  for (const p of m.parts) {
    if (p.type === "text") lines.push(p.text.trim(), "");
    else if (p.type === "tool") lines.push(...toolLine(p), "");
    // thinking 不导出
  }
  return lines.join("\n").trimEnd();
}

/** 把某个 agent 的会话导成 Markdown；主编会话末尾附上子 agent 的会话 */
export function exportTranscript(agentId: string): { filename: string; content: string } {
  const project = state.project;
  const agent = state.agents[agentId];
  const label = agent?.label ?? agentId;
  const messages = state.transcripts[agentId] ?? [];
  const now = new Date();
  const stamp = now.toISOString().slice(0, 16).replace("T", " ").replace(":", "-");

  const out: string[] = [
    `# ${project?.name ?? "未命名项目"} · ${label}会话`,
    "",
    `- 导出时间：${now.toLocaleString("zh-CN", { hour12: false })}`,
    `- 项目路径：${project?.root ?? ""}`,
    `- 模型：${state.models?.current ? `${state.models.current.provider} / ${state.models.current.id}` : "未选"}`,
    `- 消息数：${messages.length}`,
    "",
    "---",
    "",
  ];
  for (const m of messages) out.push(messageBlock(m, label), "", "---", "");

  if (agentId === "lead") {
    const kids = state.agentOrder.map((id) => state.agents[id]).filter((a): a is AgentInfo => !!a && a.parentId !== null);
    for (const k of kids) {
      const kmsgs = state.transcripts[k.agentId] ?? [];
      if (kmsgs.length === 0) continue;
      out.push(`## 子 agent · ${k.label}`, "", `任务书：${k.task}`, "", "---", "");
      for (const m of kmsgs) out.push(messageBlock(m, k.label), "", "---", "");
    }
  }

  return { filename: `${project?.name ?? "会话"}-${label}-${stamp}.md`, content: out.join("\n").trimEnd() + "\n" };
}
