import type { AgentInfo } from "@opentomato/core/protocol";
import { createMemo, For, Show } from "solid-js";
import { actions, state } from "../state";
import { STATUS } from "./agent-status";

/**
 * 子 agent 的花名册：一本书写下来派过的每一位都在这儿，按「在场 / 完成 / 已封存」分三段。
 * 顶栏只放在跑的和出错的，干完活的从那儿退下来进这里，作者要回看、续聊、封存、删除都在这一页做。
 * 封存是主编也能做的判断（archive_agent），删除只有作者能点：删了会话就真没了。
 */
export function AgentHistory() {
  const subs = createMemo(() =>
    state.agentOrder
      .map((id) => state.agents[id])
      .filter((a): a is AgentInfo => !!a && a.parentId !== null)
      .reverse(),
  );
  const active = () => subs().filter((a) => a.status === "running" || a.status === "error" || a.status === "idle");
  const finished = () => subs().filter((a) => a.status === "done");
  const archived = () => subs().filter((a) => a.status === "archived");

  const row = (a: AgentInfo) => (
    <div class="group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-paper-3">
      <button class="flex-1 min-w-0 flex items-center gap-3 text-left" title={a.task} onClick={() => actions.openChat(a.agentId)}>
        <span
          class="w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0"
          classList={{ "bg-paper-4 text-ink-2": a.status !== "archived", "bg-paper-3 text-ink-3": a.status === "archived" }}
        >
          {a.label.slice(0, 1)}
        </span>
        <span class="min-w-0 flex-1">
          <span class="flex items-center gap-2">
            <span class="text-ink">{a.handle || a.label}</span>
            <span class="text-ink-3 text-xs">· {(a.status === "running" && a.statusText) || STATUS[a.status]}</span>
            <Show when={a.status === "running"}>
              <span class="w-1.5 h-1.5 rounded-full bg-accent shrink-0 ring-3 ring-accent-soft" />
            </Show>
            <Show when={a.status === "error"}>
              <span class="w-1.5 h-1.5 rounded-full bg-danger shrink-0" />
            </Show>
          </span>
          <span class="block truncate text-xs text-ink-3">{a.error ?? a.task}</span>
        </span>
      </button>
      <span class="flex items-center gap-3 text-xs shrink-0 opacity-0 group-hover:opacity-100">
        <Show when={a.status === "done" || a.status === "error"}>
          <button class="text-ink-3 hover:text-ink" title="封存：留会话能回看，主编不能再续派" onClick={() => void actions.archiveAgent(a.agentId)}>
            封存
          </button>
        </Show>
        {/* 在跑的不能删：这轮结论还没交回，内核也会拒 */}
        <Show when={a.status !== "running"}>
          <button class="text-ink-3 hover:text-danger" title="删除：会话和上下文一起删掉，回不来" onClick={() => void actions.retireAgent(a.agentId)}>
            删除
          </button>
        </Show>
      </span>
    </div>
  );

  const section = (title: string, list: AgentInfo[], empty: string) => (
    <section class="space-y-1">
      <h2 class="px-3 text-xs text-ink-3">
        {title}
        <Show when={list.length > 0}> · {list.length}</Show>
      </h2>
      <Show when={list.length > 0} fallback={<p class="px-3 text-xs text-ink-3/70">{empty}</p>}>
        <For each={list}>{row}</For>
      </Show>
    </section>
  );

  return (
    <div class="flex flex-col h-full min-w-0">
      <div class="flex items-center gap-2 px-5 py-2 border-b border-line bg-paper-2 text-xs">
        <button class="text-ink-2 hover:text-ink" onClick={() => actions.openChat("director")}>
          ← 对话
        </button>
        <span class="text-ink-3">|</span>
        <span class="text-ink-2">子 agent</span>
        <span class="flex-1" />
        <span class="text-ink-3">共 {subs().length} 位</span>
      </div>
      <div class="flex-1 overflow-auto">
        <div class="max-w-[760px] mx-auto px-2 py-4 space-y-6 text-sm">
          {section("在场", active(), "现在没有人在跑")}
          {section("完成", finished(), "还没有人交过活")}
          {section("已封存", archived(), "封存的会留在这儿，会话能回看，主编不再续派")}
        </div>
      </div>
    </div>
  );
}
