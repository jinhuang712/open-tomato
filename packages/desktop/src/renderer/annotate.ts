/**
 * 批注的定位：正文是整块 innerHTML，没有段落 DOM 可锚，只能按被引的文字在渲染结果里找。
 * 找到就用 CSS Highlight 标亮（不改 DOM），再把它滚到容器上三分之一处。
 * 找不到说明这段已经被改过，调用方据此把批注撤掉。
 */

const HIGHLIGHT_NAME = "annot";

interface HighlightRegistry {
  set(name: string, h: unknown): void;
  delete(name: string): void;
}
const registry = (): HighlightRegistry | null => {
  const css = (globalThis as { CSS?: { highlights?: HighlightRegistry } }).CSS;
  return css?.highlights ?? null;
};
const HighlightCtor = (globalThis as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;

/** 在 root 的文本里找 text，返回 Range；空白差异容忍 */
export function findTextRange(root: HTMLElement, text: string): Range | null {
  const needle = text.replace(/\s+/g, " ").trim();
  if (!needle) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  const starts: number[] = [];
  let hay = "";
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    nodes.push(n);
    starts.push(hay.length);
    hay += n.data;
  }
  // 把 hay 的空白也折成单空格，同时记住折叠后每个字符对应的原始下标
  const map: number[] = [];
  let folded = "";
  let lastSpace = false;
  for (let i = 0; i < hay.length; i++) {
    const ch = hay[i]!;
    if (/\s/.test(ch)) {
      if (lastSpace) continue;
      lastSpace = true;
      folded += " ";
    } else {
      lastSpace = false;
      folded += ch;
    }
    map.push(i);
  }
  const at = folded.indexOf(needle);
  if (at < 0) return null;
  const from = map[at]!;
  const to = map[at + needle.length - 1]! + 1;
  const locate = (offset: number, end: boolean) => {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const s = starts[i]!;
      if (offset > s || (offset === s && (!end || i === 0))) return { node: nodes[i]!, off: offset - s };
    }
    return { node: nodes[0]!, off: 0 };
  };
  const a = locate(from, false);
  const b = locate(to, true);
  const range = document.createRange();
  range.setStart(a.node, Math.min(a.off, a.node.data.length));
  range.setEnd(b.node, Math.min(b.off, b.node.data.length));
  return range;
}

/** 标亮并滚到这段；返回是否找到 */
export function focusText(root: HTMLElement, scroller: HTMLElement, text: string): boolean {
  const range = findTextRange(root, text);
  clearFocus();
  if (!range) return false;
  const reg = registry();
  if (reg && HighlightCtor) reg.set(HIGHLIGHT_NAME, new HighlightCtor(range));
  const top = range.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
  scroller.scrollTo({ top: Math.max(0, top - scroller.clientHeight / 3), behavior: "smooth" });
  return true;
}

export function clearFocus() {
  registry()?.delete(HIGHLIGHT_NAME);
}

/** 这段文字还在不在渲染结果里：批注的寿命判据 */
export function hasText(root: HTMLElement, text: string): boolean {
  return findTextRange(root, text) !== null;
}
