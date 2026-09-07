import type { AgentInfo } from "@opentomato/core/protocol";
import { createMemo, For, Show } from "solid-js";
import { actions, state } from "../state";
import { STATUS } from "./agent-status";

/**
 * 在场的角色：钉在对话区顶部的一行，不随消息滚动，内容和消息同一列宽。
 * 名单只放需要作者注意的人：主编、在跑的、出错的、当前打开的那位。
 * 交完活的不是在歇着，是干完了；它们不占名单，右侧一句「N 位子 agent」带去花名册那一页回看。
 * 否则一本书写下来几十位子 agent 都挤在这一行，超宽的直接被裁掉，谁也看不见。
 * 每人只带一个词：跑着的显示它自报的「正在……」，其余显示状态；任务书收进悬停提示。
 * 在子 agent 会话里，列外左沿多一个「回到主编」。只有主编一个人时不显示，没什么可切的。
 */
export function AgentStrip() {
  const active = () => (state.view.type === "chat" ? state.view.agentId : null);
  const all = createMemo(() => state.agentOrder.map((id) => state.agents[id]).filter((a): a is AgentInfo => !!a));
  const lead = () => all().filter((a) => a.parentId === null);
  const subs = () => all().filter((a) => a.parentId !== null).reverse();
  const needsEye = (a: AgentInfo) => a.status === "running" || a.status === "error" || a.agentId === active();
  const shown = createMemo(() => [...lead(), ...subs().filter(needsEye)]);
  const statusOf = (a: AgentInfo) => (a.status === "running" && a.statusText) || STATUS[a.status];
  /** 主编在正文里管它们叫「策划1」，名单上就得是同一个名字，作者才对得上人。旧会话没有 handle，退回角色名 */
  const name = (a: AgentInfo) => a.handle || a.label;
  const inChild = () => active() !== null && active() !== "director";

  return (
    <Show when={subs().length > 0 || inChild()}>
      <div class="relative shrink-0 border-b border-line text-xs text-ink-2">
        {/* 「回到主编」放在列外的左沿，不挤占主编在名单里的位置 */}
        <Show when={inChild()}>
          <button class="absolute left-5 top-0 h-9 flex items-center text-ink-2 hover:text-ink" onClick={() => actions.openChat("director")}>
            ← 回到主编
          </button>
        </Show>
        <div class="max-w-[760px] mx-auto flex items-center gap-4 px-5 h-9">
          <For each={shown()}>
            {(a) => (
              <button
                class="flex items-center gap-2 min-w-0 shrink hover:text-ink"
                classList={{ "text-ink": active() === a.agentId }}
                title={`${name(a)} · ${STATUS[a.status]}${a.task ? `\n${a.task}` : ""}`}
                onClick={() => actions.openChat(a.agentId)}
              >
                <span
                  class="w-5.5 h-5.5 rounded-full flex items-center justify-center text-[11px] shrink-0"
                  classList={{ "bg-ink text-paper": active() === a.agentId, "bg-paper-4 text-ink-2": active() !== a.agentId }}
                >
                  {a.label.slice(0, 1)}
                </span>
                <span class="shrink-0">{name(a)}</span>
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
          <Show when={subs().length > 0}>
            <button class="h-9 shrink-0 text-ink-3 hover:text-ink" title="全部子 agent：回看、封存、删除" onClick={() => actions.openAgents()}>
              {subs().length} 位子 agent
            </button>
          </Show>
        </div>
      </div>
    </Show>
  );
}
