import type { AgentInfo } from "@opentomato/core/protocol";
import { For, Show } from "solid-js";
import { actions, state } from "../state";

const DOT: Record<string, string> = {
  running: "bg-accent",
  idle: "bg-ink-3",
  done: "bg-ok",
  error: "bg-danger",
};

const STATUS: Record<string, string> = {
  running: "运行中",
  idle: "待命",
  done: "完成",
  error: "出错",
};

export function AgentsPanel() {
  const ordered = () => state.agentOrder.map((id) => state.agents[id]).filter((a): a is AgentInfo => a !== undefined);
  const children = () => ordered().filter((a) => a.parentId !== null);
  const lead = () => state.agents.lead;
  const active = () => (state.view.type === "chat" ? state.view.agentId : null);

  return (
    <div class="flex flex-col h-full">
      <div class="px-4 pt-3 pb-2 text-[11px] uppercase tracking-wider text-ink-3">Agents</div>
      <Show when={lead()}>
        {(l) => (
          <button
            class={`mx-2 px-3 py-2 rounded-lg text-left flex items-center gap-2 ${active() === "lead" ? "bg-paper-3" : "hover:bg-paper-2"}`}
            onClick={() => actions.openChat("lead")}
          >
            <span class={`w-2 h-2 rounded-full ${DOT[l().status]} ${l().status === "running" ? "animate-pulse" : ""}`} />
            <span class="font-medium">{l().label}</span>
            <span class="flex-1" />
            <span class="text-[11px] text-ink-3">{STATUS[l().status]}</span>
          </button>
        )}
      </Show>
      <div class="flex-1 overflow-y-auto mt-2 px-2 space-y-1">
        <Show when={children().length === 0}>
          <div class="px-3 py-6 text-center text-ink-3 text-[12px]">主编派单后，子 agent 会出现在这里</div>
        </Show>
        <For each={children()}>
          {(a) => (
            <button
              class={`w-full px-3 py-2 rounded-lg text-left ${active() === a.agentId ? "bg-paper-3" : "hover:bg-paper-2"}`}
              onClick={() => actions.openChat(a.agentId)}
            >
              <div class="flex items-center gap-2">
                <span class={`w-2 h-2 rounded-full ${DOT[a.status]} ${a.status === "running" ? "animate-pulse" : ""}`} />
                <span class="font-medium">{a.label}</span>
                <span class="text-[11px] text-ink-3 font-mono">{a.role}</span>
                <span class="flex-1" />
                <span class="text-[11px] text-ink-3">{STATUS[a.status]}</span>
              </div>
              <div class="mt-0.5 text-[12px] text-ink-2 line-clamp-2 pl-4">{a.task}</div>
              <Show when={a.error}>
                <div class="mt-0.5 text-[11px] text-danger pl-4 truncate">{a.error}</div>
              </Show>
            </button>
          )}
        </For>
      </div>
    </div>
  );
}
