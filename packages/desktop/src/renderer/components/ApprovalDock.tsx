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
    <div class="mx-5 mb-2 rounded-lg bg-warn-soft border border-warn/25 overflow-hidden">
      <div class="flex items-center gap-3 px-4 h-11">
        <span class="w-2 h-2 rounded-full bg-warn shrink-0" />
        <span class="shrink-0">{agent()?.label ?? "agent"} 要写入</span>
        <DocLink kind={props.request.kind} id={props.request.docId} class="text-xs" />
        <Show when={props.request.isNew}>
          <span class="text-xs px-1.5 rounded bg-ok-soft text-ok">新建</span>
        </Show>
        <span class="text-xs text-ink-3 shrink-0">
          <span class="text-ok">+{stats().add}</span> <span class="text-danger">−{stats().del}</span>
        </span>
        <span class="flex-1" />
        <button
          class="h-7 px-3 rounded-md bg-warn text-paper text-xs font-medium hover:brightness-110"
          onClick={() => setState("reviewOpen", props.request.approvalId)}
        >
          审阅
        </button>
        <button class="h-7 px-3 rounded-md text-xs text-ink-2 hover:text-ink" onClick={() => void actions.approve(props.request.approvalId)} title="不看了，直接写">
          直接批准
        </button>
        <Show when={state.approvals.length > 1}>
          <span class="text-ink-3 text-xs">还有 {state.approvals.length - 1} 条</span>
        </Show>
      </div>
    </div>
  );
}
