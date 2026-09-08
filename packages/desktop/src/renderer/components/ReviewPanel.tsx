import { MATERIAL_REJECT_WORDS, PROSE_REJECT_WORDS, quoteBlock, type ApprovalRequest } from "@opentomato/core/protocol";
import { createEffect, createSignal, For, on, onCleanup, Show } from "solid-js";
import { keyHint } from "../../shared/keymap";
import { bridge } from "../bridge";
import { overlayOpen, registerEscape } from "../escape";
import { actions, state, toast } from "../state";
import { CardEditor, type CardEditorHandle } from "./CardEditor";
import { DiffView } from "./DiffView";
import { DocLink } from "./DocLink";
import { QuoteCard } from "./QuoteCard";
import { QuotePill } from "./QuotePill";
import { TrackChanges } from "./TrackChanges";

type Tab = "review" | "source";

/** 审阅视图：占主区，默认 Word 式审阅，可切到逐行对比。待审那条同时挂在对话的 dock 上，退出去还能再进 */
export function ReviewPanel(props: { request: ApprovalRequest }) {
  const [tab, setTab] = createSignal<Tab>("review");
  const [reason, setReason] = createSignal("");
  const [rejecting, setRejecting] = createSignal(false);
  /** 作者在稿上圈的那段：批注即拒绝理由，引文排在理由前面回给 agent */
  const [quoted, setQuoted] = createSignal<string | null>(null);
  /** 自行批改：把 agent 提的这一版摊成可编辑的卡片，作者改完直接批准，落盘的是作者这版 */
  const [editing, setEditing] = createSignal(false);
  const [dirty, setDirty] = createSignal(false);
  let card: CardEditorHandle | undefined;
  const quotedFrom = () => `审阅 ${props.request.path}`;
  const agent = () => state.agents[props.request.agentId];
  /** 批/拒只发动作，切到下一条由 approval.resolved 事件推进：
   * 乐观读过期列表会跳回已决项（连审三条以上时甚至把视图切走、剩下没审的）。
   * 事件是 gate 里同步发出的，视图只多留一瞬，且动作失败时正好停在原项可重试。
   * 批改过就把作者那份整篇带过去；一字没动时 core 那边会认出来，当普通放行记。 */
  const approve = () => {
    if (!editing()) {
      void actions.approve(props.request.approvalId);
      return;
    }
    if (!card) return;
    // 标题是这张卡在侧栏里的身份，空着写下去等于把卡弄丢
    if (card.titleEmpty()) {
      toast("标题不能为空", "error");
      return;
    }
    void actions.approve(props.request.approvalId, card.raw());
  };
  /** 进/出自行批改。改过东西再退出先问一声，别一个 ⌘E 把改的都吞了 */
  const startEdit = () => {
    setRejecting(false);
    setQuoted(null);
    setDirty(false);
    setEditing(true);
  };
  const stopEdit = async () => {
    if (dirty() && !(await bridge.confirm({ message: "放弃这次批改？", detail: "刚改的内容不会带进这次批准。", okLabel: "放弃" }))) return;
    setEditing(false);
  };
  /** 原因必填：没有原因 agent 只能瞎猜，白耗一轮 */
  const canReject = () => reason().trim() !== "";
  const reject = () => {
    if (!canReject()) return;
    const q = quoted();
    const block = q ? quoteBlock(quotedFrom(), q) : "";
    void actions.reject(props.request.approvalId, [block, reason().trim()].filter(Boolean).join("\n\n"));
  };
  const cancelReject = () => {
    setRejecting(false);
    setQuoted(null);
  };
  /** 圈一段点「批注」：进拒绝态，引文挂在原因框上方，作者接着写为什么 */
  const annotate = (text: string) => {
    setQuoted(text);
    setRejecting(true);
  };
  // Escape 先退出自行批改，再由全局那套退回上一个视图
  registerEscape(() => editing() && (void stopEdit(), true));
  /** 词汇表在 core 里只写一处，批的 word 字段也从那儿认 */
  const QUICK_REASONS = props.request.kind === "manuscript" ? PROSE_REJECT_WORDS : MATERIAL_REJECT_WORDS;
  const remaining = () => state.approvals.length - 1;

  /** ⌘↩ / Ctrl↩ 提交当前这一步，手不离键盘：
   * 没进拒绝态就是批准；一进拒绝态（圈了批注、或开始写原因）⌘↩ 就是拒绝，
   * 焦点在不在原因框里都一样——点过快捷理由按钮后焦点在按钮上，也不该按不动。
   * 搜索框、设置这类浮层压在上面时不响：那时候按键不是冲审阅来的。 */
  createEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.isComposing || overlayOpen()) return;
      if (e.key === "Enter") {
        e.preventDefault();
        if (rejecting()) reject();
        else approve();
        return;
      }
      // ⌘E 自行批改，和翻卡片时那个 ⌘E 是同一个编辑器、同一套字段规则
      if (e.key.toLowerCase() === "e" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        if (editing()) void stopEdit();
        else startEdit();
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
        if (!scroller) return;
        const first = scroller.querySelector<HTMLElement>(".tc-ins, .tc-del, .tc-blk");
        if (!first) return;
        const top = first.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
        scroller.scrollTo({ top: Math.max(0, top - scroller.clientHeight / 3) });
      });
    }),
  );

  return (
    <div class="flex flex-col h-full min-w-0">
      <div class="flex items-center gap-2 px-5 py-2 border-b border-line bg-paper-2 text-xs">
        <button class="text-ink-2 hover:text-ink" title="先放着，稍后从对话里的待审条再进" onClick={() => actions.leaveReview()}>
          ← 返回
        </button>
        <span class="text-ink-3">|</span>
        <span class="w-2 h-2 rounded-full bg-warn shrink-0" />
        <span class="shrink-0">{agent()?.label ?? "agent"} 请求写入</span>
        <DocLink kind={props.request.kind} id={props.request.docId} class="text-xs" />
        <Show when={props.request.isNew}>
          <span class="px-1.5 rounded bg-ok-soft text-ok">新建</span>
        </Show>
        <span class="text-ink-2 truncate">{props.request.title}</span>
        <span class="flex-1" />
        <Show
          when={editing()}
          fallback={
            <>
              <button class="px-2.5 py-1 rounded-md border border-line hover:bg-paper-3" title={`不退回，自己动手把这一版改对（${keyHint("review.edit")}）`} onClick={startEdit}>
                自行批改
              </button>
              <div class="flex rounded-md border border-line overflow-hidden">
                <button class={`px-2.5 py-1 ${tab() === "review" ? "bg-paper-3 text-ink" : "text-ink-3 hover:text-ink"}`} onClick={() => setTab("review")}>
                  审阅
                </button>
                <button class={`px-2.5 py-1 ${tab() === "source" ? "bg-paper-3 text-ink" : "text-ink-3 hover:text-ink"}`} onClick={() => setTab("source")}>
                  逐行对比
                </button>
              </div>
            </>
          }
        >
          <span class="text-ink-3">批改中，批准写入的将是你这一版</span>
        </Show>
      </div>

      <Show when={!editing()}>
        <QuotePill within={() => scroller} onTake={annotate} title="对这段提意见，作为拒绝理由回给 agent" />
      </Show>
      <div ref={scroller} class="flex-1 overflow-y-auto">
        <div class="max-w-3xl mx-auto px-8 py-6">
          <Show
            when={!editing()}
            fallback={
              // 编辑的是 agent 提的这一版（after），不是磁盘上的旧版：作者在它上面接着改，改完直接批准
              <CardEditor kind={props.request.kind} raw={props.request.after} onChange={() => setDirty(true)} onReady={(h) => (card = h)} />
            }
          >
            <Show when={tab() === "review"} fallback={<DiffView patch={props.request.patch} />}>
              {/* data-quote-src 只是让 QuotePill 认出这是能圈的正文；引文由这个视图自己收，不进主编输入框 */}
              <div data-quote-src={JSON.stringify({ type: "review", path: props.request.path })}>
                <TrackChanges before={props.request.before} after={props.request.after} isNew={props.request.isNew} />
              </div>
            </Show>
          </Show>
        </div>
      </div>

      <div class="flex items-end gap-2 px-5 py-3 border-t border-line bg-paper-2">
        <span class="flex-1" />
        <Show when={remaining() > 0}>
          <span class="text-ink-3 text-xs mr-2 self-center">还有 {remaining()} 条待审</span>
        </Show>
        <Show
          when={rejecting()}
          fallback={
            <>
              <Show
                when={editing()}
                fallback={
                  <button class="px-3 py-1.5 rounded-lg border border-line hover:bg-paper-3" onClick={() => setRejecting(true)}>
                    拒绝…
                  </button>
                }
              >
                <button class="px-3 py-1.5 rounded-lg border border-line hover:bg-paper-3" title={`回到审阅视图，丢掉这次批改（${keyHint("review.edit")}）`} onClick={() => void stopEdit()}>
                  取消批改
                </button>
              </Show>
              <button class="px-4 py-1.5 rounded-lg bg-ink text-paper font-medium hover:brightness-110 flex items-center gap-2" onClick={approve} title="批准写入（⌘↩）">
                <span>批准写入</span>
                <kbd class="font-sans text-[10px] leading-4 px-1 rounded border border-paper/30 text-paper/70">⌘↩</kbd>
              </button>
            </>
          }
        >
          <div class="flex flex-col gap-1.5 w-[520px]">
            <Show when={quoted()}>{(q) => <QuoteCard from={quotedFrom()} text={q()} clamp onRemove={() => setQuoted(null)} />}</Show>
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
              class="w-full px-3 py-1.5 rounded-lg border border-line bg-paper outline-none focus:border-accent"
              placeholder={quoted() ? "这段哪里不对（必填，连引文一起回给 agent）" : "拒绝原因（必填，会回给 agent，让它照着改）"}
              value={reason()}
              onInput={(e) => setReason(e.currentTarget.value)}
              onKeyDown={(e) => {
                // ⌘↩ 由视图级 handler 统一接，这里放过去，不然一次按键发两条拒绝
                if (e.key === "Enter" && !(e.metaKey || e.ctrlKey)) reject();
                if (e.key === "Escape") {
                  e.preventDefault();
                  cancelReject();
                }
              }}
              autofocus
            />
          </div>
          <button
            class="px-3 py-1.5 rounded-lg bg-danger text-white hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            disabled={!canReject()}
            title={canReject() ? "确认拒绝（⌘↩）" : "先写拒绝原因"}
            onClick={reject}
          >
            <span>确认拒绝</span>
            <kbd class="font-sans text-[10px] leading-4 px-1 rounded border border-white/30 text-white/70">⌘↩</kbd>
          </button>
          <button class="px-2 py-1.5 text-ink-2 hover:text-ink" onClick={cancelReject}>
            取消
          </button>
        </Show>
      </div>
    </div>
  );
}
