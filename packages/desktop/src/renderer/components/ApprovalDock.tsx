import type { ApprovalRequest } from "@opentomato/core/protocol";
import { createSignal, Show } from "solid-js";
import { actions, state } from "../state";
import { DiffView } from "./DiffView";

export function ApprovalDock(props: { request: ApprovalRequest }) {
  const [reason, setReason] = createSignal("");
  const [rejecting, setRejecting] = createSignal(false);
  const agent = () => state.agents[props.request.agentId];

  return (
    <div class="mx-5 mb-2 rounded-xl border border-accent/40 bg-paper shadow-lg overflow-hidden">
      <div class="flex items-center gap-2 px-4 py-2 bg-accent-soft/60 border-b border-line">
        <span class="w-2 h-2 rounded-full bg-accent" />
        <span class="font-medium">{agent()?.label ?? "agent"} 请求写入</span>
        <span class="font-mono text-ink-2">{props.request.path}</span>
        <Show when={props.request.isNew}>
          <span class="text-[11px] px-1.5 rounded bg-ok-soft text-ok">新建</span>
        </Show>
        <span class="flex-1" />
        <span class="text-ink-2 truncate max-w-[40%]">{props.request.title}</span>
      </div>
      <div class="p-3">
        <DiffView patch={props.request.patch} maxHeight="40vh" />
      </div>
      <div class="flex items-center gap-2 px-4 pb-3">
        <Show
          when={rejecting()}
          fallback={
            <>
              <button
                class="px-3 py-1.5 rounded-lg bg-accent text-white font-medium hover:brightness-110"
                onClick={() => void actions.approve(props.request.approvalId)}
              >
                批准写入
              </button>
              <button class="px-3 py-1.5 rounded-lg border border-line hover:bg-paper-2" onClick={() => setRejecting(true)}>
                拒绝…
              </button>
            </>
          }
        >
          <input
            class="flex-1 px-3 py-1.5 rounded-lg border border-line bg-paper-2 outline-none focus:border-accent"
            placeholder="拒绝原因（会回给 agent，让它照着改）"
            value={reason()}
            onInput={(e) => setReason(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void actions.reject(props.request.approvalId, reason());
              if (e.key === "Escape") setRejecting(false);
            }}
            autofocus
          />
          <button
            class="px-3 py-1.5 rounded-lg bg-danger text-white hover:brightness-110"
            onClick={() => void actions.reject(props.request.approvalId, reason())}
          >
            确认拒绝
          </button>
          <button class="px-2 py-1.5 text-ink-2 hover:text-ink" onClick={() => setRejecting(false)}>
            取消
          </button>
        </Show>
        <span class="flex-1" />
        <Show when={state.approvals.length > 1}>
          <span class="text-ink-3 text-[12px]">还有 {state.approvals.length - 1} 条待审</span>
        </Show>
      </div>
    </div>
  );
}
