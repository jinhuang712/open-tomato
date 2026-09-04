import { For, Show } from "solid-js";
import { actions, state } from "../state";
import { PixelWordmark } from "./PixelArt";
import logo from "../assets/logo-64.png";

export function Welcome() {
  return (
    <div class="h-full flex flex-col items-center">
      <div class="mt-24">
        <PixelWordmark />
      </div>
      <div class="w-[560px] mt-20">
        <div class="text-ink-2 mb-8">从一句话到一本书。</div>

        <div class="flex gap-2 mb-8">
          <button class="px-4 py-2 rounded-lg bg-ink text-paper font-medium hover:brightness-110" onClick={() => void actions.newProject()}>
            新建项目
          </button>
          <button class="px-4 py-2 rounded-lg border border-line hover:bg-paper-2" onClick={() => void actions.openProject()}>
            打开项目…
          </button>
        </div>

        <Show when={state.recent.length > 0}>
          <div class="text-xs text-ink-3 mb-2">最近打开</div>
          <div class="space-y-1">
            <For each={state.recent}>
              {(r) => (
                <div class="group flex items-center rounded-lg hover:bg-paper-2">
                  <button class="flex-1 min-w-0 text-left px-3 py-2 flex items-center gap-3" onClick={() => void actions.openProject(r)}>
                    <span class="font-medium">{r.split("/").filter(Boolean).pop()}</span>
                    <span class="text-ink-3 text-xs truncate">{r}</span>
                  </button>
                  <div class="mr-2 flex gap-1 opacity-0 group-hover:opacity-100">
                    <button
                      class="px-2 py-1 rounded text-xs text-ink-3 hover:text-ink hover:bg-paper"
                      title="从最近列表移除（不删文件）"
                      onClick={() => void actions.forgetProject(r)}
                    >
                      移除
                    </button>
                    <button
                      class="px-2 py-1 rounded text-xs text-ink-3 hover:text-danger hover:bg-danger-soft"
                      title="把项目文件夹移到废纸篓"
                      onClick={() => void actions.deleteProject(r)}
                    >
                      删除…
                    </button>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>

        <Show when={!state.ready && !state.kernelError}>
          <div class="mt-8 text-ink-3 text-xs shimmer w-fit">内核启动中…</div>
        </Show>
        <Show when={state.kernelError}>
          <div class="mt-8 px-3 py-2 rounded-lg bg-danger-soft text-danger text-xs selectable">{state.kernelError}</div>
        </Show>
      </div>
      <div class="flex-1" />
      <div class="mb-12 flex flex-col items-center gap-2 px-6 pt-4 pb-3 rounded-lg border border-line">
        <img src={logo} alt="" class="w-12 h-12" style={{ "image-rendering": "pixelated" }} />
        <span class="text-xs text-ink-2">OpenTomato</span>
      </div>
    </div>
  );
}
