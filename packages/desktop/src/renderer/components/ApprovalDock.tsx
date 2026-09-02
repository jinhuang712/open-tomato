import type { ApprovalRequest } from "@opentomato/core/protocol";
import { createMemo, Show } from "solid-js";
import { actions, setState, state } from "../state";
import { DocLink } from "./DocLink";

/** 输入框位置的紧凑条：一句话说明 + 打开审阅弹窗；弹窗关掉后还能从这里再进 */
export function ApprovalDock(props: { request: ApprovalRequest }) {
  const agent = () => state.agents[props.request.agentId];
  const stats = createMemo(() => {
    let add = 0;
    let del = 0;
    for (const line of props.request.patch.split("\n")) {
      if (line.startsWith("+") && !line.startsWith("+++")) add++;
      else if (line.startsWith("-") && !line.startsWith("---")) del++;
    }
    return { add, del };
  });

  return (
    <div class="mx-5 mb-2 rounded-xl border border-accent/40 bg-paper shadow-lg overflow-hidden">
      <div class="flex items-center gap-3 px-4 py-3">
        <span class="w-2 h-2 rounded-full bg-accent shrink-0" />
        <span class="font-medium shrink-0">{agent()?.label ?? "agent"} 请求写入</span>
        <DocLink kind={props.request.kind} id={props.request.docId} class="text-[12px]" />
        <Show when={props.request.isNew}>
          <span class="text-[11px] px-1.5 rounded bg-ok-soft text-ok">新建</span>
        </Show>
        <span class="text-[12px] text-ink-3 shrink-0">
          <span class="text-ok">+{stats().add}</span> <span class="text-danger">−{stats().del}</span>
        </span>
        <span class="flex-1" />
        <button
          class="px-3 py-1.5 rounded-lg bg-accent text-white font-medium hover:brightness-110"
          onClick={() => setState("reviewOpen", props.request.approvalId)}
        >
          审阅
        </button>
        <button class="px-3 py-1.5 rounded-lg border border-line hover:bg-paper-2" onClick={() => void actions.approve(props.request.approvalId)} title="不看了，直接写">
          直接批准
        </button>
        <Show when={state.approvals.length > 1}>
          <span class="text-ink-3 text-[12px]">还有 {state.approvals.length - 1} 条</span>
        </Show>
      </div>
    </div>
  );
}
