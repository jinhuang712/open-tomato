import { onCleanup, onMount, Show } from "solid-js";
import { formatBytes, relativeTime } from "../format";
import { actions, setState, state } from "../state";

/**
 * 关闭项目前的确认，只在「配了云端 + 本机有改动未同步」时弹。
 * 三个出口：同步并关闭（默认，↩）· 不同步直接关 · 取消（esc）。同步中按钮变灰并显示状态。
 */
export function ClosePrompt() {
  const cancel = () => setState("closePromptOpen", false);
  const busy = () => state.cloudSync.phase === "uploading";
  const last = () => state.cloudSync.last;

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !busy()) void actions.syncAndClose();
    };
    document.addEventListener("keydown", onKey);
    onCleanup(() => document.removeEventListener("keydown", onKey));
  });

  return (
    <div class="fixed inset-0 z-50 flex items-start justify-center pt-[18vh] bg-black/30" onClick={cancel}>
      <div class="w-[440px] rounded-2xl bg-paper border border-line shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div class="px-5 pt-4.5 pb-1.5 flex flex-col gap-1.5">
          <span class="text-lg font-semibold leading-snug">关闭前同步到云端？</span>
          <span class="text-ink-2">
            本机的改动还没上云。
            <Show when={last()} fallback="云端还没有这本书的快照。">
              {(l) => (
                <>
                  云端最新一份是 <span class="text-ink">{relativeTime(l().uploadedAt)}</span>
                  {l().host ? `，来自 ${l().host}` : ""}，{formatBytes(l().size)}。
                </>
              )}
            </Show>
          </span>
        </div>
        <Show when={busy()}>
          <div class="px-5 pt-2.5 flex items-center gap-2 text-xs text-accent">
            <span class="shimmer">正在打包上传，传完自动关闭…</span>
          </div>
        </Show>
        <Show when={state.cloudSync.phase === "error"}>
          <div class="px-5 pt-2.5 text-xs text-danger selectable">{state.cloudSync.message}</div>
        </Show>
        <div class="px-5 py-4 flex items-center gap-2">
          <button class="px-3 py-1.5 rounded-lg text-ink-2 hover:bg-paper-3 disabled:opacity-40" disabled={busy()} onClick={() => void actions.closeProject({ skipCloud: true })}>
            不同步，直接关闭
          </button>
          <span class="flex-1" />
          <button class="px-3 py-1.5 rounded-lg border border-line hover:bg-paper-2 disabled:opacity-40" disabled={busy()} onClick={cancel}>
            取消
          </button>
          <button
            class="px-3.5 py-1.5 rounded-lg bg-ink text-paper font-medium disabled:opacity-40 flex items-center gap-1.5"
            disabled={busy()}
            onClick={() => void actions.syncAndClose()}
          >
            <span>{busy() ? "同步中…" : state.cloudSync.phase === "error" ? "重试并关闭" : "同步并关闭"}</span>
            <span class="text-xs opacity-60">↩</span>
          </button>
        </div>
      </div>
    </div>
  );
}
