import type { AgentInfo } from "@opentomato/core/protocol";
import { createMemo, For, Show } from "solid-js";
import { actions, state } from "../state";

const STATUS: Record<string, string> = { running: "运行中", idle: "待命", done: "完成", error: "出错" };

/**
 * 在场的角色：钉在对话区顶部的一行，不随消息滚动，内容和消息同一列宽。
 * 主编永远第一个，后面是子 agent（新的在前）。点名字进它的会话，当前这位反白。
 * 每人只带一个词：跑着的显示它自报的「正在……」，其余显示状态；任务书收进悬停提示。
 * 在子 agent 会话里，列外左沿多一个「回到主编」。只有主编一个人时不显示，没什么可切的。
 */
export function AgentStrip() {
  const agents = createMemo(() => {
    const all = state.agentOrder.map((id) => state.agents[id]).filter((a): a is AgentInfo => !!a);
    return [...all.filter((a) => a.parentId === null), ...all.filter((a) => a.parentId !== null).reverse()];
  });
  const active = () => (state.view.type === "chat" ? state.view.agentId : null);
  const statusOf = (a: AgentInfo) => (a.status === "running" && a.statusText) || STATUS[a.status];
  const inChild = () => active() !== null && active() !== "director";

  return (
    <Show when={agents().length > 1 || inChild()}>
      <div class="relative shrink-0 border-b border-line text-xs text-ink-2">
      {/* 「回到主编」放在列外的左沿，不挤占主编在名单里的位置 */}
      <Show when={inChild()}>
        <button class="absolute left-5 top-0 h-9 flex items-center text-ink-2 hover:text-ink" onClick={() => actions.openChat("director")}>
          ← 回到主编
        </button>
      </Show>
      <div class="max-w-[760px] mx-auto flex items-center gap-4 px-5 h-9 overflow-hidden">
        <For each={agents()}>
          {(a) => (
            <button
              class="flex items-center gap-2 min-w-0 shrink hover:text-ink"
              classList={{ "text-ink": active() === a.agentId }}
              title={`${a.label} · ${STATUS[a.status]}${a.task ? `\n${a.task}` : ""}`}
              onClick={() => actions.openChat(a.agentId)}
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
        <span class="text-ink-3 shrink-0">{agents().length} 位在场</span>
      </div>
      </div>
    </Show>
  );
}
