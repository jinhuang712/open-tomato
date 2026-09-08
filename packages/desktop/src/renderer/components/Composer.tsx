import { PROSE_REJECT_WORDS, quoteBlock, splitQuotes, STUB_PATTERN, stubPrompt } from "@opentomato/core/protocol";
import { inlineAttachments } from "../attachments";
import { createEffect, createSignal, For, on, Show } from "solid-js";
import { keyHint } from "../../shared/keymap";
import { autoGrow } from "../autogrow";
import { bridge } from "../bridge";
import { actions, quoteLabel, setState, state, type ComposerQuote } from "../state";
import { QuoteCard } from "./QuoteCard";
import { railRoom } from "./QuoteRail";

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

/** 排队条里的一行预览：去掉桩标记，引用只留一个 ❝ 加正文 */
function queuePreview(text: string): string {
  const { quotes, rest } = splitQuotes(text.replace(STUB_PATTERN, ""));
  return quotes.length ? `❝ ${rest || quotes[0]!.text}` : rest;
}

/**
 * 输入框。agent 空闲时是「发送」；跑着的时候是「排队」：进它的收件箱，这轮做完一并看，没人打断它手上那一件。
 * 还没送到的话列在输入框上方，分两组，标题一律以时机开头：「这步做完就送」和「这轮做完再送」。
 * 一条话只有两种命运 —— 等它，或者「打断它」（交给 pi，这步工具结束就送，交出去撤不回，所以那一组没有操作）。
 * 不想发了点「取消」：这条不发了，不落回输入框，也没有撤销。这里只列作者自己的话 —— 内核合成的桩（暂停 / 继续）和子 agent 交回的报告都不进这个列表。
 * hold 住时（暂停 / 停止之后）标题变「等你再开口才送」，因为轮末真的不去取件。
 * 暂停 / 停止在会话区顶上，不在这儿。
 * 作者圈出来的段落不占框内的地方：引文贴在它指的那段字旁边（QuoteRail），框内顶部只留一个小 ref，随下一条消息一起发出。
 * 旁边放不下（窗口窄）时那张卡回到框内顶部 —— 引文总得有个地方看。
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
  const dropQuote = (id: string) => actions.dropQuote(id);
  // 发送后清空要把高度收回去
  createEffect(() => {
    text();
    if (box) autoGrow(box);
  });
  const agentId = () => props.agentId ?? "director";
  const isLead = () => agentId() === "director";
  const agent = () => state.agents[agentId()];
  const busy = () => agent()?.status === "running";
  const gone = () => !isLead() && agent()?.status === "error";
  const sealed = () => !isLead() && agent()?.status === "archived";
  const resting = () => !isLead() && agent()?.status === "done";
  // 候选阶段方向还没定，作者的意见要经主编汇总成一问再拍板，不直接和子 agent 对；拍板后（commit）它在孵化具体的东西，直接说就行
  const proposing = () => !isLead() && agent()?.mode === "propose";
  const noModel = () => !state.models?.current;
  const disabled = () => noModel() || gone() || sealed() || proposing();
  const pending = () => state.queues[agentId()] ?? [];
  /** 已经交给 pi 的：等这步工具做完就送，撤不回，所以这一组没有操作 */
  const handed = () => pending().filter((m) => m.inserted);
  /** 还在我们自己收件箱里的：能单条打断、能单条取消 */
  const mine = () => pending().filter((m) => !m.inserted);
  const held = () => Boolean(state.queueHold[agentId()]);

  const placeholder = () => {
    if (noModel()) return "先在右上角选一个模型并填 API key";
    if (gone()) return `${agent()?.label ?? "子 agent"} 出错退场了，这段对话只能看`;
    if (sealed()) return `${agent()?.label ?? "子 agent"} 已封存，这段对话只能看`;
    if (proposing()) return `${agent()?.label ?? "子 agent"}在出候选，方向还没定；想说的和主编说，拍板后再直接和它聊`;
    if (resting()) return `接着和${agent()?.label ?? "子 agent"}聊，比如挑一个候选让它往下孵化`;
    if (busy()) return `${isLead() ? "主编" : (agent()?.label ?? "子 agent")}在忙。发出去等这轮做完再送，等不了就「打断它」`;
    if (quotes().length) return "对这段说点什么";
    if (attachments().length) return "这些材料想让主编怎么用";
    return "和主编说话";
  };

  // 引用按围栏排在正文前面：主编一眼看出作者在对哪段说话，气泡里也能拆回引用卡
  const canSend = () => Boolean(text().trim()) || quotes().length > 0 || attachments().length > 0;
  const submit = (deliverAs: "steer" | "followUp") => {
    if (!canSend() || disabled()) return;
    // 圈的是材料：整条消息变成一条批注，对话里只留桩，主编收到引文加作者的话
    const annotation = actions.makeAnnotation(quotes(), text().trim());
    const blocks = quotes()
      .filter((q) => !q.source)
      .map((q) => quoteBlock(quoteLabel(q), q.text));
    const t = annotation
      ? stubPrompt(annotation.label, [annotation.body, ...blocks, ...inlineAttachments(attachments())].filter(Boolean).join("\n\n"))
      : [...blocks, text().trim(), ...inlineAttachments(attachments())].filter(Boolean).join("\n\n");
    setText("");
    setAttachments([]);
    setState("composerQuotes", []);
    void actions.send(t, agentId(), deliverAs);
  };

  return (
    <div class="px-5 pb-4 pt-1">
      <Show when={pending().length > 0}>
        <div class="mb-2 px-1 flex flex-col gap-2 text-xs">
          <Show when={handed().length > 0}>
            <div class="flex flex-col gap-1">
              <div class="text-accent tracking-wide">这步做完就送 · 打断过的，撤不回了</div>
              <For each={handed()}>
                {(m) => (
                  <div class="flex items-baseline gap-2.5 min-w-0">
                    <Show when={m.label}>
                      <span class="shrink-0 text-ink-3">{m.label}</span>
                    </Show>
                    <span class="flex-1 min-w-0 truncate text-ink-2">{queuePreview(m.text)}</span>
                  </div>
                )}
              </For>
            </div>
          </Show>
          <Show when={mine().length > 0}>
            <div class="flex flex-col gap-1" classList={{ "pt-2 border-t border-line": handed().length > 0 }}>
              <div class="text-ink-3 tracking-wide">{held() ? "等你再开口才送" : "这轮做完再送"}</div>
              {/* 暂停把 hold 置上，轮末就不取件了。这句得说，否则作者以为排队的话会自己送出去 */}
              <Show when={held()}>
                <div class="text-warn">暂停期间这几条不会自动送出。你一开口 —— 说话或点「打断它」—— 就解除暂停，它接着跑。</div>
              </Show>
              <For each={mine()}>
                {(m) => (
                  <div class="flex items-baseline gap-2.5 min-w-0">
                    <Show when={m.label}>
                      <span class="shrink-0 text-ink-3">{m.label}</span>
                    </Show>
                    <span class="flex-1 min-w-0 truncate text-ink">{queuePreview(m.text)}</span>
                    <button
                      class="shrink-0 text-ink-3 hover:text-ink"
                      title="别等这轮了：当前这步工具结束后就送到，送出去就撤不回"
                      onClick={() => void actions.insertQueued(m.id, agentId())}
                    >
                      打断它
                    </button>
                    <button
                      class="shrink-0 text-ink-3 hover:text-ink"
                      title="这条不发了，也不落回输入框"
                      onClick={() => void actions.cancelQueued(m.id, agentId())}
                    >
                      取消
                    </button>
                  </div>
                )}
              </For>
            </div>
          </Show>
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
            {/* 引文本体贴在它指的那段字旁边（QuoteRail），输入框只留一个小 ref；旁边放不下时整张卡还是留在这儿 */}
            <Show
              when={railRoom()}
              fallback={<For each={quotes()}>{(q) => <QuoteCard from={quoteLabel(q)} text={q.text} clamp onRemove={() => dropQuote(q.id)} />}</For>}
            >
              <div class="flex flex-wrap gap-1.5">
                <For each={quotes()}>{(q) => <QuoteRef quote={q} onRemove={() => dropQuote(q.id)} />}</For>
              </div>
            </Show>
            {/* 圈的是正文时给词汇表：说不出哪里不对的人也能选一个，点了填进输入框，还能接着写 */}
            <Show when={quotes().some((q) => q.source?.path.startsWith("正文/"))}>
              <div class="flex flex-wrap gap-1 pl-3">
                <For each={PROSE_REJECT_WORDS}>
                  {(w) => (
                    <button
                      class={`px-2 py-0.5 rounded border text-xs ${text().includes(w) ? "border-accent bg-accent-soft text-ink" : "border-line text-ink-3 hover:text-ink"}`}
                      onClick={() => setText((t) => (t.includes(w) ? t : [t.trim(), w].filter(Boolean).join(" ")))}
                    >
                      {w}
                    </button>
                  )}
                </For>
              </div>
            </Show>
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
          class="w-full min-h-14 bg-transparent px-4 pt-3 pb-1 outline-none resize-none text-sm placeholder:text-ink-3"
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
              // 跑着时默认排队；⇧ 是插话
              submit(busy() && !e.shiftKey ? "followUp" : "steer");
            } else if ((e.key === "." || e.key === ">") && busy()) {
              e.preventDefault();
              if (e.shiftKey || state.pausePending[agentId()]) void actions.stop(agentId());
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
          {/* 打断这条路以前只有快捷键，等于只有知道的人能用；忙的时候露成按钮 */}
          <Show when={busy()}>
            <ActionButton
              label="打断它"
              keys={keyHint("composer.insert")}
              tone="quiet"
              disabled={!canSend() || disabled()}
              onClick={() => submit("steer")}
              title="不排队：当前这步工具结束后就送到，送出去就撤不回"
            />
          </Show>
          <ActionButton
            label={busy() ? "排队" : "发送"}
            keys={keyHint("composer.send")}
            tone="primary"
            disabled={!canSend() || disabled()}
            onClick={() => submit(busy() ? "followUp" : "steer")}
            title={busy() ? "进它的收件箱，这轮做完一并看" : undefined}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * 输入框里的小 ref：只说「你在对哪段说话」，引文本体在旁边那张卡上。
 * 圈的是材料时点一下跳回原处 —— 那张卡在材料页，不在眼前。
 */
function QuoteRef(props: { quote: ComposerQuote; onRemove: () => void }) {
  const line = () => props.quote.text.replace(/\s+/g, " ").trim();
  const src = () => props.quote.source;
  const label = () => quoteLabel(props.quote);
  return (
    <span class="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-md border border-line-2 bg-paper text-xs text-ink-2" title={`${label()}：${line()}`}>
      <span class="font-serif text-ink-3 leading-none translate-y-px">❝</span>
      <Show when={src()} fallback={<span class="max-w-[12rem] truncate">{line()}</span>}>
        {(s) => (
          <button class="max-w-[12rem] truncate hover:text-ink" title={`回到 ${s().path} 看这段`} onClick={() => actions.openDoc(s().kind, s().id, props.quote.text)}>
            {line()}
          </button>
        )}
      </Show>
      <button class="shrink-0 w-4 h-4 rounded text-ink-3 hover:text-ink hover:bg-paper-3" title="去掉这段引用" onClick={props.onRemove}>
        ×
      </button>
    </span>
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
