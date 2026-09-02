import type { AgentInfo } from "@opentomato/core/protocol";
import { createMemo, createSignal, For, Show } from "solid-js";
import { actions, state } from "../state";

const DOT: Record<string, string> = { running: "bg-accent", idle: "bg-ink-3", done: "bg-ok", error: "bg-danger" };
const STATUS: Record<string, string> = { running: "运行中", idle: "待命", done: "完成", error: "出错" };

/**
 * 子 agent 气泡：悬在对话区右上角。
 * 收起时叠成一摞（最多露三个 + 计数），点开变成可滚动列表，点某一个进入它的会话。
 */
export function AgentBubbles() {
  const [open, setOpen] = createSignal(false);
  const children = createMemo(() =>
    state.agentOrder
      .map((id) => state.agents[id])
      .filter((a): a is AgentInfo => !!a && a.parentId !== null)
      .reverse(),
  );
  const running = () => children().filter((a) => a.status === "running").length;
  const active = () => (state.view.type === "chat" ? state.view.agentId : null);

  const pick = (a: AgentInfo) => {
    actions.openChat(a.agentId);
    setOpen(false);
  };

  return (
    <Show when={children().length > 0}>
      <div class="absolute top-3 right-4 z-20 flex flex-col items-end gap-2">
        {/* 收起态：一摞气泡 */}
        <Show when={!open()}>
          <button class="flex items-center -space-x-2 group" onClick={() => setOpen(true)} title="展开子 agent">
            <For each={children().slice(0, 3)}>
              {(a) => (
                <span
                  class={`relative w-9 h-9 rounded-full border-2 border-paper bg-paper-3 text-[12px] font-medium flex items-center justify-center shadow ${
                    active() === a.agentId ? "ring-2 ring-accent" : ""
                  }`}
                >
                  {a.label.slice(0, 2)}
                  <span class={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-paper ${DOT[a.status]} ${a.status === "running" ? "animate-pulse" : ""}`} />
                </span>
              )}
            </For>
            <Show when={children().length > 3}>
              <span class="w-9 h-9 rounded-full border-2 border-paper bg-paper-2 text-[11px] text-ink-2 flex items-center justify-center shadow">
                +{children().length - 3}
              </span>
            </Show>
            <Show when={running() > 0}>
              <span class="ml-4 px-2 py-0.5 rounded-full bg-accent-soft text-accent text-[11px] shadow">{running()} 个在跑</span>
            </Show>
          </button>
        </Show>

        {/* 展开态：列表 */}
        <Show when={open()}>
          <div class="w-[320px] max-h-[60vh] rounded-2xl border border-line bg-paper shadow-2xl overflow-hidden flex flex-col">
            <div class="flex items-center px-3 py-2 border-b border-line text-[12px]">
              <span class="font-medium">子 agent</span>
              <span class="ml-2 text-ink-3">{children().length} 个 · {running()} 个在跑</span>
              <span class="flex-1" />
              <button class="text-ink-3 hover:text-ink px-1" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>
            <div class="overflow-y-auto p-1.5 space-y-1">
              <For each={children()}>
                {(a) => (
                  <button
                    class={`w-full text-left px-3 py-2 rounded-xl ${active() === a.agentId ? "bg-paper-3" : "hover:bg-paper-2"}`}
                    onClick={() => pick(a)}
                  >
                    <div class="flex items-center gap-2">
                      <span class={`w-2 h-2 rounded-full ${DOT[a.status]} ${a.status === "running" ? "animate-pulse" : ""}`} />
                      <span class="font-medium">{a.label}</span>
                      <span class="flex-1" />
                      <span class="text-[11px] text-ink-3">{STATUS[a.status]}</span>
                    </div>
                    <div class="mt-0.5 pl-4 text-[12px] text-ink-2 line-clamp-2">{a.task}</div>
                  </button>
                )}
              </For>
            </div>
          </div>
        </Show>
      </div>
    </Show>
  );
}
