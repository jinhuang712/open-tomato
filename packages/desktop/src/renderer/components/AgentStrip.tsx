import type { AgentInfo } from "@opentomato/core/protocol";
import { createMemo, createSignal, For, Show } from "solid-js";
import { actions, state } from "../state";
import { STATUS } from "./agent-status";


/**
 * 在场的角色：钉在对话区顶部的一行，不随消息滚动，内容和消息同一列宽。
 * 名单只放需要作者注意的人：主编、在跑的、出错的、当前打开的那位。
 * 回传完歇着的不占名单，折成一句「另有 N 位歇着」，点开才列出来。
 * 否则一本书写下来几十位子 agent 都挤在这一行，超宽的直接被裁掉，谁也看不见。
 * 每人只带一个词：跑着的显示它自报的「正在……」，其余显示状态；任务书收进悬停提示。
 * 在子 agent 会话里，列外左沿多一个「回到主编」。只有主编一个人时不显示，没什么可切的。
 */
export function AgentStrip() {
  const [restOpen, setRestOpen] = createSignal(false);
  const active = () => (state.view.type === "chat" ? state.view.agentId : null);
  const all = createMemo(() => state.agentOrder.map((id) => state.agents[id]).filter((a): a is AgentInfo => !!a));
  const lead = () => all().filter((a) => a.parentId === null);
  const subs = () => all().filter((a) => a.parentId !== null).reverse();
  const needsEye = (a: AgentInfo) => a.status === "running" || a.status === "error" || a.agentId === active();
  const shown = createMemo(() => [...lead(), ...subs().filter(needsEye)]);
  const rest = createMemo(() => subs().filter((a) => !needsEye(a)));
  const statusOf = (a: AgentInfo) => (a.status === "running" && a.statusText) || STATUS[a.status];
  const inChild = () => active() !== null && active() !== "director";
  const go = (id: string) => {
    setRestOpen(false);
    actions.openChat(id);
  };

  return (
    <Show when={subs().length > 0 || inChild()}>
      <div class="relative shrink-0 border-b border-line text-xs text-ink-2">
        {/* 「回到主编」放在列外的左沿，不挤占主编在名单里的位置 */}
        <Show when={inChild()}>
          <button class="absolute left-5 top-0 h-9 flex items-center text-ink-2 hover:text-ink" onClick={() => go("director")}>
            ← 回到主编
          </button>
        </Show>
        <div class="max-w-[760px] mx-auto flex items-center gap-4 px-5 h-9">
          <For each={shown()}>
            {(a) => (
              <button
                class="flex items-center gap-2 min-w-0 shrink hover:text-ink"
                classList={{ "text-ink": active() === a.agentId }}
                title={`${a.label} · ${STATUS[a.status]}${a.task ? `\n${a.task}` : ""}`}
                onClick={() => go(a.agentId)}
              >
                <span
                  class="w-5.5 h-5.5 rounded-full flex items-center justify-center text-[11px] shrink-0"
                  classList={{ "bg-ink text-paper": active() === a.agentId, "bg-paper-4 text-ink-2": active() !== a.agentId }}
                >
                  {a.label.slice(0, 1)}
                </span>
                <span class="shrink-0">{a.label}</span>
                <span class="truncate text-ink-3 max-w-[200px]">{statusOf(a)}</span>
                <Show when={a.status === "running"}>
                  <span class="w-1.5 h-1.5 rounded-full bg-accent shrink-0 ring-3 ring-accent-soft" />
                </Show>
                <Show when={a.status === "error"}>
                  <span class="w-1.5 h-1.5 rounded-full bg-danger shrink-0" />
                </Show>
              </button>
            )}
          </For>
          <span class="flex-1" />
          <Show when={rest().length > 0}>
            <div class="relative shrink-0" onMouseEnter={() => setRestOpen(true)} onMouseLeave={() => setRestOpen(false)}>
              <button class="h-9 text-ink-3 hover:text-ink" onClick={() => setRestOpen(!restOpen())}>
                另有 {rest().length} 位歇着
              </button>
              <Show when={restOpen()}>
                <div class="absolute right-0 top-8 z-30 w-72 max-h-80 overflow-auto py-1 rounded-lg border border-line bg-paper-2 shadow-xl">
                  <For each={rest()}>
                    {(a) => (
                      <div class="group flex items-center hover:bg-paper-3">
                        <button class="flex-1 min-w-0 pl-3 py-1.5 flex items-center gap-2 text-left" title={a.task} onClick={() => go(a.agentId)}>
                          <span class="w-5.5 h-5.5 rounded-full bg-paper-4 text-ink-2 flex items-center justify-center text-[11px] shrink-0">
                            {a.label.slice(0, 1)}
                          </span>
                          <span class="shrink-0">{a.label}</span>
                          <span class="flex-1 truncate text-ink-3">{a.task || STATUS[a.status]}</span>
                        </button>
                        {/* 歇着的才有退场：在跑的不在这份名单里 */}
                        <button
                          class="px-3 py-1.5 text-ink-3 hover:text-danger opacity-0 group-hover:opacity-100 shrink-0"
                          title="让它退场：删掉会话和上下文"
                          onClick={() => void actions.retireAgent(a.agentId)}
                        >
                          退场
                        </button>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </Show>
        </div>
      </div>
    </Show>
  );
}
