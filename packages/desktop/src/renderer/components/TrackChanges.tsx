import { diffArrays, diffChars } from "diff";
import { marked } from "marked";
import { createMemo, For, Show } from "solid-js";
import { sanitizeHtml } from "../markdown";

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

/** 一段里改动不大（相同字符占比 ≥ 该值）才做字内标记，否则整段旧的划掉、新的另起一行 */
const INLINE_SIMILARITY = 0.55;

function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  let same = 0;
  for (const p of diffChars(a, b)) if (!p.added && !p.removed) same += p.value.length;
  return (2 * same) / (a.length + b.length);
}

/** 段内字级标记：合成一份带标记的 markdown 源文本 */
function inlineMarked(before: string, after: string): string {
  const out: string[] = [];
  for (const p of diffChars(before, after)) {
    if (p.added) out.push(INS_OPEN, p.value, INS_CLOSE);
    else if (p.removed) out.push(DEL_OPEN, p.value, DEL_CLOSE);
    else out.push(p.value);
  }
  return out.join("").replace(LINE_PREFIX, "$2$1");
}

const render = (md: string) => marked.parse(md, { async: false }) as string;
const blockDel = (md: string) => `<div class="tc-blk tc-blk-del">${render(md)}</div>`;
const blockIns = (md: string) => `<div class="tc-blk tc-blk-ins">${render(md)}</div>`;

const splitBlocks = (body: string) => body.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);

/**
 * 先按段落对齐，再决定每段怎么标：
 * - 没变：正常渲染
 * - 小改：段内字级标记
 * - 大改 / 整段替换：旧段划掉，新段另起一行
 */
function renderTracked(before: string, after: string, isNew: boolean): string {
  if (isNew) return blockIns(after);
  const parts = diffArrays(splitBlocks(before), splitBlocks(after));
  const html: string[] = [];
  let removed: string[] = [];
  const flushRemoved = () => {
    for (const r of removed) html.push(blockDel(r));
    removed = [];
  };
  for (const p of parts) {
    if (p.removed) {
      removed.push(...p.value);
      continue;
    }
    if (p.added) {
      const added = [...p.value];
      // 删一段 + 加一段 挨着出现，按顺序配对
      while (removed.length && added.length) {
        const a = removed.shift()!;
        const b = added.shift()!;
        if (similarity(a, b) >= INLINE_SIMILARITY) html.push(applyMarks(render(inlineMarked(a, b))));
        else html.push(blockDel(a), blockIns(b));
      }
      flushRemoved();
      for (const b of added) html.push(blockIns(b));
      continue;
    }
    flushRemoved();
    for (const v of p.value) html.push(render(v));
  }
  flushRemoved();
  return html.join("\n");
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
 * Word / Docs 式的审阅视图：整篇按 markdown 渲染；小改在字内标，大改整段旧划掉、新另起一行。
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

  const html = createMemo(() => sanitizeHtml(renderTracked(before().body, after().body, props.isNew)));
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
