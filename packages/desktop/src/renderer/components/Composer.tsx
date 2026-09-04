import { createEffect, createSignal, For, on, Show } from "solid-js";
import { keyHint } from "../../shared/keymap";
import { autoGrow } from "../autogrow";
import { bridge } from "../bridge";
import { actions, setState, state } from "../state";

interface Attachment {
  id: string;
  name: string;
  content: string;
}

/** 只收纯文本稿件；超过这个尺寸的文件基本不是给主编读的 */
const ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024;
const isTextFile = (f: File) => /\.(md|markdown|txt)$/i.test(f.name) || f.type.startsWith("text/");

async function readFiles(files: Iterable<File>): Promise<{ name: string; content: string }[]> {
  const out: { name: string; content: string }[] = [];
  for (const f of files) {
    if (!isTextFile(f) || f.size > ATTACHMENT_MAX_BYTES) continue;
    out.push({ name: f.name, content: await f.text() });
  }
  return out;
}

/** 附件按 markdown 围栏拼进消息末尾，主编一眼看出哪段是作者说的、哪段是带来的材料 */
export function inlineAttachments(atts: { name: string; content: string }[]): string[] {
  return atts.map((a) => `附件「${a.name}」：\n\n\`\`\`\`markdown\n${a.content.trim()}\n\`\`\`\``);
}

/**
 * 输入框。agent 空闲时只有「发送」；跑着的时候三个动作，快捷键都印在按钮上（符号取自 shared/keymap）：
 * 插话在当前这步工具结束后就送到；排队等这一轮跑完再送；暂停让它收尾停下来问你；停立刻掐断。
 * 还没送到的消息列在输入框上方，可以一键撤回到输入框里改。
 * 作者圈出来的引用段落挂在框内顶部，随下一条消息一起发出。
 * 附件（md / txt）三条路进来：按钮选文件、拖进输入框、Finder 里 ⌘C 后在框里 ⌘V；发送时全文内联到消息末尾。
 */
export function Composer(props: { agentId?: string }) {
  const [text, setText] = createSignal("");
  const [attachments, setAttachments] = createSignal<Attachment[]>([]);
  const [dragging, setDragging] = createSignal(false);
  let box: HTMLTextAreaElement | undefined;

  const addAttachments = (files: { name: string; content: string }[]) => {
    if (files.length === 0) return;
    setAttachments((prev) => [...prev, ...files.map((f) => ({ ...f, id: crypto.randomUUID() }))]);
    box?.focus();
  };
  const dropAttachment = (id: string) => setAttachments((as) => as.filter((a) => a.id !== id));
  const pickFiles = async () => addAttachments(await bridge.pickTextFiles());
  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer?.files.length) addAttachments(await readFiles(e.dataTransfer.files));
  };
  // Finder 复制的文件 Chromium 多半放在 clipboardData.files 里；拿不到就让主进程去读系统剪贴板
  const onPaste = async (e: ClipboardEvent) => {
    const files = e.clipboardData?.files;
    if (files?.length) {
      e.preventDefault();
      addAttachments(await readFiles(files));
      return;
    }
    if (e.clipboardData?.getData("text/plain")) return;
    const fromClipboard = await bridge.readClipboardTextFiles();
    if (fromClipboard.length) {
      e.preventDefault();
      addAttachments(fromClipboard);
    }
  };

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
  const queue = () => state.queues[agentId()] ?? { steering: [], followUp: [] };
  const pending = () => [...queue().steering.map((t) => ({ kind: "插话", text: t })), ...queue().followUp.map((t) => ({ kind: "排队", text: t }))];

  const placeholder = () => {
    if (noModel()) return "先在右上角选一个模型并填 API key";
    if (gone()) return `${agent()?.label ?? "子 agent"} 出错退场了，这段对话只能看`;
    if (resting()) return `接着和${agent()?.label ?? "子 agent"}聊，比如挑一个候选让它往下孵化`;
    if (busy()) return isLead() ? "主编在忙。插话它这步做完就看，排队等它这轮跑完" : `${agent()?.label ?? "子 agent"}在忙。插话它这步做完就看，排队等它这轮跑完`;
    if (quotes().length) return "对这段说点什么";
    if (attachments().length) return "这些材料想让主编怎么用";
    return "和主编说话";
  };

  // 引用按 markdown 引用块排在正文前面，主编一眼看出作者在对哪段说话
  const canSend = () => Boolean(text().trim()) || quotes().length > 0 || attachments().length > 0;
  const submit = (deliverAs: "steer" | "followUp") => {
    if (!canSend() || disabled()) return;
    const blocks = quotes().map((q) => q.text.split("\n").map((l) => `> ${l}`).join("\n"));
    const t = [...blocks, text().trim(), ...inlineAttachments(attachments())].filter(Boolean).join("\n\n");
    setText("");
    setAttachments([]);
    setState("composerQuotes", []);
    void actions.send(t, agentId(), deliverAs);
  };

  return (
    <div class="px-5 pb-4 pt-1">
      <Show when={pending().length > 0}>
        <div class="mb-2 px-1 flex items-start gap-3 text-xs">
          <div class="flex-1 min-w-0 space-y-1">
            <For each={pending()}>
              {(m) => (
                <div class="flex items-baseline gap-2 min-w-0">
                  <span class="shrink-0 text-ink-3">{m.kind}</span>
                  <span class="truncate text-ink-2">{m.text}</span>
                </div>
              )}
            </For>
          </div>
          <button class="shrink-0 text-ink-3 hover:text-ink" onClick={() => void actions.recallQueue(agentId())} title="还没送到的都收回输入框">
            撤回
          </button>
        </div>
      </Show>
      <div
        class="rounded-xl border bg-paper-2 focus-within:border-ink-3 transition-colors"
        classList={{ "border-line-2": !dragging(), "border-ink-3 border-dashed": dragging() }}
        onDragOver={(e) => {
          if (disabled() || !e.dataTransfer?.types.includes("Files")) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => void onDrop(e)}
      >
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
        <Show when={attachments().length > 0}>
          <div class="flex flex-wrap gap-1.5 px-3 pt-3">
            <For each={attachments()}>
              {(a) => (
                <span class="group inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-md border border-line-2 bg-paper text-xs text-ink-2" title={`${a.content.length} 字`}>
                  <span class="max-w-[14rem] truncate">{a.name}</span>
                  <button class="w-4 h-4 rounded text-ink-3 hover:text-ink hover:bg-paper-3" title="去掉这个附件" onClick={() => dropAttachment(a.id)}>
                    ×
                  </button>
                </span>
              )}
            </For>
          </div>
        </Show>
        <textarea
          ref={box}
          onPaste={(e) => void onPaste(e)}
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
            const mod = e.metaKey || e.ctrlKey;
            if (!mod) return;
            if (e.key === "Enter") {
              e.preventDefault();
              submit(e.shiftKey && busy() ? "followUp" : "steer");
            } else if ((e.key === "." || e.key === ">") && busy()) {
              e.preventDefault();
              if (e.shiftKey) void actions.stop(agentId());
              else void actions.pause(agentId());
            }
          }}
        />
        <div class="flex items-center gap-1.5 px-3 pb-2">
          <button
            class="h-7 px-2 rounded-md text-xs text-ink-3 hover:text-ink hover:bg-paper-3 disabled:opacity-30"
            disabled={disabled()}
            title="添加 md / txt 文件作为附件，也可以直接拖进来或 ⌘V 粘贴 Finder 里复制的文件"
            onClick={() => void pickFiles()}
          >
            ＋ 附件
          </button>
          <span class="flex-1" />
          <Show when={busy()}>
            <ActionButton label="停" keys={keyHint("composer.stop")} tone="danger" onClick={() => void actions.stop(agentId())} title="立刻掐断正在跑的模型调用和工具，写了一半的东西不落盘" />
            <ActionButton label="暂停" keys={keyHint("composer.pause")} tone="quiet" onClick={() => void actions.pause(agentId())} title="收尾当前这步，总结进度，然后停下来问你想怎么调整" />
            <ActionButton
              label="排队"
              keys={keyHint("composer.followUp")}
              tone="quiet"
              disabled={!canSend() || disabled()}
              onClick={() => submit("followUp")}
              title="等这一轮完全跑完再送到，不打扰它手上的活"
            />
          </Show>
          <ActionButton
            label={busy() ? "插话" : "发送"}
            keys={keyHint("composer.send")}
            tone="primary"
            disabled={!canSend() || disabled()}
            onClick={() => submit("steer")}
            title={busy() ? "当前这步工具结束后就送到，它会马上看" : undefined}
          />
        </div>
      </div>
    </div>
  );
}

function ActionButton(props: { label: string; keys: string; tone: "primary" | "quiet" | "danger"; disabled?: boolean; title?: string | undefined; onClick: () => void }) {
  return (
    <button
      class="h-7 pl-3 pr-2 rounded-md text-xs flex items-center gap-2 disabled:opacity-30"
      classList={{
        "bg-ink text-paper font-medium hover:brightness-110": props.tone === "primary",
        "text-ink-2 hover:text-ink hover:bg-paper-3": props.tone === "quiet",
        "text-danger hover:bg-danger-soft": props.tone === "danger",
      }}
      disabled={props.disabled}
      title={props.title}
      onClick={props.onClick}
    >
      <span>{props.label}</span>
      <kbd class="font-sans text-[10px] leading-4 px-1 rounded border" classList={{ "border-paper/30 text-paper/70": props.tone === "primary", "border-line-2 text-ink-3": props.tone !== "primary" }}>
        {props.keys}
      </kbd>
    </button>
  );
}
