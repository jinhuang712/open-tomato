import type { AgentInfo } from "@opentomato/core/protocol";
import { createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { actions, state } from "../state";

const DOT: Record<string, string> = { running: "bg-accent", idle: "bg-ink-3", done: "bg-ok", error: "bg-danger" };
const STATUS: Record<string, string> = { running: "运行中", idle: "待命", done: "完成", error: "出错" };

/**
 * agent 气泡：悬在对话区右上角。主编永远第一个，后面是子 agent（新的在前）。
 * 鼠标悬上去自动展开成列表，点某一个进入它的会话；移开自动收起。
 */
export function AgentBubbles() {
  const [open, setOpen] = createSignal(false);
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  const enter = () => {
    clearTimeout(closeTimer);
    setOpen(true);
  };
  const leave = () => {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => setOpen(false), 180);
  };
  onCleanup(() => clearTimeout(closeTimer));

  const agents = createMemo(() => {
    const all = state.agentOrder.map((id) => state.agents[id]).filter((a): a is AgentInfo => !!a);
    return [...all.filter((a) => a.parentId === null), ...all.filter((a) => a.parentId !== null).reverse()];
  });
  const running = () => agents().filter((a) => a.status === "running").length;
  const active = () => (state.view.type === "chat" ? state.view.agentId : null);

  const pick = (a: AgentInfo) => {
    actions.openChat(a.agentId);
    setOpen(false);
  };

  return (
    <Show when={agents().length > 0}>
      <div class="absolute top-3 right-4 z-20 flex flex-col items-end" onMouseEnter={enter} onMouseLeave={leave}>
        {/* 收起态：从上到下一列气泡，点某个直接进入 */}
        <Show when={!open()}>
          <div class="flex flex-col items-center gap-1.5">
            <For each={agents().slice(0, 5)}>
              {(a) => (
                <button
                  class={`relative w-9 h-9 rounded-full border-2 border-paper bg-paper-3 text-xs font-medium flex items-center justify-center shadow transition-transform hover:scale-110 ${
                    active() === a.agentId ? "ring-2 ring-accent" : ""
                  }`}
                  title={`${a.label} · ${STATUS[a.status]}`}
                  onClick={() => pick(a)}
                >
                  {a.label.slice(0, 2)}
                  <span class={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-paper ${DOT[a.status]} ${a.status === "running" ? "animate-pulse" : ""}`} />
                </button>
              )}
            </For>
            <Show when={agents().length > 5}>
              <span class="w-9 h-9 rounded-full border-2 border-paper bg-paper-2 text-xs text-ink-2 flex items-center justify-center shadow">
                +{agents().length - 5}
              </span>
            </Show>
            <Show when={running() > 0}>
              <span class="mt-1 px-2 py-0.5 rounded-full bg-accent-soft text-accent text-xs shadow whitespace-nowrap">{running()} 在跑</span>
            </Show>
          </div>
        </Show>

        {/* 展开态：放大的列表，点某一行进入 */}
        <Show when={open()}>
          <div class="w-[340px] max-h-[60vh] rounded-2xl border border-line bg-paper shadow-2xl overflow-hidden flex flex-col">
            <div class="flex items-center px-3 py-2 border-b border-line text-xs">
              <span class="font-medium">Agents</span>
              <span class="ml-2 text-ink-3">
                {agents().length} 个 · {running()} 个在跑
              </span>
            </div>
            <div class="overflow-y-auto p-1.5 space-y-1">
              <For each={agents()}>
                {(a) => (
                  <button
                    class={`w-full text-left px-2.5 py-2 rounded-xl flex items-start gap-3 ${active() === a.agentId ? "bg-paper-3" : "hover:bg-paper-2"}`}
                    onClick={() => pick(a)}
                  >
                    <span class="relative shrink-0 w-10 h-10 rounded-full bg-paper-3 text-sm font-medium flex items-center justify-center">
                      {a.label.slice(0, 2)}
                      <span class={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-paper ${DOT[a.status]} ${a.status === "running" ? "animate-pulse" : ""}`} />
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="flex items-center gap-2">
                        <span class="font-medium">{a.label}</span>
                        <span class="flex-1" />
                        <span class="text-xs text-ink-3">{STATUS[a.status]}</span>
                      </span>
                      <span class="block mt-0.5 text-xs text-ink-2 line-clamp-2">{a.task || "统筹全局，派单与汇总"}</span>
                      <Show when={a.status === "running" && a.statusText}>
                        <span class="block mt-0.5 text-xs text-accent shimmer w-fit">{a.statusText}</span>
                      </Show>
                    </span>
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
