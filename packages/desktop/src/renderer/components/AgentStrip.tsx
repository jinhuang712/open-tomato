import type { AgentInfo } from "@opentomato/core/protocol";
import { createMemo, For, Show } from "solid-js";
import { actions, state } from "../state";
import { STATUS } from "./agent-status";

/** 一行坐得下几位（含主编）。宁可少列一位，也不能把整排挤成碎字 */
const SEATS = 6;
/** 名单在这个人数以内才给每人带上「正在……」：再多就分不到能读完一句话的宽度 */
const WORDY = 3;

/**
 * 在场的角色：钉在对话区顶部的一行，不随消息滚动，内容和消息同一列宽。
 * 名单只放需要作者注意的人：主编、在跑的、出错的、当前打开的那位。
 * 交完活的不是在歇着，是干完了；它们不占名单，右侧一句「N 位子 agent」带去花名册那一页回看。
 * 否则一本书写下来几十位子 agent 都挤在这一行，超宽的直接被裁掉，谁也看不见。
 * 一行的宽度是死的，所以人一多就得让步，让的顺序是先收话、再收人：
 * 人少时每人带一句它自报的「正在……」，人多了这句先收掉（挤到只剩五个字等于没写），
 * 再多就只留最需要作者的几位，其余折成一个「+N」，去花名册看全部。
 * 六路并发时每位在干什么，正文里的派单卡本来就一行一位列着，点名字同样能进会话，这儿不必重复一遍。
 * 在子 agent 会话里，列外左沿多一个「回到主编」。只有主编一个人时不显示，没什么可切的。
 */
export function AgentStrip() {
  const active = () => (state.view.type === "chat" ? state.view.agentId : null);
  const all = createMemo(() => state.agentOrder.map((id) => state.agents[id]).filter((a): a is AgentInfo => !!a));
  const lead = () => all().filter((a) => a.parentId === null);
  const subs = () => all().filter((a) => a.parentId !== null).reverse();
  const needsEye = (a: AgentInfo) => a.status === "running" || a.status === "error" || a.agentId === active();
  const wanted = createMemo(() => [...lead(), ...subs().filter(needsEye)]);
  /** 满座时按「谁更需要作者」留人：主编、正看着的、出错的在前，在跑的按新到旧。留下来的仍按原顺序排，位置不跟着点击跳 */
  const shown = createMemo(() => {
    const list = wanted();
    if (list.length <= SEATS) return list;
    const rank = (a: AgentInfo) => (a.parentId === null ? 0 : a.agentId === active() ? 1 : a.status === "error" ? 2 : 3);
    const keep = new Set(
      [...list]
        .sort((x, y) => rank(x) - rank(y))
        .slice(0, SEATS)
        .map((a) => a.agentId),
    );
    return list.filter((a) => keep.has(a.agentId));
  });
  const folded = () => wanted().length - shown().length;
  const wordy = () => wanted().length <= WORDY;
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
          {/* 名单单独一格：窗口窄到连留下的几位都排不开时，裁的是名单尾巴，右边的花名册入口不会被挤出去 */}
          <div class="flex-1 min-w-0 flex items-center gap-4 overflow-hidden">
            <For each={shown()}>
              {(a) => (
                <button
                  class="flex items-center gap-2 min-w-0 shrink hover:text-ink"
                  classList={{ "text-ink": active() === a.agentId }}
                  title={`${name(a)} · ${statusOf(a)}${a.task ? `\n${a.task}` : ""}`}
                  onClick={() => actions.openChat(a.agentId)}
                >
                  <span
                    class="w-5.5 h-5.5 rounded-full flex items-center justify-center text-[11px] shrink-0"
                    classList={{ "bg-ink text-paper": active() === a.agentId, "bg-paper-4 text-ink-2": active() !== a.agentId }}
                  >
                    {a.label.slice(0, 1)}
                  </span>
                  <span class="shrink-0">{name(a)}</span>
                  {/* 收掉「正在……」时，这句还在悬停提示里，不是没了 */}
                  <Show when={wordy()}>
                    <span class="truncate text-ink-3 max-w-[200px]">{statusOf(a)}</span>
                  </Show>
                  <Show when={a.status === "running"}>
                    <span class="w-1.5 h-1.5 rounded-full bg-accent shrink-0 ring-3 ring-accent-soft" />
                  </Show>
                  <Show when={a.status === "error"}>
                    <span class="w-1.5 h-1.5 rounded-full bg-danger shrink-0" />
                  </Show>
                </button>
              )}
            </For>
            <Show when={folded() > 0}>
              <button class="shrink-0 text-ink-3 hover:text-ink" title={`还有 ${folded()} 位没列出来，去花名册看全部`} onClick={() => actions.openAgents()}>
                +{folded()}
              </button>
            </Show>
          </div>
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
