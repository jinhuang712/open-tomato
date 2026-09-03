import type { DocKindId, SearchHit } from "@opentomato/core/protocol";
import { createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show } from "solid-js";
import { bridge } from "../bridge";
import { actions, errText, setState, state, toast } from "../state";

const ORDER: DocKindId[] = ["characters", "world", "threads", "milestones", "volumes", "chapters", "manuscript", "guide"];

/** 把命中的查询词高亮成 <mark>，只做纯文本层面的替换 */
function highlight(text: string, q: string): string {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const needles = [...new Set([q, ...q.split(/\s+/)].map((s) => s.trim()).filter((s) => s.length > 0))].sort((a, b) => b.length - a.length);
  let html = esc(text);
  for (const n of needles) {
    const re = new RegExp(esc(n).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    html = html.replace(re, (m) => `<mark>${m}</mark>`);
  }
  return html;
}

export function SearchPalette() {
  const [q, setQ] = createSignal("");
  const [hits, setHits] = createSignal<SearchHit[]>([]);
  const [cursor, setCursor] = createSignal(0);
  const [busy, setBusy] = createSignal(false);
  let input: HTMLInputElement | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let seq = 0;

  const close = () => setState("searchOpen", false);
  const kindLabel = (k: DocKindId) => state.kinds.find((x) => x.id === k)?.label ?? k;

  const grouped = createMemo(() => {
    const byKind = new Map<DocKindId, SearchHit[]>();
    for (const h of hits()) byKind.set(h.kind, [...(byKind.get(h.kind) ?? []), h]);
    return ORDER.filter((k) => byKind.has(k)).map((k) => ({ kind: k, items: byKind.get(k)! }));
  });
  /** 扁平顺序，给键盘上下用 */
  const flat = createMemo(() => grouped().flatMap((g) => g.items));

  const run = (query: string) => {
    const mine = ++seq;
    if (!query.trim()) {
      setHits([]);
      return;
    }
    setBusy(true);
    bridge
      .request("search.query", { query, limit: 40 })
      .then((r) => {
        if (mine !== seq) return;
        setHits(r);
        setCursor(0);
      })
      .catch((e) => toast(errText(e), "error"))
      .finally(() => mine === seq && setBusy(false));
  };

  createEffect(
    on(q, (value) => {
      clearTimeout(timer);
      timer = setTimeout(() => run(value), 120);
    }),
  );
  onCleanup(() => clearTimeout(timer));
  onMount(() => input?.focus());

  const open = (h: SearchHit) => {
    actions.openDoc(h.kind, h.id);
    close();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") return close();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(flat().length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter") {
      const h = flat()[cursor()];
      if (h) open(h);
    }
  };

  createEffect(
    on(cursor, (c) => {
      document.querySelector(`[data-hit="${c}"]`)?.scrollIntoView({ block: "nearest" });
    }),
  );

  return (
    <div class="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/30" onClick={close}>
      <div class="w-[680px] max-h-[70vh] rounded-2xl bg-paper border border-line shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div class="flex items-center gap-3 px-4 py-3 border-b border-line">
          <span class="text-ink-3">⌕</span>
          <input
            ref={input}
            class="flex-1 bg-transparent outline-none text-lg"
            placeholder="搜人物、设定、线索、章节、正文…"
            value={q()}
            onInput={(e) => setQ(e.currentTarget.value)}
            onKeyDown={onKey}
          />
          <Show when={busy()}>
            <span class="text-ink-3 text-xs shimmer">检索中</span>
          </Show>
          <kbd class="text-xs text-ink-3 border border-line rounded px-1">esc</kbd>
        </div>
        <div class="overflow-y-auto">
          <Show when={q().trim() && !busy() && hits().length === 0}>
            <div class="px-4 py-8 text-center text-ink-3">没有和「{q()}」相关的内容</div>
          </Show>
          <Show when={!q().trim()}>
            <div class="px-4 py-8 text-center text-ink-3 text-xs">
              按相关度全文检索，不只是字面匹配。
              <br />
              ↑↓ 选择，↩ 打开，⌘P 随时呼出
            </div>
          </Show>
          <For each={grouped()}>
            {(g) => (
              <div class="py-1">
                <div class="px-4 pt-2 pb-1 text-xs uppercase tracking-wider text-ink-3 flex items-center gap-2">
                  <span>{kindLabel(g.kind)}</span>
                  <span class="text-ink-3/70">{g.items.length}</span>
                  <span class="flex-1 border-t border-line" />
                </div>
                <For each={g.items}>
                  {(h) => {
                    const index = () => flat().indexOf(h);
                    return (
                      <button
                        data-hit={index()}
                        class={`w-full text-left px-4 py-2 flex flex-col gap-0.5 ${cursor() === index() ? "bg-paper-3" : "hover:bg-paper-2"}`}
                        onMouseEnter={() => setCursor(index())}
                        onClick={() => open(h)}
                      >
                        <span class="flex items-center gap-2">
                          <span class="font-medium" innerHTML={highlight(h.title, q())} />
                          <span class="text-xs text-ink-3">{h.id}</span>
                          <Show when={h.section}>
                            <span class="text-xs text-ink-3">§ {h.section}</span>
                          </Show>
                        </span>
                        <span class="text-xs text-ink-2 line-clamp-2 search-snippet" innerHTML={highlight(h.snippet || h.summary, q())} />
                      </button>
                    );
                  }}
                </For>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}
