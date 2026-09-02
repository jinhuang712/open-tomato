import { For, Show } from "solid-js";
import { actions, setState, state } from "../state";

export function Welcome() {
  return (
    <div class="h-full flex items-center justify-center">
      <div class="w-[560px]">
        <div class="font-serif text-4xl mb-1">OpenTomato</div>
        <div class="text-ink-2 mb-8">从一句话到一本书。每一次落笔，你先看 diff 再点头。</div>

        <div class="flex gap-2 mb-8">
          <button class="px-4 py-2 rounded-xl bg-accent text-white font-medium hover:brightness-110" onClick={() => void actions.newProject()}>
            新建项目
          </button>
          <button class="px-4 py-2 rounded-xl border border-line hover:bg-paper-2" onClick={() => void actions.openProject()}>
            打开项目…
          </button>
          <span class="flex-1" />
          <button class="px-4 py-2 rounded-xl border border-line hover:bg-paper-2" onClick={() => setState("modelPickerOpen", true)}>
            {state.models?.current ? `${state.models.current.provider} / ${state.models.current.id}` : "配置模型"}
          </button>
        </div>

        <Show when={state.recent.length > 0}>
          <div class="text-[11px] uppercase tracking-wider text-ink-3 mb-2">最近</div>
          <div class="space-y-1">
            <For each={state.recent}>
              {(r) => (
                <button class="w-full text-left px-3 py-2 rounded-lg hover:bg-paper-2 flex items-center gap-3" onClick={() => void actions.openProject(r)}>
                  <span class="font-medium">{r.split("/").filter(Boolean).pop()}</span>
                  <span class="text-ink-3 text-[12px] font-mono truncate">{r}</span>
                </button>
              )}
            </For>
          </div>
        </Show>

        <Show when={!state.ready && !state.kernelError}>
          <div class="mt-8 text-ink-3 text-[12px] shimmer w-fit">内核启动中…</div>
        </Show>
        <Show when={state.kernelError}>
          <div class="mt-8 px-3 py-2 rounded-lg bg-danger-soft text-danger text-[12px] selectable">{state.kernelError}</div>
        </Show>
      </div>
    </div>
  );
}
