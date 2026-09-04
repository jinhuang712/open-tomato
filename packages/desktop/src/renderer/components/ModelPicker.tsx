import { createMemo, For, onCleanup, onMount, Show } from "solid-js";
import { actions, setState, state } from "../state";
import { ThinkingLevelPicker } from "./ModelSettings";

/**
 * 顶栏的模型选择器：简单版。只列已配好凭据、此刻就能用的模型，按 provider 分组，点一下就切。
 * 没配凭据的 provider 不在这里露面，填 key、翻全目录去「设置 › 模型」。
 */
export function ModelPicker() {
  const close = () => setState("modelPickerOpen", false);
  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    onCleanup(() => document.removeEventListener("keydown", onKey));
  });
  const models = () => state.models;
  const groups = createMemo(() => {
    const providers = models()?.providers ?? [];
    return providers
      .filter((p) => p.configured)
      .map((p) => ({
        provider: p,
        models: (models()?.models ?? []).filter((m) => m.provider === p.id && m.available).sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .filter((g) => g.models.length > 0)
      .sort((a, b) => a.provider.name.localeCompare(b.provider.name));
  });
  const currentModel = () => {
    const c = models()?.current;
    return c ? models()?.models.find((m) => m.provider === c.provider && m.id === c.id) : undefined;
  };
  const openSettings = () => {
    close();
    setState({ settingsOpen: true, settingsTab: "models" });
  };

  return (
    <div class="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] bg-black/30" onClick={close}>
      <div class="w-[520px] max-h-[70vh] rounded-2xl bg-paper border border-line shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div class="flex items-center gap-3 px-5 py-3 border-b border-line">
          <span class="font-medium">模型</span>
          <span class="text-ink-3 text-xs">只列已配好凭据的</span>
          <span class="flex-1" />
          <button class="text-xs text-ink-2 hover:text-ink" onClick={openSettings}>
            配置凭据与全目录…
          </button>
          <button class="text-ink-3 hover:text-ink px-1" onClick={close}>
            ✕
          </button>
        </div>
        <div class="flex-1 overflow-y-auto py-2">
          <For each={groups()}>
            {(g) => (
              <div class="mb-2">
                <div class="px-5 py-1 text-xs text-ink-3">{g.provider.name}</div>
                <For each={g.models}>
                  {(m) => {
                    const active = () => models()?.current?.provider === m.provider && models()?.current?.id === m.id;
                    return (
                      <button
                        class={`w-full flex items-center gap-3 px-5 py-1.5 text-left ${active() ? "bg-accent-soft" : "hover:bg-paper-2"}`}
                        onClick={() => {
                          void actions.selectModel(m.provider, m.id);
                          close();
                        }}
                      >
                        <span class="truncate">{m.name}</span>
                        <span class="text-xs text-ink-3 truncate">{m.id}</span>
                        <span class="flex-1" />
                        <Show when={m.reasoning}>
                          <span class="text-xs px-1 rounded bg-paper-3 text-ink-2 shrink-0 whitespace-nowrap">思考</span>
                        </Show>
                        <span class="text-xs text-ink-3 w-14 text-right">{Math.round(m.contextWindow / 1000)}k</span>
                      </button>
                    );
                  }}
                </For>
              </div>
            )}
          </For>
          <Show when={groups().length === 0}>
            <div class="px-5 py-10 text-center text-ink-3 space-y-2">
              <div>还没有配好凭据的模型</div>
              <button class="text-accent hover:underline" onClick={openSettings}>
                去设置里填 API key
              </button>
            </div>
          </Show>
        </div>
        <Show when={currentModel()}>
          {(cm) => (
            <div class="px-5 py-2.5 border-t border-line flex items-center gap-2 text-xs whitespace-nowrap">
              <span class="text-ink-2 shrink-0">当前：</span>
              <span class="font-medium truncate">{cm().name}</span>
              <span class="flex-1" />
              <Show when={cm().reasoning}>
                <span class="text-ink-3 shrink-0">思考强度</span>
                <ThinkingLevelPicker value={models()?.thinkingLevel ?? "off"} onPick={(lv) => void actions.selectModel(cm().provider, cm().id, lv)} />
              </Show>
            </div>
          )}
        </Show>
      </div>
    </div>
  );
}
