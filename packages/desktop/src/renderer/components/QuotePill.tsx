import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { setState, type ComposerQuote, type QuoteSource } from "../state";

interface Hit {
  x: number;
  y: number;
  text: string;
  role?: "user" | "assistant";
  source?: QuoteSource;
  /** 宿主自己写好的引文出处（data-quote-from），比如提问卡的「写法一」 */
  from?: string;
}

/**
 * 作者划过一段字，选区末尾上方浮出「批注」。
 * 点下去这段字就进输入框上方的引用条，等作者对着它说话；宿主给了 onTake 就交给宿主处理。
 * 宿主三种：消息气泡（data-role，圈的是谁说的话）、材料正文（data-quote-src，圈的是哪份稿、哪篇卡）、
 * 自己收引文的卡片（data-quote-from，属性值就是引文那行小字，比如提问卡的「写法一」）。
 * 消息区只挂在主编会话：子 agent 不面向作者说话，也就没有被批注的资格。
 */
export function QuotePill(props: {
  within: () => HTMLElement | undefined;
  /** 宿主自己收引文（审阅弹窗：圈的段直接成拒绝理由的引用）。不给就进主编输入框 */
  onTake?: (text: string, from?: string) => void;
  title?: string;
}) {
  const [hit, setHit] = createSignal<Hit | null>(null);
  let pill: HTMLButtonElement | undefined;

  const read = (): Hit | null => {
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    const node = range.commonAncestorContainer;
    const el = node instanceof Element ? node : node.parentElement;
    // 跨消息的选区 closest 落不到单条消息上，直接不理
    const host = el?.closest<HTMLElement>("[data-role], [data-quote-src], [data-quote-from]");
    const root = props.within();
    if (!host || !root || !root.contains(host)) return null;
    const text = sel.toString().replace(/\n{3,}/g, "\n\n").trim();
    if (!text) return null;
    const rects = Array.from(range.getClientRects());
    // 单行贴在末尾上方；多行贴在首行末尾，离作者松手的地方近
    const anchor = (rects.length > 1 ? rects[0] : rects[rects.length - 1]) ?? range.getBoundingClientRect();
    const at = { x: anchor.right, y: anchor.top, text };
    const from = host.dataset.quoteFrom;
    // 自己收引文的卡片长在消息流里，两颗药丸都罩得住它：只认自己收的那颗，不然同一处冒出两颗
    if (from !== undefined) return props.onTake ? { ...at, from } : null;
    const srcRaw = host.dataset.quoteSrc;
    if (srcRaw) {
      try {
        return { ...at, source: JSON.parse(srcRaw) as QuoteSource };
      } catch {
        return null;
      }
    }
    const role = host.dataset.role;
    if (role !== "user" && role !== "assistant") return null;
    return { ...at, role };
  };

  let raf = 0;
  const refresh = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => setHit(read()));
  };
  const hide = () => setHit(null);
  const onSelectionChange = () => {
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed) hide();
  };

  onMount(() => {
    document.addEventListener("pointerup", refresh);
    document.addEventListener("keyup", refresh);
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    onCleanup(() => {
      cancelAnimationFrame(raf);
      document.removeEventListener("pointerup", refresh);
      document.removeEventListener("keyup", refresh);
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    });
  });

  const take = () => {
    const h = hit();
    if (!h) return;
    if (props.onTake) {
      props.onTake(h.text, h.from);
      document.getSelection()?.removeAllRanges();
      setHit(null);
      return;
    }
    const quote: ComposerQuote = h.source ? { id: crypto.randomUUID(), text: h.text, source: h.source } : { id: crypto.randomUUID(), text: h.text, role: h.role ?? "assistant" };
    setState("composerQuotes", (qs) => [...qs, quote]);
    document.getSelection()?.removeAllRanges();
    setHit(null);
  };

  // 左右夹在视口里，别让药丸被窗口边切掉
  const left = (h: Hit) => Math.min(Math.max(h.x, 48), window.innerWidth - 48);

  return (
    <Show when={hit()}>
      {(h) => (
        <button
          ref={pill}
          class="quote-pill fixed z-30 -translate-x-1/2 -translate-y-full inline-flex items-center gap-1.5 h-7 pl-2 pr-2.5 rounded-full bg-ink text-paper text-xs font-medium shadow-lg hover:brightness-110"
          style={{ left: `${left(h())}px`, top: `${h().y - 8}px` }}
          // mousedown 会先把选区清掉，拦住它让 click 还能读到选区
          onMouseDown={(e) => e.preventDefault()}
          onClick={take}
          title={props.title ?? "把这段放进输入框，对着它说话"}
        >
          <span class="font-serif text-sm leading-none translate-y-px">❝</span>
          批注
        </button>
      )}
    </Show>
  );
}
