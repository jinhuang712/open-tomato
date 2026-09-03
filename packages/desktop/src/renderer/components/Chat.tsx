import { createEffect, createSignal, For, Match, on, onCleanup, onMount, Show, Switch } from "solid-js";
import { actions, state } from "../state";
import { AgentStrip } from "./AgentStrip";
import { ApprovalDock } from "./ApprovalDock";
import { Composer } from "./Composer";
import { EmptyStart } from "./EmptyStart";
import { Message } from "./Message";
import { QuestionDock, summarizeQuestion } from "./QuestionDock";
import { QuickActions } from "./QuickActions";
import { QuotePill } from "./QuotePill";


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
  // 只有用户真正往上滚（scrollTop 变小且没贴底）才取消跟随。
  // dock 收起 / 展开会改变可视区高度，浏览器夹住 scrollTop 也会触发 scroll 事件，
  // 那种被动滚动如果拿 distance 直接判定，会和卡片的自动收展互相触发、来回闪。
  let lastTop = 0;
  const onScroll = () => {
    if (!scroller) return;
    const top = scroller.scrollTop;
    if (distance() < 24) setFollowing(true);
    else if (top < lastTop) setFollowing(false);
    lastTop = top;
  };
  const onWheel = (e: WheelEvent) => {
    if (e.deltaY < 0) setFollowing(false);
  };

  // 切换 agent 时重新贴底
  createEffect(on(() => props.agentId, () => queueMicrotask(scrollToBottom)));

  // 新的提问 / 审批出现时，底部 dock 会把可视区顶小；这时候必须能看到最后几句上下文，强制贴底
  createEffect(
    on(
      () => [state.questions.length, state.approvals.length],
      () => requestAnimationFrame(scrollToBottom),
      { defer: true },
    ),
  );

  // 滚动区自身尺寸变化（dock 出现 / 输入框长高 / 窗口缩放）时，跟随中就保持贴底
  onMount(() => {
    if (!scroller) return;
    const ro = new ResizeObserver(() => {
      if (following() && scroller) scroller.scrollTop = scroller.scrollHeight;
    });
    ro.observe(scroller);
    onCleanup(() => ro.disconnect());
  });

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
      <AgentStrip />
      <Show when={isLead()}>
        <QuotePill within={() => scroller} />
      </Show>
      <div ref={scroller} class="flex-1 min-h-0 overflow-y-auto py-3" onScroll={onScroll} onWheel={onWheel}>
        <div class="max-w-[760px] mx-auto w-full min-h-full flex flex-col">
        <Show when={messages().length === 0}>
          <Show when={isLead()} fallback={<div class="h-full flex items-center justify-center text-ink-3">子 agent 还没有输出</div>}>
            <EmptyStart />
          </Show>
        </Show>
        <For each={messages()}>
          {(m) => (
            <>
              <Message message={m} />
              <Show when={state.interruptedAfter[props.agentId] === m.id}>
                <div class="flex items-center gap-3 px-5 py-3 text-xs text-ink-3 select-none">
                  <span class="flex-1 border-t border-line" />
                  <span>上次被打断了</span>
                  <span class="flex-1 border-t border-line" />
                </div>
              </Show>
            </>
          )}
        </For>
        <Show when={agent()?.status === "running"}>
          <div class="px-5 py-2 flex items-center gap-2 text-xs">
            <span class="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span class="shimmer">{agent()?.statusText || `${agent()?.label} 正在理清思路`}</span>
          </div>
        </Show>
        <Show when={agent()?.status === "error" && agent()?.error}>
          <div class="mx-5 my-2 px-3 py-2 rounded-lg bg-danger-soft text-danger text-xs selectable">{agent()?.error}</div>
        </Show>
        {/* 提问卡就在消息流末尾，跟着正文一起滚；往上翻时它自然滚走，底部另有一行浮条 */}
        <Show when={dockQuestion()}>
          {(q) => (
            <>
              <QuestionDock request={q()} />
              {/* 浮条：sticky 贴底、零高度，和卡片同一列宽；只在离开底部时可见，显隐不牵动滚动位置 */}
              <div class="sticky bottom-0 h-0 z-10">
                <Show when={!following()}>
                  <button
                    class="absolute bottom-2 left-5 right-5 h-9 flex items-center gap-2 px-4 rounded-lg border border-line-2 bg-paper-2 shadow-lg text-xs text-left hover:bg-paper"
                    onClick={scrollToBottom}
                    title="回到问题"
                  >
                    <span class="w-2 h-2 rounded-full bg-warn shrink-0" />
                    <span class="font-medium shrink-0">{state.agents[q().agentId]?.label ?? "agent"} 想问你</span>
                    <span class="flex-1 min-w-0 truncate text-ink-3">{summarizeQuestion(q().text)}</span>
                    <span class="ml-auto shrink-0 text-ink-3">›</span>
                  </button>
                </Show>
              </div>
            </>
          )}
        </Show>
        </div>
      </div>
      {/* 有待答 / 待审时，dock 取代输入框：一次只做一件事。和消息流同一列宽 */}
      <div class="relative max-w-[760px] mx-auto w-full">
        <Show when={!following() && !dockQuestion()}>
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
          <Match when={dockQuestion()}>{() => <div class="h-3" />}</Match>
          <Match when={dockApproval()}>{(a) => <div class="pb-4"><ApprovalDock request={a()} /></div>}</Match>
        </Switch>
      </div>
    </div>
  );
}
