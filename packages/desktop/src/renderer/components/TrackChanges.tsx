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

/** 关键词是 [a, b] 形式的行内列表，拆成芯片 */
function listOf(v: string | undefined): string[] {
  if (!v) return [];
  const m = /^\[(.*)\]$/.exec(v.trim());
  return (m ? m[1]! : v)
    .split(/[,，]/)
    .map((x) => x.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

/** 头信息里同一个位置的旧值 / 新值：变了就旧的划掉、新的标绿；没变原样 */
function Tracked(props: { from: string | undefined; to: string | undefined; isNew: boolean; class?: string }) {
  const same = () => props.from === props.to;
  return (
    <span class={props.class}>
      <Show when={!same() && props.from}>
        <del class="tc-del">{props.from}</del>
      </Show>
      <Show when={!same() && props.from && props.to}>
        <span class="text-ink-3 mx-1"> </span>
      </Show>
      <Show when={props.to}>
        <Show when={same() && !props.isNew} fallback={<ins class="tc-ins">{props.to}</ins>}>
          {props.to}
        </Show>
      </Show>
    </span>
  );
}

/**
 * 头部和文档阅读页同一个样子：标题、摘要、一排芯片（状态、关键词、其余字段）。
 * 芯片增删按 ins/del 标：删掉的芯片划掉，新加的标绿；改了值的字段旧芯片划掉、新芯片标绿。
 */
function MetaHead(props: { before: Record<string, string>; after: Record<string, string>; isNew: boolean }) {
  const chips = createMemo(() => {
    const b = props.before;
    const a = props.after;
    const out: { text: string; state: "same" | "ins" | "del"; dim: boolean }[] = [];
    const push = (text: string, state: "same" | "ins" | "del", dim = false) => out.push({ text, state: state === "same" && props.isNew ? "ins" : state, dim });
    if (b.status !== a.status) {
      if (b.status) push(b.status, "del");
      if (a.status) push(a.status, "ins");
    } else if (a.status) push(a.status, "same");
    const kb = listOf(b.keywords);
    const ka = listOf(a.keywords);
    for (const k of kb) if (!ka.includes(k)) push(k, "del");
    for (const k of ka) push(k, kb.includes(k) ? "same" : "ins");
    const skip = new Set(["title", "summary", "keywords", "status"]);
    const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => !skip.has(k));
    for (const k of keys) {
      if (b[k] === a[k]) push(`${k}=${a[k]}`, "same", true);
      else {
        if (b[k] !== undefined) push(`${k}=${b[k]}`, "del", true);
        if (a[k] !== undefined) push(`${k}=${a[k]}`, "ins", true);
      }
    }
    return out;
  });
  return (
    <div class="mb-5">
      <h1 class="font-serif text-xl mb-1">
        <Tracked from={props.before.title} to={props.after.title} isNew={props.isNew} />
      </h1>
      <div class="text-ink-2 mb-1">
        <Tracked from={props.before.summary} to={props.after.summary} isNew={props.isNew} />
      </div>
      <div class="flex flex-wrap gap-1.5 text-xs">
        <For each={chips()}>
          {(c) => (
            <span class={`px-1.5 rounded ${c.dim ? "bg-paper-2 text-ink-3" : "bg-paper-3 text-ink-2"}`}>
              <Show when={c.state === "same"} fallback={c.state === "ins" ? <ins class="tc-ins">{c.text}</ins> : <del class="tc-del">{c.text}</del>}>
                {c.text}
              </Show>
            </span>
          )}
        </For>
      </div>
    </div>
  );
}

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
      <Show when={Object.keys(after().meta).length > 0 || Object.keys(before().meta).length > 0}>
        <MetaHead before={before().meta} after={after().meta} isNew={props.isNew} />
      </Show>

      <Show when={!changed() && metaChanges().length === 0}>
        <div class="text-ink-3 text-center py-6">内容没有变化</div>
      </Show>

      <div class="prose-zh tc-doc font-serif text-lg" innerHTML={html()} />
    </div>
  );
}
