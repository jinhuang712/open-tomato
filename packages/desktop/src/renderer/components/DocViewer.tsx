import { ISSUE_LEVEL_LABEL } from "@opentomato/core/protocol";
import type { DocContent, DocHeader, DocKindId } from "@opentomato/core/protocol";
import { createEffect, createResource, createSignal, For, on, Show } from "solid-js";
import { bridge } from "../bridge";
import { refId } from "../refid";
import { renderMarkdown } from "../markdown";
import { actions, errText, setState, state, toast } from "../state";

export function DocViewer(props: { kind: DocKindId; id: string }) {
  const [doc, { refetch }] = createResource(
    () => ({ kind: props.kind, id: props.id, tick: state.docs.length }),
    async ({ kind, id }) => bridge.request("doc.read", { kind, id }),
  );
  const [editing, setEditing] = createSignal(false);
  const [draft, setDraft] = createSignal("");
  /** 点"编辑"那一刻磁盘上的版本；保存时带回去，期间被 agent 改过就报 stale，不静默盖 */
  const [base, setBase] = createSignal<string | null>(null);
  const kindLabel = () => state.kinds.find((k) => k.id === props.kind)?.label ?? props.kind;
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

  const startEdit = (d: DocContent) => {
    setDraft(d.raw);
    setBase(d.raw);
    setEditing(true);
  };
  const save = async () => {
    try {
      const b = base();
      await bridge.request("doc.write", b === null ? { kind: props.kind, id: props.id, raw: draft() } : { kind: props.kind, id: props.id, raw: draft(), expectBefore: b });
      setEditing(false);
      setBase(null);
      toast("已保存");
    } catch (e) {
      const msg = errText(e);
      if (msg.includes("审批期间被改过") || msg.includes("StaleWriteError")) {
        // agent 在你编辑期间落盘了：不关编辑器、不丢草稿，基准换成最新，等你合完再存
        await refetch();
        const latest = doc();
        if (latest) setBase(latest.raw);
        toast("这篇在你编辑期间被改过（可能是 agent 刚写入）。再点保存将覆盖对方版本；要合并先复制你的改动，取消后对照最新版重改", "error");
      } else {
        toast(msg, "error");
      }
    }
  };

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
        <span class="flex-1" />
        <Show when={doc()}>
          {(d) => (
            <>
              <button class="text-ink-2 hover:text-ink" onClick={() => void bridge.openPath(`${state.project?.root}/${d().path}`)}>
                用外部编辑器打开
              </button>
              <Show
                when={editing()}
                fallback={
                  <button class="px-2.5 py-1 rounded-md border border-line hover:bg-paper-3" onClick={() => startEdit(d())}>
                    编辑
                  </button>
                }
              >
                <button class="px-2.5 py-1 rounded-md bg-ink text-paper" onClick={() => void save()}>
                  保存
                </button>
                <button class="px-2.5 py-1 rounded-md border border-line" onClick={() => setEditing(false)}>
                  取消
                </button>
              </Show>
            </>
          )}
        </Show>
      </div>
      <Show when={issues().length > 0}>
        <div class="px-5 py-2 bg-warn-soft/50 border-b border-line text-xs space-y-0.5">
          <For each={issues()}>
            {(i) => (
              <div class={`flex items-baseline gap-2 ${i.level === "error" ? "text-danger" : "text-warn"}`}>
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
      <div class="flex-1 overflow-y-auto">
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
                <div class="max-w-3xl mx-auto px-8 py-6">
                  <h1 class="font-serif text-xl mb-1">{d().title}</h1>
                  <div class="text-ink-2 mb-1">{d().summary}</div>
                  <div class="flex flex-wrap gap-1.5 mb-5 text-xs">
                    <span class="px-1.5 rounded bg-paper-3 text-ink-2">{d().status}</span>
                    <For each={d().keywords}>{(k) => <span class="px-1.5 rounded bg-paper-3 text-ink-2">{k}</span>}</For>
                    <For each={Object.entries(d().extra)}>
                      {([k, v]) => (
                        <span class="px-1.5 rounded bg-paper-2 text-ink-3">
                          {k}={typeof v === "string" ? v : JSON.stringify(v)}
                        </span>
                      )}
                    </For>
                  </div>
                  <div class={`prose-zh ${props.kind === "manuscript" ? "font-serif text-lg leading-8" : ""}`} innerHTML={renderMarkdown(d().body)} />
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
              <textarea
                class="w-full h-full p-6 bg-paper font-mono text-xs leading-relaxed outline-none resize-none"
                value={draft()}
                onInput={(e) => setDraft(e.currentTarget.value)}
                onKeyDown={(e) => {
                  // 编辑态里 Escape 只退出编辑，不连文档一起关；全局 Escape 看到 defaultPrevented 就让路
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setEditing(false);
                  }
                }}
                spellcheck={false}
              />
            </Show>
          )}
        </Show>
      </div>
    </div>
  );
}
