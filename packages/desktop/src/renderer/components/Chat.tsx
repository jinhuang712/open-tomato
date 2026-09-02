import { createEffect, For, on, Show } from "solid-js";
import { actions, state } from "../state";
import { ApprovalDock } from "./ApprovalDock";
import { Composer } from "./Composer";
import { Message } from "./Message";
import { QuestionDock } from "./QuestionDock";

export function Chat(props: { agentId: string }) {
  let scroller: HTMLDivElement | undefined;
  const messages = () => state.transcripts[props.agentId] ?? [];
  const agent = () => state.agents[props.agentId];
  const isLead = () => props.agentId === "lead";

  createEffect(
    on(
      () => [messages().length, messages().at(-1)?.parts.length, JSON.stringify(messages().at(-1)?.parts.at(-1))],
      () => {
        if (!scroller) return;
        const nearBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 160;
        if (nearBottom) scroller.scrollTop = scroller.scrollHeight;
      },
    ),
  );

  return (
    <div class="flex flex-col h-full min-w-0">
      <Show when={!isLead()}>
        <div class="flex items-center gap-2 px-5 py-2 border-b border-line bg-paper-2 text-[12px]">
          <button class="text-ink-2 hover:text-ink" onClick={() => actions.openChat("lead")}>
            ← 回到主编
          </button>
          <span class="text-ink-3">|</span>
          <span class="font-medium">{agent()?.label}</span>
          <span class="text-ink-3 truncate">{agent()?.task}</span>
        </div>
      </Show>
      <div ref={scroller} class="flex-1 overflow-y-auto py-3">
        <Show when={messages().length === 0}>
          <div class="h-full flex items-center justify-center text-ink-3 text-center px-10">
            <Show when={isLead()} fallback={<div>子 agent 还没有输出</div>}>
              <div>
                <div class="text-lg font-serif text-ink-2 mb-2">和主编开始</div>
                <div class="text-[12px] leading-relaxed">
                  左侧「能力」里有立项访谈、卡片设计、大纲编排、章节写作、多路审稿、一致性机检。
                  <br />
                  也可以直接说话：“我想写一本……”
                </div>
              </div>
            </Show>
          </div>
        </Show>
        <For each={messages()}>{(m) => <Message message={m} />}</For>
        <Show when={agent()?.status === "running" && messages().at(-1)?.role !== "assistant"}>
          <div class="px-5 py-2 text-ink-3 text-[12px] shimmer w-fit">{agent()?.label} 在想…</div>
        </Show>
        <Show when={agent()?.status === "error" && agent()?.error}>
          <div class="mx-5 my-2 px-3 py-2 rounded-lg bg-danger-soft text-danger text-[12px] selectable">{agent()?.error}</div>
        </Show>
      </div>
      <Show when={isLead()}>
        <For each={state.questions.slice(0, 1)}>{(q) => <QuestionDock request={q} />}</For>
        <For each={state.approvals.slice(0, 1)}>{(a) => <ApprovalDock request={a} />}</For>
        <Composer />
      </Show>
    </div>
  );
}
