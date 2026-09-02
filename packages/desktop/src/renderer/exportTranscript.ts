import type { AgentInfo, UiMessage } from "@opentomato/core/protocol";
import { state } from "./state";

/** JSONL 的首行：整份导出的元信息 */
interface MetaRecord {
  type: "meta";
  exportedAt: string;
  project: { name: string; root: string } | null;
  model: { provider: string; id: string } | null;
  agent: { agentId: string; label: string; role: string | null; task: string | null };
  messageCount: number;
}

/** JSONL 的其余行：一条消息一行，带上所属 agent，便于按 agent 过滤 */
interface MessageRecord {
  type: "message";
  agentId: string;
  agentLabel: string;
  parentId: string | null;
  id: string;
  role: UiMessage["role"];
  createdAt: string;
  parts: UiMessage["parts"];
}

function messageRecord(m: UiMessage, agent: { agentId: string; label: string; parentId: string | null }): MessageRecord {
  return {
    type: "message",
    agentId: agent.agentId,
    agentLabel: agent.label,
    parentId: agent.parentId,
    id: m.id,
    role: m.role,
    createdAt: new Date(m.createdAt).toISOString(),
    // thinking 不导出，其余 part 原样保留（含工具调用的 args / output）
    parts: m.parts.filter((p) => p.type !== "thinking"),
  };
}

/** 把某个 agent 的会话导成 JSONL；主编会话末尾附上子 agent 的会话 */
export function exportTranscript(agentId: string): { filename: string; content: string } {
  const project = state.project;
  const agent = state.agents[agentId];
  const label = agent?.label ?? agentId;
  const messages = state.transcripts[agentId] ?? [];
  const now = new Date();
  const stamp = now.toISOString().slice(0, 16).replace("T", " ").replace(":", "-");

  const self = { agentId, label, parentId: agent?.parentId ?? null };
  const records: MessageRecord[] = messages.map((m) => messageRecord(m, self));

  if (agentId === "lead") {
    const kids = state.agentOrder.map((id) => state.agents[id]).filter((a): a is AgentInfo => !!a && a.parentId !== null);
    for (const k of kids) {
      for (const m of state.transcripts[k.agentId] ?? []) records.push(messageRecord(m, k));
    }
  }

  const meta: MetaRecord = {
    type: "meta",
    exportedAt: now.toISOString(),
    project: project ? { name: project.name, root: project.root } : null,
    model: state.models?.current ? { provider: state.models.current.provider, id: state.models.current.id } : null,
    agent: { agentId, label, role: agent?.role ?? null, task: agent?.task ?? null },
    messageCount: records.length,
  };

  const lines = [meta, ...records].map((r) => JSON.stringify(r));
  return { filename: `${project?.name ?? "会话"}-${label}-${stamp}.jsonl`, content: lines.join("\n") + "\n" };
}
