import { diffChars } from "diff";
import { createMemo, createSignal, For, Show } from "solid-js";

/** 拆 frontmatter：和内核同一套约定（--- 包裹的 YAML），这里只需要按行取 key: value */
function splitDoc(raw: string): { meta: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of (m[1] ?? "").split(/\r?\n/)) {
    const kv = /^([^:#\s][^:]*):\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]!.trim()] = kv[2]!.trim();
  }
  return { meta, body: (m[2] ?? "").replace(/^\r?\n/, "") };
}

const META_LABELS: Record<string, string> = {
  title: "标题",
  summary: "摘要",
  keywords: "关键词",
  status: "状态",
};

const COLLAPSE_OVER = 420;
const KEEP_EDGE = 140;

type Segment = { kind: "same" | "add" | "del"; text: string };

/**
 * Word / Docs 式的审阅视图：整篇文档铺开，删的划掉，加的带底色。
 * 长段没改动的中间折起来，点一下展开。
 */
export function TrackChanges(props: { before: string; after: string; isNew: boolean }) {
  const [expanded, setExpanded] = createSignal<Set<number>>(new Set());
  const before = createMemo(() => splitDoc(props.before));
  const after = createMemo(() => splitDoc(props.after));

  const metaChanges = createMemo(() => {
    const keys = [...new Set([...Object.keys(before().meta), ...Object.keys(after().meta)])];
    return keys
      .map((k) => ({ key: k, from: before().meta[k], to: after().meta[k] }))
      .filter((c) => c.from !== c.to);
  });

  const segments = createMemo<Segment[]>(() => {
    if (props.isNew) return [{ kind: "add", text: after().body }];
    return diffChars(before().body, after().body).map((p) => ({
      kind: p.added ? "add" : p.removed ? "del" : "same",
      text: p.value,
    }));
  });

  const changeCount = () => segments().filter((s) => s.kind !== "same").length;

  const toggle = (i: number) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  return (
    <div class="selectable">
      <Show when={metaChanges().length > 0}>
        <div class="mb-4 rounded-lg border border-line bg-paper-2 px-4 py-2.5 text-[12.5px]">
          <div class="text-ink-3 text-[11px] mb-1.5">头信息</div>
          <For each={metaChanges()}>
            {(c) => (
              <div class="flex gap-3 py-0.5">
                <span class="w-16 shrink-0 text-ink-3">{META_LABELS[c.key] ?? c.key}</span>
                <span class="min-w-0">
                  <Show when={c.from !== undefined}>
                    <del class="tc-del">{c.from || "（空）"}</del>
                  </Show>
                  <Show when={c.from !== undefined && c.to !== undefined}>
                    <span class="text-ink-3 mx-1.5">→</span>
                  </Show>
                  <Show when={c.to !== undefined}>
                    <ins class="tc-ins">{c.to || "（空）"}</ins>
                  </Show>
                </span>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={changeCount() === 0 && metaChanges().length === 0}>
        <div class="text-ink-3 text-center py-6">内容没有变化</div>
      </Show>

      <div class="font-serif text-[15px] leading-8 whitespace-pre-wrap break-words">
        <For each={segments()}>
          {(seg, i) => {
            if (seg.kind === "add") return <ins class="tc-ins">{seg.text}</ins>;
            if (seg.kind === "del") return <del class="tc-del">{seg.text}</del>;
            const long = seg.text.length > COLLAPSE_OVER && i() !== 0 && i() !== segments().length - 1;
            if (!long || expanded().has(i())) return <span>{seg.text}</span>;
            const hidden = seg.text.length - KEEP_EDGE * 2;
            return (
              <>
                <span>{seg.text.slice(0, KEEP_EDGE)}</span>
                <button class="tc-fold" onClick={() => toggle(i())} title="展开未改动的部分">
                  … 未改动 {hidden} 字 …
                </button>
                <span>{seg.text.slice(-KEEP_EDGE)}</span>
              </>
            );
          }}
        </For>
      </div>
    </div>
  );
}
