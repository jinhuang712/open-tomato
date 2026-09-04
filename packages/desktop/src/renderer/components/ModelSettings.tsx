import type { ThinkingLevel } from "@opentomato/core/protocol";
import { createMemo, createSignal, For, Show } from "solid-js";
import { actions, state } from "../state";

const LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

/**
 * 设置 › 模型：完整配置面。左边 provider 列表，右边填 API key、翻整份模型目录、切当前模型与思考档。
 * 顶栏那个选择器只列已配好凭据的模型，配凭据、看全目录都在这里。
 */
export function ModelSettings() {
  const [provider, setProvider] = createSignal<string | null>(null);
  const [filter, setFilter] = createSignal("");
  const [apiKey, setApiKey] = createSignal("");
  const models = () => state.models;

  const providers = createMemo(() => {
    const list = models()?.providers ?? [];
    return [...list].sort((a, b) => Number(b.configured) - Number(a.configured) || a.name.localeCompare(b.name));
  });
  const selectedProvider = () => provider() ?? models()?.current?.provider ?? providers()[0]?.id ?? null;
  const providerInfo = () => providers().find((p) => p.id === selectedProvider());
  const visibleModels = createMemo(() => {
    const q = filter().trim().toLowerCase();
    return (models()?.models ?? [])
      .filter((m) => m.provider === selectedProvider())
      .filter((m) => !q || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
      .sort((a, b) => Number(b.available) - Number(a.available) || a.name.localeCompare(b.name));
  });
  const currentModel = () => {
    const c = models()?.current;
    return c ? models()?.models.find((m) => m.provider === c.provider && m.id === c.id) : undefined;
  };
  const saveKey = (id: string) => {
    if (!apiKey().trim()) return;
    void actions.setApiKey(id, apiKey());
    setApiKey("");
  };

  return (
    <div class="flex-1 flex flex-col min-h-0">
      <div class="flex items-center gap-3 px-4 py-2 border-b border-line text-xs text-ink-3">
        <span>凭据与自定义 provider 沿用 pi：~/.pi/agent/auth.json · models.json</span>
        <span class="flex-1" />
        <button class="text-ink-2 hover:text-ink" onClick={() => void actions.refreshModels()}>
          刷新目录
        </button>
      </div>
      <div class="flex flex-1 min-h-0">
        <div class="w-[200px] shrink-0 border-r border-line overflow-y-auto py-2">
          <For each={providers()}>
            {(p) => (
              <button
                class={`w-full flex items-center gap-2 px-4 py-1.5 text-left ${selectedProvider() === p.id ? "bg-paper-3" : "hover:bg-paper-2"}`}
                onClick={() => setProvider(p.id)}
              >
                <span class={`w-1.5 h-1.5 rounded-full ${p.configured ? "bg-ok" : "bg-line"}`} />
                <span class="truncate">{p.name}</span>
                <span class="flex-1" />
                <span class="text-xs text-ink-3">{p.modelCount}</span>
              </button>
            )}
          </For>
        </div>
        <div class="flex-1 flex flex-col min-w-0">
          <Show when={providerInfo()}>
            {(p) => (
              <div class="px-4 py-3 border-b border-line space-y-2">
                <div class="flex items-center gap-2">
                  <span class="font-medium">{p().name}</span>
                  <span class={`text-xs px-1.5 rounded ${p().configured ? "bg-ok-soft text-ok" : "bg-paper-3 text-ink-3"}`}>
                    {p().configured ? "已配置" : "未配置"}
                  </span>
                </div>
                <div class="flex gap-2">
                  <input
                    type="password"
                    class="flex-1 px-3 py-1.5 rounded-lg border border-line bg-paper-2 outline-none focus:border-accent font-mono text-xs"
                    placeholder={`${p().id} API key（也可以用环境变量）`}
                    value={apiKey()}
                    onInput={(e) => setApiKey(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveKey(p().id);
                    }}
                  />
                  <button class="px-3 py-1.5 rounded-lg bg-ink text-paper disabled:opacity-40" disabled={!apiKey().trim()} onClick={() => saveKey(p().id)}>
                    保存
                  </button>
                </div>
              </div>
            )}
          </Show>
          <div class="px-4 py-2 border-b border-line">
            <input
              class="w-full px-3 py-1.5 rounded-lg border border-line bg-paper-2 outline-none focus:border-accent text-xs"
              placeholder="筛选模型…"
              value={filter()}
              onInput={(e) => setFilter(e.currentTarget.value)}
            />
          </div>
          <div class="flex-1 overflow-y-auto py-1">
            <For each={visibleModels()}>
              {(m) => {
                const active = () => models()?.current?.provider === m.provider && models()?.current?.id === m.id;
                return (
                  <button
                    class={`w-full flex items-center gap-3 px-4 py-1.5 text-left ${active() ? "bg-accent-soft" : "hover:bg-paper-2"} ${m.available ? "" : "opacity-50"}`}
                    onClick={() => void actions.selectModel(m.provider, m.id)}
                    title={m.available ? "" : "该提供方还没有可用凭据"}
                  >
                    <span class="truncate">{m.name}</span>
                    <span class="text-xs text-ink-3 truncate">{m.id}</span>
                    <span class="flex-1" />
                    <Show when={m.reasoning}>
                      <span class="text-xs px-1 rounded bg-paper-3 text-ink-2">思考</span>
                    </Show>
                    <span class="text-xs text-ink-3 w-16 text-right">{Math.round(m.contextWindow / 1000)}k</span>
                  </button>
                );
              }}
            </For>
            <Show when={visibleModels().length === 0}>
              <div class="px-4 py-8 text-center text-ink-3">没有匹配的模型</div>
            </Show>
          </div>
          <Show when={currentModel()}>
            {(cm) => (
              <div class="px-4 py-2.5 border-t border-line flex items-center gap-2 text-xs">
                <span class="text-ink-2">当前：</span>
                <span class="font-medium">{cm().name}</span>
                <span class="flex-1" />
                <Show when={cm().reasoning}>
                  <span class="text-ink-3">思考强度</span>
                  <ThinkingLevelPicker value={models()?.thinkingLevel ?? "off"} onPick={(lv) => void actions.selectModel(cm().provider, cm().id, lv)} />
                </Show>
              </div>
            )}
          </Show>
        </div>
      </div>
    </div>
  );
}

export function ThinkingLevelPicker(props: { value: ThinkingLevel; onPick: (lv: ThinkingLevel) => void }) {
  return (
    <div class="flex rounded-md border border-line overflow-hidden">
      <For each={LEVELS}>
        {(lv) => (
          <button class={`px-2 py-0.5 ${props.value === lv ? "bg-paper-3 text-ink" : "text-ink-3 hover:text-ink"}`} onClick={() => props.onPick(lv)}>
            {lv}
          </button>
        )}
      </For>
    </div>
  );
}
