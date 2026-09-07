import type { AgentInfo } from "@opentomato/core/protocol";
import { createMemo, createSignal, For, Show } from "solid-js";
import { actions, state } from "../state";
import { STATUS } from "./agent-status";


export const subAgentCount = () => state.agentOrder.filter((id) => state.agents[id] !== undefined && state.agents[id]!.parentId !== null).length;

/**
 * 顶栏的子 agent 徽章：只要有子 agent 就常驻，跟「等你拍板」同一套语言。
 * 在跑的用 accent，出错的用 danger，都没有就是一句静态的「N 个子 agent」。
 * 悬上去展开列表，点某一个进它的会话。
 */
export function AgentBadge() {
  const [open, setOpen] = createSignal(false);
  const subs = createMemo(() =>
    state.agentOrder
      .map((id) => state.agents[id])
      .filter((a): a is AgentInfo => !!a && a.parentId !== null)
      .reverse(),
  );
  const running = () => subs().filter((a) => a.status === "running").length;
  const errored = () => subs().filter((a) => a.status === "error").length;
  const text = () => {
    if (errored() > 0) return `${errored()} 个子 agent 出错`;
    if (running() > 0) return `${running()} 个子 agent 在跑`;
    return `${subs().length} 个子 agent`;
  };
  const statusOf = (a: AgentInfo) => (a.status === "running" && a.statusText) || a.task || STATUS[a.status];

  return (
    <Show when={subs().length > 0}>
      <div class="relative shrink-0" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
        <button
          class="h-6.5 px-2.5 rounded-md font-medium hover:brightness-110 flex items-center gap-1.5"
          classList={{
            "bg-danger-soft text-danger": errored() > 0,
            "bg-accent-soft text-accent": errored() === 0 && running() > 0,
            "text-ink-2 hover:bg-paper-3": errored() === 0 && running() === 0,
          }}
          onClick={() => actions.openChat(subs()[0]!.agentId)}
        >
          <Show when={running() > 0 && errored() === 0}>
            <span class="w-1.5 h-1.5 rounded-full bg-accent shrink-0 ring-3 ring-accent-soft" />
          </Show>
          {text()}
        </button>
        <Show when={open()}>
          <div class="absolute left-0 top-8 z-30 w-72 py-1 rounded-lg border border-line bg-paper-2 shadow-xl">
            <For each={subs()}>
              {(a) => (
                <div class="group flex items-center hover:bg-paper-3">
                  <button class="flex-1 min-w-0 pl-3 py-1.5 flex items-center gap-2 text-left" onClick={() => actions.openChat(a.agentId)}>
                    <span class="w-5.5 h-5.5 rounded-full bg-paper-4 text-ink-2 flex items-center justify-center text-[11px] shrink-0">
                      {a.label.slice(0, 1)}
                    </span>
                    <span class="shrink-0">{a.label}</span>
                    <span class="flex-1 truncate text-ink-3">{statusOf(a)}</span>
                    <Show when={a.status === "running"}>
                      <span class="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                    </Show>
                    <Show when={a.status === "error"}>
                      <span class="w-1.5 h-1.5 rounded-full bg-danger shrink-0" />
                    </Show>
                  </button>
                  {/* 在跑的不能退，内核也会拒；这里干脆不给按钮 */}
                  <Show when={a.status !== "running"} fallback={<span class="w-3" />}>
                    <button
                      class="px-3 py-1.5 text-ink-3 hover:text-danger opacity-0 group-hover:opacity-100 shrink-0"
                      title="让它退场：删掉会话和上下文"
                      onClick={() => void actions.retireAgent(a.agentId)}
                    >
                      退场
                    </button>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </Show>
  );
}
