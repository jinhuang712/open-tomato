import { diffChars } from "diff";
import { marked } from "marked";
import { createMemo, For, Show } from "solid-js";

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

// 私用区字符当标记，先混进 markdown 源文本，渲染完再换成 <ins>/<del>
const INS_OPEN = "";
const INS_CLOSE = "";
const DEL_OPEN = "";
const DEL_CLOSE = "";
const MARKS = /[-]/g;
// 标记落在行首会挡住 markdown 语法（## / - / 1. / >），把它挪到语法后面
const LINE_PREFIX = /^([-]+)((?:#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s+)+)/gm;

/** 把 diff 结果合成一份带标记的 markdown 源文本 */
function mergedSource(before: string, after: string, isNew: boolean): string {
  if (isNew) return `${INS_OPEN}${after}${INS_CLOSE}`;
  const out: string[] = [];
  for (const p of diffChars(before, after)) {
    if (p.added) out.push(INS_OPEN, p.value, INS_CLOSE);
    else if (p.removed) out.push(DEL_OPEN, p.value, DEL_CLOSE);
    else out.push(p.value);
  }
  return out.join("").replace(LINE_PREFIX, "$2$1");
}

/**
 * 渲染后把标记换成标签。标记可能跨过块级边界（一段插入横跨两个段落），
 * 所以按「标签之间的文本片段」逐段处理，每段自己开合，保证 HTML 平衡。
 */
function applyMarks(html: string): string {
  let open: "ins" | "del" | null = null;
  return html
    .split(/(<[^>]+>)/g)
    .map((chunk) => {
      if (chunk.startsWith("<")) return chunk.replace(MARKS, "");
      if (!chunk) return chunk;
      let out = open ? `<${open} class="tc-${open}">` : "";
      for (const ch of chunk) {
        if (ch === INS_OPEN || ch === DEL_OPEN) {
          if (open) out += `</${open}>`;
          open = ch === INS_OPEN ? "ins" : "del";
          out += `<${open} class="tc-${open}">`;
        } else if (ch === INS_CLOSE || ch === DEL_CLOSE) {
          if (open) out += `</${open}>`;
          open = null;
        } else {
          out += ch;
        }
      }
      if (open) out += `</${open}>`;
      return out;
    })
    .join("")
    // 跨块级边界时会产生只包着换行的空标签，去掉
    .replace(/<(ins|del)[^>]*>\s*<\/\1>/g, "");
}

/**
 * Word / Docs 式的审阅视图：整篇按 markdown 渲染，删的划掉，加的带下划线。
 */
export function TrackChanges(props: { before: string; after: string; isNew: boolean }) {
  const before = createMemo(() => splitDoc(props.before));
  const after = createMemo(() => splitDoc(props.after));

  const metaChanges = createMemo(() => {
    const keys = [...new Set([...Object.keys(before().meta), ...Object.keys(after().meta)])];
    return keys
      .map((k) => ({ key: k, from: before().meta[k], to: after().meta[k] }))
      .filter((c) => c.from !== c.to);
  });

  const html = createMemo(() => {
    const src = mergedSource(before().body, after().body, props.isNew);
    return applyMarks(marked.parse(src, { async: false }) as string);
  });
  const changed = () => before().body !== after().body;

  return (
    <div class="selectable">
      <Show when={metaChanges().length > 0}>
        <div class="mb-5 rounded-lg border border-line bg-paper-2 px-4 py-2.5 text-[12.5px]">
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

      <Show when={!changed() && metaChanges().length === 0}>
        <div class="text-ink-3 text-center py-6">内容没有变化</div>
      </Show>

      <div class="prose-zh tc-doc font-serif text-[15px]" innerHTML={html()} />
    </div>
  );
}
