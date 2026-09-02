import { createEffect, createSignal, For, Match, on, Show, Switch } from "solid-js";
import { actions, state } from "../state";
import { AgentBubbles } from "./AgentBubbles";
import { ApprovalDock } from "./ApprovalDock";
import { Composer } from "./Composer";
import { Message } from "./Message";
import { QuestionDock } from "./QuestionDock";
import { QuickActions } from "./QuickActions";

const STATUS: Record<string, string> = { running: "运行中", idle: "待命", done: "完成", error: "出错" };

export function Chat(props: { agentId: string }) {
  let scroller: HTMLDivElement | undefined;
  const messages = () => state.transcripts[props.agentId] ?? [];
  const agent = () => state.agents[props.agentId];
  const isLead = () => props.agentId === "lead";
  // 子 agent 自己发起的待答 / 待审也可能挂在它的会话上，按 agentId 归属
  const question = () => state.questions.find((q) => q.agentId === props.agentId);
  const approval = () => state.approvals.find((a) => a.agentId === props.agentId);
  // 主编视图兜底承接所有 dock，免得子 agent 的审批藏在气泡后面
  const dockQuestion = () => question() ?? (isLead() ? state.questions[0] : undefined);
  const dockApproval = () => approval() ?? (isLead() ? state.approvals[0] : undefined);

  // following = 用户贴着底部，新内容来了就跟着滚；一旦用户往上滚就停止跟随，直到回到底部
  const [following, setFollowing] = createSignal(true);
  const distance = () => (scroller ? scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight : 0);
  const scrollToBottom = () => {
    if (!scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
    setFollowing(true);
  };
  const onScroll = () => setFollowing(distance() < 24);
  const onWheel = (e: WheelEvent) => {
    if (e.deltaY < 0) setFollowing(false);
  };

  // 切换 agent 时重新贴底
  createEffect(on(() => props.agentId, () => queueMicrotask(scrollToBottom)));

  createEffect(
    on(
      () => [messages().length, messages().at(-1)?.parts.length, JSON.stringify(messages().at(-1)?.parts.at(-1))],
      () => {
        if (scroller && following()) scroller.scrollTop = scroller.scrollHeight;
      },
      { defer: true },
    ),
  );

  return (
    <div class="relative flex flex-col h-full min-w-0">
      <AgentBubbles />
      <Show when={!isLead()}>
        <div class="flex items-center gap-2 px-5 py-2 border-b border-line bg-paper-2 text-[12px]">
          <button class="text-ink-2 hover:text-ink" onClick={() => actions.openChat("lead")}>
            ← 回到主编
          </button>
          <span class="text-ink-3">|</span>
          <span class={`w-2 h-2 rounded-full ${agent()?.status === "running" ? "bg-accent animate-pulse" : agent()?.status === "error" ? "bg-danger" : "bg-ok"}`} />
          <span class="font-medium">{agent()?.label}</span>
          <span class="text-ink-3">{STATUS[agent()?.status ?? "idle"]}</span>
          <span class="text-ink-3 truncate flex-1" title={agent()?.task}>
            {agent()?.task}
          </span>
        </div>
      </Show>
      <div ref={scroller} class="flex-1 min-h-0 overflow-y-auto py-3" onScroll={onScroll} onWheel={onWheel}>
        <div class="max-w-[880px] mx-auto w-full min-h-full">
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
        <For each={messages()}>
          {(m) => (
            <>
              <Message message={m} />
              <Show when={state.interruptedAfter[props.agentId] === m.id}>
                <div class="flex items-center gap-3 px-5 py-3 text-[11px] text-warn select-none">
                  <span class="flex-1 border-t border-dashed border-warn/50" />
                  <span>上次被打断了</span>
                  <span class="flex-1 border-t border-dashed border-warn/50" />
                </div>
              </Show>
            </>
          )}
        </For>
        <Show when={agent()?.status === "running"}>
          <div class="px-5 py-2 flex items-center gap-2 text-[12px]">
            <span class="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span class="shimmer">{agent()?.statusText || `${agent()?.label} 正在理清思路`}</span>
          </div>
        </Show>
        <Show when={agent()?.status === "error" && agent()?.error}>
          <div class="mx-5 my-2 px-3 py-2 rounded-lg bg-danger-soft text-danger text-[12px] selectable">{agent()?.error}</div>
        </Show>
        </div>
      </div>
      {/* 有待答 / 待审时，dock 取代输入框：一次只做一件事。和消息流同一列宽 */}
      <div class="relative max-w-[880px] mx-auto w-full">
        <Show when={!following()}>
          <button
            class="absolute -top-11 right-6 z-10 w-9 h-9 rounded-full bg-paper border border-line shadow-lg text-ink-2 hover:text-ink hover:border-accent flex items-center justify-center"
            title="回到底部"
            onClick={scrollToBottom}
          >
            ↓
          </button>
        </Show>
        <Switch
          fallback={
            <>
              <Show when={isLead()}>
                <QuickActions hasHistory={messages().length > 0} />
              </Show>
              <Composer agentId={props.agentId} />
            </>
          }
        >
          <Match when={dockQuestion()}>{(q) => <div class="pb-4"><QuestionDock request={q()} /></div>}</Match>
          <Match when={dockApproval()}>{(a) => <div class="pb-4"><ApprovalDock request={a()} /></div>}</Match>
        </Switch>
      </div>
    </div>
  );
}
