import { createSignal, Show } from "solid-js";
import { actions, state } from "../state";

export function Composer() {
  const [text, setText] = createSignal("");
  const lead = () => state.agents.lead;
  const busy = () => lead()?.status === "running";
  const noModel = () => !state.models?.current;

  const send = () => {
    const t = text();
    if (!t.trim()) return;
    setText("");
    void actions.send(t);
  };

  return (
    <div class="px-5 pb-4 pt-1">
      <div class="rounded-2xl border border-line bg-paper-2 focus-within:border-accent transition-colors">
        <textarea
          class="w-full bg-transparent px-4 pt-3 pb-1 outline-none resize-none text-[13.5px] leading-relaxed"
          rows={3}
          placeholder={noModel() ? "先在右上角选一个模型并填 API key" : "和主编说话…（⌘↩ 发送，运行中发送会插话）"}
          value={text()}
          disabled={noModel()}
          onInput={(e) => setText(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div class="flex items-center gap-2 px-3 pb-2">
          <span class="text-[11px] text-ink-3">
            {state.models?.current ? `${state.models.current.provider} / ${state.models.current.id}` : "未选模型"}
            {state.models?.thinkingLevel && state.models.thinkingLevel !== "off" ? ` · 思考 ${state.models.thinkingLevel}` : ""}
          </span>
          <span class="flex-1" />
          <Show when={busy()}>
            <button class="px-3 py-1 rounded-lg border border-line text-ink-2 hover:text-danger hover:border-danger" onClick={() => void actions.abort()}>
              停止
            </button>
          </Show>
          <button
            class="px-3 py-1 rounded-lg bg-ink text-paper font-medium hover:brightness-110 disabled:opacity-40"
            disabled={!text().trim() || noModel()}
            onClick={send}
          >
            {busy() ? "插话" : "发送"}
          </button>
        </div>
      </div>
    </div>
  );
}
