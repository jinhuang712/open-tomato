import type { AgentInfo } from "@opentomato/core/protocol";
import { createMemo, For, Show } from "solid-js";
import { actions, state } from "../state";
import { STATUS } from "./agent-status";

/** 一列排得下几位（含主编）。并发六路加主编正好八，再多就折成「+N」去花名册，名单不长到要自己滚 */
const SEATS = 8;

/**
 * 在场的角色：竖排在对话区左沿的留白里，不随消息滚动。
 * 那条留白本来就是空的（消息列居中留出来的），所以名单来去都不推动正文——
 * 派出去一位、回来一位，作者读到的那一行仍在原处。窗口窄到留白不够时裁的是名单，正文一步不让。
 * 整层不接鼠标，只有名字本身可点，滚轮照旧落在下面的消息上。
 * 名单只放需要作者注意的人：主编、在跑的、出错的、当前打开的那位。
 * 交完活的不是在歇着，是干完了；它们不占名单，末尾一句「N 位子 agent」带去花名册那一页回看。
 * 竖排一位一行，每人都带上它自报的「正在……」，宽度不够就截断，全文在悬停提示里。
 * 人多到一列排不下时只留最需要作者的几位，其余折成一个「+N」，去花名册看全部。
 * 在子 agent 会话里，名单上方多一个「回到主编」。只有主编一个人时整条不显示，没什么可切的。
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
  const statusOf = (a: AgentInfo) => (a.status === "running" && a.statusText) || STATUS[a.status];
  /** 主编在正文里管它们叫「策划1」，名单上就得是同一个名字，作者才对得上人。旧会话没有 handle，退回角色名 */
  const name = (a: AgentInfo) => a.handle || a.label;
  const inChild = () => active() !== null && active() !== "director";

  return (
    <Show when={subs().length > 0 || inChild()}>
      {/* 铺满对话区，但只借左边那格：中间那格把消息列的宽度再写一遍，左格才等于它旁边真正空着的那点宽 */}
      <div class="absolute inset-y-0 left-0 right-0 z-10 flex pointer-events-none text-xs text-ink-2">
        {/* 留白窄到排不下就整条不显示：宁可不列，也不留半个头像的残片在那儿，正文的位置一步不让 */}
        <div class="@container flex-1 min-w-0 overflow-hidden flex">
          <div class="hidden @min-[168px]:flex w-[216px] min-w-0 shrink flex-col items-start gap-2.5 pl-5 pr-4 py-3">
            {/* 「回到主编」在名单上方，不挤占主编在名单里的位置 */}
            <Show when={inChild()}>
              <button class="pointer-events-auto shrink-0 text-ink-2 hover:text-ink" onClick={() => actions.openChat("director")}>
                ← 回到主编
              </button>
            </Show>
            <For each={shown()}>
              {(a) => (
                <button
                  class="pointer-events-auto w-full min-w-0 shrink-0 flex items-start gap-2 text-left hover:text-ink"
                  classList={{ "text-ink": active() === a.agentId }}
                  title={`${name(a)} · ${statusOf(a)}${a.task ? `\n${a.task}` : ""}`}
                  onClick={() => actions.openChat(a.agentId)}
                >
                  <span
                    class="w-5.5 h-5.5 -mt-0.5 rounded-full flex items-center justify-center text-[11px] shrink-0"
                    classList={{ "bg-ink text-paper": active() === a.agentId, "bg-paper-4 text-ink-2": active() !== a.agentId }}
                  >
                    {a.label.slice(0, 1)}
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="flex items-center gap-1.5 min-w-0">
                      <span class="truncate">{name(a)}</span>
                      <Show when={a.status === "running"}>
                        <span class="w-1.5 h-1.5 rounded-full bg-accent shrink-0 ring-3 ring-accent-soft" />
                      </Show>
                      <Show when={a.status === "error"}>
                        <span class="w-1.5 h-1.5 rounded-full bg-danger shrink-0" />
                      </Show>
                    </span>
                    {/* 截断时这句还在悬停提示里，不是没了 */}
                    <span class="block truncate text-ink-3">{statusOf(a)}</span>
                  </span>
                </button>
              )}
            </For>
            <Show when={folded() > 0}>
              <button class="pointer-events-auto shrink-0 text-ink-3 hover:text-ink" title={`还有 ${folded()} 位没列出来，去花名册看全部`} onClick={() => actions.openAgents()}>
                +{folded()}
              </button>
            </Show>
            {/* 花名册是名单外的另一件事，跟名单之间多留一行的距离，别读成又一位在场的 */}
            <Show when={subs().length > 0}>
              <button class="pointer-events-auto shrink-0 mt-1 text-ink-3 hover:text-ink" title="全部子 agent：回看、封存、删除" onClick={() => actions.openAgents()}>
                {subs().length} 位子 agent
              </button>
            </Show>
          </div>
        </div>
        <div class="w-[760px]" />
        <div class="flex-1 min-w-0" />
      </div>
    </Show>
  );
}
