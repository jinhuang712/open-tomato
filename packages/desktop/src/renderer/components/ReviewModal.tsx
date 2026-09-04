import type { ApprovalRequest } from "@opentomato/core/protocol";
import { createEffect, createSignal, For, on, onCleanup, Show } from "solid-js";
import { actions, setState, state } from "../state";
import { DiffView } from "./DiffView";
import { DocLink } from "./DocLink";
import { TrackChanges } from "./TrackChanges";

type Tab = "review" | "source";

/** 审批弹窗：默认 Word 式审阅视图，可切到逐行对比 */
export function ReviewModal(props: { request: ApprovalRequest }) {
  const [tab, setTab] = createSignal<Tab>("review");
  const [reason, setReason] = createSignal("");
  const [rejecting, setRejecting] = createSignal(false);
  const agent = () => state.agents[props.request.agentId];
  const close = () => setState("reviewOpen", null);
  /** 批/拒只发动作，切到下一条由 approval.resolved 事件推进：
   * 乐观读过期列表会跳回已决项（连审三条以上时甚至把弹窗关掉、剩下没审的）。
   * 事件是 gate 里同步发出的，弹窗只多留一瞬，且动作失败时正好停在原项可重试。 */
  const approve = () => void actions.approve(props.request.approvalId);
  /** 原因必填：没有原因 agent 只能瞎猜，白耗一轮 */
  const canReject = () => reason().trim() !== "";
  const reject = () => {
    if (!canReject()) return;
    void actions.reject(props.request.approvalId, reason().trim());
  };
  /** 快捷理由是给作者的词汇表，不是快捷键。正文一套按写作的真难点长；
   * 「我没感觉」合法，它是「有反应没有词」的出口，主编收到该换一批候选而不是追问 */
  const PROSE_REASONS = ["太急", "太满", "他不会这么说", "没有事发生", "我没感觉"];
  const MATERIAL_REASONS = ["还没讨论到这一步，先别落盘", "方向不对，先回复里给候选", "内容大致可以，细节要改"];
  const QUICK_REASONS = props.request.kind === "manuscript" ? PROSE_REASONS : MATERIAL_REASONS;
  const remaining = () => state.approvals.length - 1;

  /** ⌘↩ / Ctrl↩ 直接批准：写东西时手不离键盘，弹窗开着随手就批了 */
  createEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !rejecting()) {
        e.preventDefault();
        approve();
      }
    };
    document.addEventListener("keydown", onKey);
    onCleanup(() => document.removeEventListener("keydown", onKey));
  });

  /** 打开或切回审阅视图时，滚到第一处改动；整篇都没改动就留在顶部 */
  let scroller: HTMLDivElement | undefined;
  createEffect(
    on([tab, () => props.request.approvalId], () => {
      if (tab() !== "review") return;
      requestAnimationFrame(() => {
        const first = scroller?.querySelector<HTMLElement>(".tc-ins, .tc-del, .tc-blk");
        if (!first || !scroller) return;
        const top = first.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
        scroller.scrollTo({ top: Math.max(0, top - scroller.clientHeight / 3) });
      });
    }),
  );

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={close}>
      <div
        class="w-full max-w-[920px] max-h-[88vh] rounded-2xl bg-paper border border-line shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="flex items-center gap-3 px-5 py-3 border-b border-line">
          <span class="w-2 h-2 rounded-full bg-warn" />
          <span class="font-medium">{agent()?.label ?? "agent"} 请求写入</span>
          <DocLink kind={props.request.kind} id={props.request.docId} class="text-xs" />
          <Show when={props.request.isNew}>
            <span class="text-xs px-1.5 rounded bg-ok-soft text-ok">新建</span>
          </Show>
          <span class="text-ink-2 truncate">{props.request.title}</span>
          <span class="flex-1" />
          <div class="flex rounded-md border border-line overflow-hidden text-xs">
            <button class={`px-2.5 py-1 ${tab() === "review" ? "bg-paper-3 text-ink" : "text-ink-3 hover:text-ink"}`} onClick={() => setTab("review")}>
              审阅
            </button>
            <button class={`px-2.5 py-1 ${tab() === "source" ? "bg-paper-3 text-ink" : "text-ink-3 hover:text-ink"}`} onClick={() => setTab("source")}>
              逐行对比
            </button>
          </div>
          <button class="text-ink-3 hover:text-ink px-1 ml-1" onClick={close} title="先收起，稍后再审">
            ✕
          </button>
        </div>

        <div ref={scroller} class="flex-1 overflow-y-auto px-8 py-6">
          <Show when={tab() === "review"} fallback={<DiffView patch={props.request.patch} maxHeight="70vh" />}>
            <TrackChanges before={props.request.before} after={props.request.after} isNew={props.request.isNew} />
          </Show>
        </div>

        <div class="flex items-center gap-2 px-5 py-3 border-t border-line bg-paper-2">
          <span class="text-xs text-ink-3 flex items-center gap-3">
            <span>
              <ins class="tc-ins">新增</ins>
            </span>
            <span>
              <del class="tc-del">删去</del>
            </span>
          </span>
          <span class="flex-1" />
          <Show when={remaining() > 0}>
            <span class="text-ink-3 text-xs mr-2">还有 {remaining()} 条待审</span>
          </Show>
          <Show
            when={rejecting()}
            fallback={
              <>
                <button class="px-3 py-1.5 rounded-lg border border-line hover:bg-paper-3" onClick={() => setRejecting(true)}>
                  拒绝…
                </button>
                <button class="px-4 py-1.5 rounded-lg bg-ink text-paper font-medium hover:brightness-110 flex items-center gap-2" onClick={approve} title="批准写入（⌘↩）">
                  <span>批准写入</span>
                  <kbd class="font-sans text-[10px] leading-4 px-1 rounded border border-paper/30 text-paper/70">⌘↩</kbd>
                </button>
              </>
            }
          >
            <div class="flex flex-col gap-1.5">
              <div class="flex gap-1">
                <For each={QUICK_REASONS}>
                  {(r) => (
                    <button
                      class={`px-2 py-0.5 rounded border text-xs ${reason() === r ? "border-accent bg-accent-soft text-ink" : "border-line text-ink-3 hover:text-ink"}`}
                      onClick={() => setReason(r)}
                    >
                      {r}
                    </button>
                  )}
                </For>
              </div>
              <input
                class="w-[420px] px-3 py-1.5 rounded-lg border border-line bg-paper outline-none focus:border-accent"
                placeholder="拒绝原因（必填，会回给 agent，让它照着改）"
                value={reason()}
                onInput={(e) => setReason(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") reject();
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setRejecting(false);
                  }
                }}
                autofocus
              />
            </div>
            <button
              class="px-3 py-1.5 rounded-lg bg-danger text-white hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={!canReject()}
              title={canReject() ? "" : "先写拒绝原因"}
              onClick={reject}
            >
              确认拒绝
            </button>
            <button class="px-2 py-1.5 text-ink-2 hover:text-ink" onClick={() => setRejecting(false)}>
              取消
            </button>
          </Show>
        </div>
      </div>
    </div>
  );
}
