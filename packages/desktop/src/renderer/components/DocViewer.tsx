import { ISSUE_LEVEL_LABEL } from "@opentomato/core/protocol";
import type { DocContent, DocHeader, DocKindId } from "@opentomato/core/protocol";
import { createEffect, createResource, createSignal, For, on, onCleanup, onMount, Show } from "solid-js";
import { keyHint } from "../../shared/keymap";
import { clearFocus, focusText, hasText } from "../annotate";
import { bridge } from "../bridge";
import { FIELD_VIEWS, type FieldView } from "../doc-fields";
import { overlayOpen, registerEscape } from "../escape";
import { refId } from "../refid";
import { renderMarkdown } from "../markdown";
import { CardEditor, type CardEditorHandle } from "./CardEditor";
import { LiveBadges } from "./LiveBadges";
import { actions, errText, setState, setView, state, toast, type QuoteSource } from "../state";
import { QuotePill } from "./QuotePill";
import { QuoteRail, type RailNote } from "./QuoteRail";

export function DocViewer(props: { kind: DocKindId; id: string }) {
  const [doc, { refetch }] = createResource(
    () => ({ kind: props.kind, id: props.id, tick: state.docs.length }),
    async ({ kind, id }) => bridge.request("doc.read", { kind, id }),
  );
  const [editing, setEditing] = createSignal(false);
  /** 编辑器里动过没有：没动过的退出不问，动过了才拦一下 */
  const [dirty, setDirty] = createSignal(false);
  /** 正在落盘：⌘S 连按两下不能发两次写入，第二次会撞上自己刚写的版本报 stale */
  const [saving, setSaving] = createSignal(false);
  /** 编辑器交回来的把手：取当前内容、问标题空没空 */
  let card: CardEditorHandle | undefined;
  /** 点"编辑"那一刻磁盘上的版本；保存时带回去，期间被 agent 改过就报 stale，不静默盖 */
  const [base, setBase] = createSignal<string | null>(null);
  const kindLabel = () => state.kinds.find((k) => k.id === props.kind)?.label ?? props.kind;
  /** 预览和编辑用同一套正文排版：进编辑模式时字号行距不该跳 */
  const proseClass = () => `prose-zh ${props.kind === "manuscript" ? "font-serif text-lg leading-8" : ""}`;
  const issues = () => state.issues?.filter((i) => i.kind === props.kind && i.id === props.id) ?? [];
  /** 机检给的修补请求：切到对话、预填进输入框，发不发由作者定 */
  const fixInChat = (text: string) => {
    actions.openChat("director");
    setState("composerDraft", text);
  };
  /**
   * 反查：谁的 frontmatter 引用了这篇。只读现有五条引用边，不新增字段：
   * 章纲 characters / threads / volume，里程碑 threads，卷纲 milestones。引用写的是名字，跟 id 一样按 slug 规则对齐。
   */
  const sortKey = (d: DocHeader) => {
    const n = Number(d.kind === "milestones" ? d.extra.order : d.id);
    return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
  };
  const REFS: { from: DocKindId; field: string; to: DocKindId; label: string }[] = [
    { from: "milestones", field: "threads", to: "threads", label: "挂在这条线上的里程碑" },
    { from: "chapters", field: "threads", to: "threads", label: "推进这条线的章" },
    { from: "chapters", field: "characters", to: "characters", label: "出场的章" },
    { from: "volumes", field: "milestones", to: "milestones", label: "覆盖它的卷" },
    { from: "chapters", field: "volume", to: "volumes", label: "本卷的章" },
  ];
  const backlinks = () => {
    const me = refId(props.id);
    const hits = (v: unknown) => (Array.isArray(v) ? v : [v]).some((t) => typeof t === "string" && refId(t) === me);
    return REFS.filter((r) => r.to === props.kind)
      .map((r) => ({ label: r.label, docs: state.docs.filter((d) => d.kind === r.from && hits(d.extra[r.field])).sort((a, b) => sortKey(a) - sortKey(b)) }))
      .filter((g) => g.docs.length > 0);
  };

  createEffect(
    on(
      () => state.docs,
      () => void refetch(),
      { defer: true },
    ),
  );

  /** 这篇材料上的批注：作者翻材料时圈的段。那段被改掉就没了 */
  let scroller: HTMLDivElement | undefined;
  let prose: HTMLDivElement | undefined;
  const notes = () => state.annotations.filter((n) => n.source.type === "doc" && n.source.kind === props.kind && n.source.id === props.id);
  const quoteSource = (): QuoteSource | null => (doc() ? { type: "doc", kind: props.kind, id: props.id, path: doc()!.path } : null);
  const focusQuote = (q: string) => {
    if (!prose || !scroller) return;
    if (!focusText(prose, scroller, q)) toast("这段已经改过，找不到原处了");
  };
  /** 旁边那一栏：已经发出去的批注一条一张卡，加上还没发出去的引文 */
  const railNotes = (): RailNote[] => [
    ...notes().map((n) => ({ id: n.label, label: n.label, text: n.quotes[0] ?? "", note: n.text || "（只圈了这段，没写话）", onClick: () => focusQuote(n.quotes[0] ?? "") })),
    ...state.composerQuotes
      .filter((q) => q.source?.kind === props.kind && q.source.id === props.id)
      .map((q) => ({ id: q.id, label: "等你说话", text: q.text, onRemove: () => actions.dropQuote(q.id) })),
  ];
  // 正文渲染完：先撤掉引文已经找不到的批注，再看有没有点桩跳回来要标亮的
  createEffect(
    on(
      () => [doc()?.raw, editing()] as const,
      () => {
        requestAnimationFrame(() => {
          if (!prose || editing()) return;
          for (const n of notes()) if (!n.quotes.some((q) => hasText(prose!, q))) actions.dropAnnotation(n.label);
          const v = state.view;
          if (v.type === "doc" && v.focus && v.kind === props.kind && v.id === props.id) {
            setView({ type: "doc", kind: v.kind, id: v.id });
            focusQuote(v.focus);
          }
        });
      },
    ),
  );
  onCleanup(clearFocus);

  const startEdit = (d: DocContent) => {
    setBase(d.raw);
    setDirty(false);
    setEditing(true);
  };
  /** 退出编辑：动过了先问一声，别一个 Esc 把改的都吞了 */
  const stopEdit = async () => {
    if (dirty() && !(await bridge.confirm({ message: "放弃这次编辑？", detail: "刚改的内容不会存进这张卡。", okLabel: "放弃" }))) return;
    setEditing(false);
    setBase(null);
  };
  const save = async () => {
    if (!card || saving()) return;
    const b = base();
    if (b === null) return;
    // 标题是这张卡在侧栏里的身份，空着存下去等于把卡弄丢
    if (card.titleEmpty()) {
      toast("标题不能为空", "error");
      return;
    }
    const raw = card.raw();
    setSaving(true);
    try {
      await bridge.request("doc.write", { kind: props.kind, id: props.id, raw, expectBefore: b });
      setEditing(false);
      setBase(null);
      toast("已保存，主编在复核这次改动");
    } catch (e) {
      const msg = errText(e);
      if (msg.includes("审批期间被改过") || msg.includes("StaleWriteError")) {
        // agent 在你编辑期间落盘了：不关编辑器、不丢草稿，基准换成最新，等你合完再存
        await refetch();
        const latest = doc();
        if (latest) setBase(latest.raw);
        toast("这篇在你编辑期间被改过（可能是 agent 刚写入）。再存一次会用你这版正文盖掉对方的；要合并就先复制自己的改动，退出编辑对照最新版重改", "error");
      } else {
        toast(msg, "error");
      }
    } finally {
      setSaving(false);
    }
  };

  // ⌘E 进编辑、⌘S 存回预览。挂在 document 上：光标在编辑器里也照样收得到
  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.isComposing || overlayOpen()) return;
      const key = e.key.toLowerCase();
      if (key === "e" && !editing()) {
        const d = doc();
        if (!d) return;
        e.preventDefault();
        startEdit(d);
      } else if (key === "s" && editing()) {
        e.preventDefault();
        void save();
      }
    };
    document.addEventListener("keydown", onKey);
    onCleanup(() => document.removeEventListener("keydown", onKey));
  });
  // Escape 先退编辑模式，再由全局那套退回对话
  registerEscape(() => editing() && (void stopEdit(), true));

  return (
    <div class="flex flex-col h-full min-w-0">
      <div class="flex items-center gap-2 px-5 py-2 border-b border-line bg-paper-2 text-xs">
        <button class="text-ink-2 hover:text-ink" onClick={() => actions.openChat("director")}>
          ← 对话
        </button>
        <span class="text-ink-3">|</span>
        <span class="text-ink-3">{kindLabel()}</span>
        <Show when={!state.kinds.find((k) => k.id === props.kind)?.singleton}>
          <span class="text-ink-2">{props.kind === "rules" ? (doc()?.title ?? props.id) : props.id}</span>
        </Show>
        <LiveBadges />
        <span class="flex-1" />
        <Show when={doc()}>
          {(d) => (
            <Show
              when={editing()}
              fallback={
                <button class="px-2.5 py-1 rounded-md border border-line hover:bg-paper-3" title={`编辑这张卡（${keyHint("doc.edit")}）`} onClick={() => startEdit(d())}>
                  编辑
                </button>
              }
            >
              <span class="text-ink-3">编辑中</span>
              <button class="px-2.5 py-1 rounded-md bg-ink text-paper disabled:opacity-60" disabled={saving()} title={`保存并回到预览（${keyHint("doc.save")}）`} onClick={() => void save()}>
                保存
              </button>
              <button class="px-2.5 py-1 rounded-md border border-line" onClick={() => void stopEdit()}>
                取消
              </button>
            </Show>
          )}
        </Show>
      </div>
      <Show when={issues().length > 0}>
        <div class="px-5 py-2 bg-warn-soft/50 border-b border-line text-xs space-y-0.5">
          <For each={issues()}>
            {(i) => (
              <div class={`flex items-baseline gap-2 ${i.level === "error" ? "text-danger" : i.level === "warning" ? "text-warn" : "text-ink-2"}`}>
                <span class="shrink-0 opacity-80">{ISSUE_LEVEL_LABEL[i.level]}</span>
                <span class="flex-1 min-w-0">{i.message}</span>
                <Show when={i.fix}>
                  {(fix) => (
                    <button class="shrink-0 underline underline-offset-2 hover:text-ink" title="跳到对话，把这句填进输入框，你确认后再发" onClick={() => fixInChat(fix())}>
                      去对话里补 →
                    </button>
                  )}
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
      <QuotePill within={() => scroller} />
      <div ref={scroller} class="flex-1 overflow-y-auto [overflow-x:clip]">
        <Show when={doc.loading && !doc()}>
          <div class="p-6 text-ink-3">读取中…</div>
        </Show>
        <Show when={doc.error}>
          <div class="p-6 text-danger">{errText(doc.error)}</div>
        </Show>
        <Show when={doc()}>
          {(d) => (
            <Show
              when={editing()}
              fallback={
                <div class="relative max-w-3xl mx-auto px-8 py-6">
                  <DocHead doc={d()} />
                  <QuoteRail root={() => prose} bounds={() => scroller} notes={railNotes} deps={() => [d().raw, notes().length] as const} />
                  <div
                    ref={prose}
                    data-quote-src={JSON.stringify(quoteSource())}
                    class={proseClass()}
                    innerHTML={renderMarkdown(d().body, { kind: props.kind, id: props.id })}
                  />
                  <Show when={props.kind === "rules" && !d().body.trim()}>
                    <p class="text-sm text-ink-3">还没写「展开」：这条规则管到哪、不管哪、哪些情形容易误伤。跟主编聊一句就会补上。</p>
                  </Show>
                  <Show when={backlinks().length > 0}>
                    <div class="mt-8 pt-4 border-t border-line text-sm space-y-4">
                      <For each={backlinks()}>
                        {(g) => (
                          <div>
                            <div class="text-xs text-ink-3 mb-1">{g.label}</div>
                            <For each={g.docs}>
                              {(m) => (
                                <button class="w-full flex items-baseline gap-2 py-1 text-left text-ink-2 hover:text-ink" onClick={() => actions.openDoc(m.kind, m.id)} title={m.summary}>
                                  <span class="w-8 shrink-0 tabular-nums text-ink-3 text-xs">{Number.isFinite(sortKey(m)) ? sortKey(m) : ""}</span>
                                  <span class="truncate">{m.title}</span>
                                </button>
                              )}
                            </For>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              }
            >
              <div class="max-w-3xl mx-auto px-8 py-6">
                <CardEditor kind={props.kind} raw={base() ?? d().raw} onChange={() => setDirty(true)} onReady={(h) => (card = h)} />
              </div>
            </Show>
          )}
        </Show>
      </div>
    </div>
  );
}

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : typeof v === "string" && v.trim() ? [v] : typeof v === "number" ? [String(v)] : []);

/**
 * 卡片头部：大标题、摘要当导语、一排有含义的胶囊、（守则的）作者原话。
 * 所有类型共用一套版式，只是 extra 字段各按自己的含义读，不再 k=v 平铺。
 */
function DocHead(props: { doc: DocContent }) {
  const views = () => FIELD_VIEWS[props.doc.kind] ?? {};
  const view = (k: string): FieldView => views()[k] ?? {};
  const fields = () => Object.entries(props.doc.extra).filter(([k, v]) => !view(k).hide && !view(k).quote && asList(v).length > 0);
  // 强调胶囊排最前，引用胶囊排最后，中间是普通字段
  const rank = ([k]: [string, unknown]) => (view(k).accent ? 0 : view(k).ref ? 2 : 1);
  const sorted = () => [...fields()].sort((a, b) => rank(a) - rank(b));
  const quote = () => {
    const k = Object.keys(views()).find((k) => view(k).quote);
    const v = k ? props.doc.extra[k] : undefined;
    return typeof v === "string" && v.trim() ? v : "";
  };
  return (
    <div class="mb-6">
      <h1 class="font-serif text-2xl mb-3">{props.doc.title}</h1>
      <Show when={props.doc.summary && props.doc.summary !== props.doc.title}>
        <p class="text-lg leading-8 mb-3 text-ink">{props.doc.summary}</p>
      </Show>
      <div class="flex flex-wrap items-center gap-1.5 text-xs">
        <For each={sorted()}>
          {([k, v]) => {
            const fv = view(k);
            return (
              <For each={asList(v)}>
                {(item) => {
                  const text = `${fv.label ? `${fv.label} ` : ""}${fv.fmt ? fv.fmt(item) : item}`;
                  return (
                    <Show
                      when={fv.ref}
                      fallback={<span class={`px-1.5 py-0.5 rounded ${fv.accent ? "bg-accent-soft text-accent font-medium" : "bg-paper-3 text-ink-2"}`}>{text}</span>}
                    >
                      {(ref) => (
                        <button class="px-1.5 py-0.5 rounded bg-paper-3 text-ink-2 hover:text-ink hover:bg-paper-3/80" title={`打开${item}`} onClick={() => actions.openDoc(ref(), refId(item))}>
                          {text}
                        </button>
                      )}
                    </Show>
                  );
                }}
              </For>
            );
          }}
        </For>
        <Show when={props.doc.status !== "draft"}>
          <span class="px-1.5 py-0.5 rounded bg-paper-2 text-ink-3">{props.doc.status}</span>
        </Show>
        <For each={props.doc.keywords}>{(k) => <span class="px-1.5 py-0.5 rounded bg-paper-2 text-ink-3">{k}</span>}</For>
      </div>
      <Show when={quote()}>
        <blockquote class="mt-4 pl-3 border-l-2 border-line-2 text-sm text-ink-2 leading-6">
          <span class="text-ink-3 mr-1">作者原话</span>
          {quote()}
        </blockquote>
      </Show>
    </div>
  );
}
