import type { ApprovalRequest } from "@opentomato/core/protocol";
import { createSignal, Show } from "solid-js";
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
  const approve = () => {
    void actions.approve(props.request.approvalId);
    close();
  };
  const reject = () => {
    void actions.reject(props.request.approvalId, reason());
    close();
  };
  const remaining = () => state.approvals.length - 1;

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={close}>
      <div
        class="w-full max-w-[920px] max-h-[88vh] rounded-2xl bg-paper border border-line shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
        }}
      >
        <div class="flex items-center gap-3 px-5 py-3 border-b border-line">
          <span class="w-2 h-2 rounded-full bg-accent" />
          <span class="font-medium">{agent()?.label ?? "agent"} 请求写入</span>
          <DocLink kind={props.request.kind} id={props.request.docId} class="text-[12px]" />
          <Show when={props.request.isNew}>
            <span class="text-[11px] px-1.5 rounded bg-ok-soft text-ok">新建</span>
          </Show>
          <span class="text-ink-2 truncate">{props.request.title}</span>
          <span class="flex-1" />
          <div class="flex rounded-md border border-line overflow-hidden text-[12px]">
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

        <div class="flex-1 overflow-y-auto px-8 py-6">
          <Show when={tab() === "review"} fallback={<DiffView patch={props.request.patch} maxHeight="70vh" />}>
            <TrackChanges before={props.request.before} after={props.request.after} isNew={props.request.isNew} />
          </Show>
        </div>

        <div class="flex items-center gap-2 px-5 py-3 border-t border-line bg-paper-2">
          <span class="text-[11px] text-ink-3 flex items-center gap-3">
            <span>
              <ins class="tc-ins">新增</ins>
            </span>
            <span>
              <del class="tc-del">删去</del>
            </span>
          </span>
          <span class="flex-1" />
          <Show when={remaining() > 0}>
            <span class="text-ink-3 text-[12px] mr-2">还有 {remaining()} 条待审</span>
          </Show>
          <Show
            when={rejecting()}
            fallback={
              <>
                <button class="px-3 py-1.5 rounded-lg border border-line hover:bg-paper-3" onClick={() => setRejecting(true)}>
                  拒绝…
                </button>
                <button class="px-4 py-1.5 rounded-lg bg-accent text-white font-medium hover:brightness-110" onClick={approve}>
                  批准写入
                </button>
              </>
            }
          >
            <input
              class="w-[360px] px-3 py-1.5 rounded-lg border border-line bg-paper outline-none focus:border-accent"
              placeholder="拒绝原因（会回给 agent，让它照着改）"
              value={reason()}
              onInput={(e) => setReason(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") reject();
                if (e.key === "Escape") setRejecting(false);
              }}
              autofocus
            />
            <button class="px-3 py-1.5 rounded-lg bg-danger text-white hover:brightness-110" onClick={reject}>
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
