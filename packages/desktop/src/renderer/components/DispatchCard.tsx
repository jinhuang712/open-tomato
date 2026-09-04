import type { AgentInfo, DispatchDetails, DispatchSlot, UiPart } from "@opentomato/core/protocol";
import { createMemo, createSignal, For, Show } from "solid-js";
import { renderMarkdown } from "../markdown";
import { actions, state } from "../state";

type ToolPart = Extract<UiPart, { type: "tool" }>;

export const ROLE_LABELS: Record<string, string> = {
  designer: "策划",
  plotter: "编剧",
  writer: "写手",
  ops: "运营",
  reader: "读者",
  copyeditor: "文编",
  proofreader: "校对",
  arbiter: "裁决",
};

/** 一张派单里的一个人：角色 + 任务书 + 找得到就挂上真实的 agent；roster 是内核在 details 里给的名册项 */
interface Slot {
  role: string;
  label: string;
  task: string;
  agent: AgentInfo | null;
  roster: DispatchSlot | null;
}

const rosterOf = (part: ToolPart): DispatchSlot[] => {
  const d = part.details as Partial<DispatchDetails> | null | undefined;
  return Array.isArray(d?.slots) ? d.slots : [];
};

/** 回传文本按内核的 `## 角色名（role，id=xxx）` 标题切成每人一段 */
const HEADER = /^## (.+?)（([\w-]+)[,，]\s*id=([\w-]+)）\s*$/m;
function splitReturns(output: string): Array<{ label: string; role: string; agentId: string; body: string }> {
  const out: Array<{ label: string; role: string; agentId: string; body: string }> = [];
  const re = new RegExp(HEADER.source, "gm");
  const marks: Array<{ idx: number; end: number; label: string; role: string; agentId: string }> = [];
  for (let m = re.exec(output); m; m = re.exec(output)) {
    marks.push({ idx: m.index, end: m.index + m[0].length, label: m[1]!, role: m[2]!, agentId: m[3]! });
  }
  marks.forEach((m, i) => {
    const next = marks[i + 1];
    out.push({ ...m, body: output.slice(m.end, next ? next.idx : undefined).trim() });
  });
  return out;
}

/**
 * 派单卡：主编把活派给谁、谁干到哪一步、回传了什么。
 * 一行一个人，行本身就是去那个人会话的门；右侧小箭头展开任务书和回传。
 * 文案只说人和事，不说「子 agent」「工具」。
 */
export function DispatchCard(props: { part: ToolPart }) {
  const [open, setOpen] = createSignal(false);
  const a = () => (props.part.args ?? {}) as Record<string, unknown>;
  const isContinue = () => props.part.name === "continue_agent";
  const returns = createMemo(() => splitReturns(props.part.output));
  const here = () => (state.view.type === "chat" ? state.view.agentId : null);

  const slots = createMemo<Slot[]>(() => {
    const roster = rosterOf(props.part);
    // 新内核：details 里直接有名册，按 agentId 对上
    if (roster.length > 0) {
      return roster.map((r) => ({ role: r.role, label: r.label, task: r.task, agent: state.agents[r.agentId] ?? null, roster: r }));
    }
    // 旧会话回放：没有 details，退回从入参和回传文本里拼
    const all = state.agentOrder.map((id) => state.agents[id]).filter((x): x is AgentInfo => !!x);
    if (isContinue()) {
      const agent = state.agents[String(a().agentId ?? "")] ?? null;
      return [{ role: agent?.role ?? "", label: agent?.label ?? "原来那位", task: String(a().message ?? ""), agent, roster: null }];
    }
    const tasks = Array.isArray(a().tasks) ? (a().tasks as Array<{ role: string; task: string }>) : [];
    const used = new Set<string>();
    return tasks.map((t) => {
      const byId = returns().find((r) => r.role === t.role && !used.has(r.agentId));
      let agent = byId ? (state.agents[byId.agentId] ?? null) : null;
      if (!agent) {
        agent =
          [...all].reverse().find((x) => x.role === t.role && x.task === t.task && x.parentId === here() && !used.has(x.agentId)) ?? null;
      }
      if (agent) used.add(agent.agentId);
      return { role: t.role, label: ROLE_LABELS[t.role] ?? t.role, task: t.task, agent, roster: null };
    });
  });

  /** 状态优先看活着的 agent（有 statusText），其次看名册快照（会话重开后 agent 已不在），最后看工具本身 */
  const statusOf = (s: Slot): { status: string; error: string | null; statusText: string } => {
    if (s.agent) return { status: s.agent.status, error: s.agent.error, statusText: s.agent.statusText };
    if (s.roster) return { status: s.roster.status, error: s.roster.error, statusText: "" };
    return { status: props.part.status, error: null, statusText: "" };
  };

  const phrase = (s: Slot) => {
    const st = statusOf(s);
    if (st.status === "running") return st.statusText || (s.agent || s.roster ? "在干活" : "开始");
    if (st.status === "error") {
      if (st.error) return `失败，${st.error}`;
      if (isContinue() && !s.agent && !s.roster) return "已被回收，得重派";
      return "失败";
    }
    if (st.status === "done") return "已回传";
    return "待命";
  };
  const running = (s: Slot) => statusOf(s).status === "running";
  const failed = (s: Slot) => statusOf(s).status === "error";
  /** 子 agent 会话只活在内存里，项目重开后就没了；名册里的 id 只用来对状态，不能再跳 */
  const targetId = (s: Slot) => s.agent?.agentId ?? null;
  const go = (s: Slot) => {
    const id = targetId(s);
    if (id) actions.openChat(id);
  };

  return (
    <div class="my-2 text-xs">
      <div class="flex items-stretch">
        <div class="w-px bg-line-2 ml-2.5 mr-3 shrink-0" />
        <div class="flex-1 min-w-0">
          <div class="text-ink-3 h-5 flex items-center">{isContinue() ? "续派" : slots().length > 1 ? `派了 ${slots().length} 位` : "派单"}</div>
          <For each={slots()}>
            {(s) => (
              <div class="flex items-center gap-2 h-7 min-w-0">
                <button
                  class="flex items-center gap-2 min-w-0 flex-1 text-left group disabled:cursor-default"
                  disabled={!targetId(s)}
                  title={targetId(s) ? `进 ${s.label} 的会话` : undefined}
                  onClick={() => go(s)}
                >
                  <span
                    class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0"
                    classList={{
                      "bg-accent-soft text-accent": running(s),
                      "bg-danger-soft text-danger": failed(s),
                      "bg-paper-4 text-ink-2": !running(s) && !failed(s),
                    }}
                  >
                    {s.label.slice(0, 1)}
                  </span>
                  <span class="text-ink font-medium shrink-0 group-enabled:group-hover:underline decoration-line-2 underline-offset-2">{s.label}</span>
                  <span class="truncate" classList={{ shimmer: running(s), "text-danger": failed(s), "text-ink-3": !running(s) && !failed(s) }}>
                    {phrase(s)}
                  </span>
                </button>
              </div>
            )}
          </For>
          <button class="h-6 flex items-center gap-1 text-ink-3 hover:text-ink-2" onClick={() => setOpen(!open())}>
            <span>{open() ? "收起" : returns().length > 0 ? "任务书与回传" : "任务书"}</span>
            <span>{open() ? "▾" : "▸"}</span>
          </button>
          <Show when={open()}>
            <div class="mb-1 space-y-4 selectable text-sm">
              <For each={slots()}>
                {(s) => {
                  const rid = () => s.agent?.agentId ?? s.roster?.agentId ?? null;
                  const ret = () => returns().find((r) => (rid() ? r.agentId === rid() : r.role === s.role));
                  return (
                    <div>
                      <div class="text-ink-3 text-xs mb-1">
                        {isContinue() ? "给" : "任务书给"} {s.label}
                      </div>
                      <div class="text-ink-2 whitespace-pre-wrap pl-3 border-l border-line-2">{s.task}</div>
                      <Show when={ret()}>
                        {(r) => (
                          <>
                            <div class="text-ink-3 text-xs mt-3 mb-1">{s.label} 回传</div>
                            <div class="prose-zh text-ink-2 text-xs max-h-80 overflow-auto pl-3 border-l border-line-2" innerHTML={renderMarkdown(r().body)} />
                          </>
                        )}
                      </Show>
                    </div>
                  );
                }}
              </For>
              <Show when={props.part.status === "error" && returns().length === 0 && props.part.output}>
                <pre class="font-mono whitespace-pre-wrap break-words text-xs text-danger">{props.part.output}</pre>
              </Show>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
