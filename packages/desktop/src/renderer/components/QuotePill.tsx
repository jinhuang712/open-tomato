import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { setState } from "../state";

interface Hit {
  x: number;
  y: number;
  text: string;
  role: "user" | "assistant";
}

/**
 * 作者在消息区划过一段字，选区末尾上方浮出「批注」。
 * 点下去这段字就进输入框上方的引用条，等作者对着它说话。
 * 只挂在主编会话：子 agent 不面向作者说话，也就没有被批注的资格。
 */
export function QuotePill(props: { within: () => HTMLElement | undefined }) {
  const [hit, setHit] = createSignal<Hit | null>(null);
  let pill: HTMLButtonElement | undefined;

  const read = (): Hit | null => {
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    const node = range.commonAncestorContainer;
    const el = node instanceof Element ? node : node.parentElement;
    // 跨消息的选区 closest 落不到单条消息上，直接不理
    const host = el?.closest<HTMLElement>("[data-role]");
    const root = props.within();
    if (!host || !root || !root.contains(host)) return null;
    const role = host.dataset.role;
    if (role !== "user" && role !== "assistant") return null;
    const text = sel.toString().replace(/\n{3,}/g, "\n\n").trim();
    if (!text) return null;
    const rects = Array.from(range.getClientRects());
    // 单行贴在末尾上方；多行贴在首行末尾，离作者松手的地方近
    const anchor = (rects.length > 1 ? rects[0] : rects[rects.length - 1]) ?? range.getBoundingClientRect();
    return { x: anchor.right, y: anchor.top, text, role };
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
    setState("composerQuotes", (qs) => [...qs, { id: crypto.randomUUID(), role: h.role, text: h.text }]);
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
          title="把这段放进输入框，对着它说话"
        >
          <span class="font-serif text-sm leading-none translate-y-px">❝</span>
          批注
        </button>
      )}
    </Show>
  );
}
