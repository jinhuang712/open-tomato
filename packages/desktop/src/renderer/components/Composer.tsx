import { createEffect, createSignal, For, on, Show } from "solid-js";
import { autoGrow } from "../autogrow";
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
      if (box) autoGrow(box);
    });
  });
  // 作者圈了一段字进来，光标跟过去，让他直接开口
  const quotes = () => state.composerQuotes;
  createEffect(
    on(
      () => quotes().length,
      (n, prev) => {
        if (prev !== undefined && n > prev) box?.focus();
      },
      { defer: true },
    ),
  );
  const dropQuote = (id: string) => setState("composerQuotes", (qs) => qs.filter((q) => q.id !== id));
  // 发送后清空要把高度收回去
  createEffect(() => {
    text();
    if (box) autoGrow(box);
  });
  const agentId = () => props.agentId ?? "lead";
  const isLead = () => agentId() === "lead";
  const agent = () => state.agents[agentId()];
  const busy = () => agent()?.status === "running";
  const gone = () => !isLead() && agent()?.status === "error";
  const resting = () => !isLead() && agent()?.status === "done";
  const noModel = () => !state.models?.current;
  const disabled = () => noModel() || gone();

  const placeholder = () => {
    if (noModel()) return "先在右上角选一个模型并填 API key";
    if (gone()) return `${agent()?.label ?? "子 agent"} 出错退场了，这段对话只能看`;
    if (resting()) return `接着和${agent()?.label ?? "子 agent"}聊…（⌘↩ 发送，比如挑一个候选让它往下孵化）`;
    if (!isLead()) return `给${agent()?.label ?? "子 agent"}插话…（⌘↩ 发送，它会在当前步骤后处理）`;
    if (quotes().length) return "对这段说点什么";
    return "和主编说话";
  };

  // 引用按 markdown 引用块排在正文前面，主编一眼看出作者在对哪段说话
  const canSend = () => Boolean(text().trim()) || quotes().length > 0;
  const send = () => {
    if (!canSend()) return;
    const blocks = quotes().map((q) => q.text.split("\n").map((l) => `> ${l}`).join("\n"));
    const t = [...blocks, text().trim()].filter(Boolean).join("\n\n");
    setText("");
    setState("composerQuotes", []);
    void actions.send(t, agentId());
  };

  return (
    <div class="px-5 pb-4 pt-1">
      <div class="rounded-xl border border-line-2 bg-paper-2 focus-within:border-ink-3 transition-colors">
        <Show when={isLead() && quotes().length > 0}>
          <div class="flex flex-col gap-1.5 px-3 pt-3">
            <For each={quotes()}>
              {(q) => (
                <div class="group flex items-start gap-2 pl-3 pr-1 py-0.5 border-l-2 border-ink-3">
                  <div class="flex-1 min-w-0">
                    <div class="text-xs text-ink-3 leading-tight">{q.role === "user" ? "你说过" : "主编说过"}</div>
                    <div class="font-serif text-sm text-ink-2 whitespace-pre-line line-clamp-2">{q.text}</div>
                  </div>
                  <button
                    class="shrink-0 w-6 h-6 rounded-md text-ink-3 hover:text-ink hover:bg-paper-3 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    title="去掉这段引用"
                    onClick={() => dropQuote(q.id)}
                  >
                    ×
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>
        <textarea
          ref={box}
          class="w-full bg-transparent px-4 pt-3 pb-1 outline-none resize-none text-sm placeholder:text-ink-3"
          rows={2}
          placeholder={placeholder()}
          value={text()}
          disabled={disabled()}
          onInput={(e) => {
            setText(e.currentTarget.value);
            autoGrow(e.currentTarget);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div class="flex items-center gap-2 px-3 pb-2">
          <span class="flex-1" />
          <Show when={busy()}>
            <button
              class="h-7 px-3 rounded-md text-xs text-ink-2 hover:text-ink hover:bg-paper-3"
              onClick={() => void actions.pause(agentId())}
              title="收尾当前这步，总结进度，然后停下来问你想怎么调整"
            >
              暂停
            </button>
          </Show>
          <button
            class="h-7 px-3 rounded-md bg-ink text-paper text-xs font-medium hover:brightness-110 disabled:opacity-30"
            disabled={!canSend() || disabled()}
            onClick={send}
            title="⌘↩"
          >
            {busy() ? "插话" : "发送"}
          </button>
        </div>
      </div>
    </div>
  );
}
