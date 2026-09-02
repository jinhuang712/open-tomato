import { createEffect, createSignal, Show } from "solid-js";
import { actions, setState, state } from "../state";

export function Composer(props: { agentId?: string }) {
  const [text, setText] = createSignal("");
  let box: HTMLTextAreaElement | undefined;

  // 快捷按钮预填：接过来、光标放末尾、清掉草稿
  createEffect(() => {
    const draft = state.composerDraft;
    if (draft === null) return;
    setText(draft);
    setState("composerDraft", null);
    queueMicrotask(() => {
      box?.focus();
      box?.setSelectionRange(draft.length, draft.length);
    });
  });
  const agentId = () => props.agentId ?? "lead";
  const isLead = () => agentId() === "lead";
  const agent = () => state.agents[agentId()];
  const busy = () => agent()?.status === "running";
  const gone = () => !isLead() && (agent()?.status === "done" || agent()?.status === "error");
  const noModel = () => !state.models?.current;
  const disabled = () => noModel() || gone();

  const placeholder = () => {
    if (noModel()) return "先在右上角选一个模型并填 API key";
    if (gone()) return `${agent()?.label ?? "子 agent"} 已经收工，这段对话只能看`;
    if (!isLead()) return `给${agent()?.label ?? "子 agent"}插话…（⌘↩ 发送，它会在当前步骤后处理）`;
    return "和主编说话…（⌘↩ 发送，运行中发送会插话）";
  };

  const send = () => {
    const t = text();
    if (!t.trim()) return;
    setText("");
    void actions.send(t, agentId());
  };

  return (
    <div class="px-5 pb-4 pt-1">
      <div class="rounded-2xl border border-line bg-paper-2 focus-within:border-accent transition-colors">
        <textarea
          ref={box}
          class="w-full bg-transparent px-4 pt-3 pb-1 outline-none resize-none text-[13.5px] leading-relaxed"
          rows={3}
          placeholder={placeholder()}
          value={text()}
          disabled={disabled()}
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
            <button
              class="px-3 py-1 rounded-lg border border-line text-ink-2 hover:text-danger hover:border-danger"
              onClick={() => void actions.abort(isLead() ? undefined : agentId())}
              title={isLead() ? "停下主编和所有子 agent" : `只停下${agent()?.label}`}
            >
              停止
            </button>
          </Show>
          <button
            class="px-3 py-1 rounded-lg bg-ink text-paper font-medium hover:brightness-110 disabled:opacity-40"
            disabled={!text().trim() || disabled()}
            onClick={send}
          >
            {busy() ? "插话" : "发送"}
          </button>
        </div>
      </div>
    </div>
  );
}
