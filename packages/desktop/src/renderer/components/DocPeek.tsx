import type { DocKindId } from "@opentomato/core/protocol";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { resolveLegacyRef } from "../doclink";
import { state } from "../state";

const SHOW_DELAY = 350;
const WIDTH = 300;

/**
 * 卡片速览：鼠标在任何 [data-doc] 引用上停一下，就在它下方浮出那张卡的类型、标题、摘要。
 * 只读 state.docs 里已有的头部信息，不发请求；移开、滚动、点击都立刻收起。
 */
export function DocPeek() {
  const [anchor, setAnchor] = createSignal<{ kind: DocKindId; id: string; rect: DOMRect } | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let hovering: HTMLElement | null = null;

  const hide = () => {
    clearTimeout(timer);
    hovering = null;
    setAnchor(null);
  };

  onMount(() => {
    const onOver = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.("[data-doc]") as HTMLElement | null;
      if (!el || el === hovering) return;
      clearTimeout(timer);
      hovering = el;
      const ref = el.dataset.doc ?? "";
      const slash = ref.indexOf("/");
      if (slash < 0) return;
      const dest = resolveLegacyRef(ref.slice(0, slash) as DocKindId, ref.slice(slash + 1));
      timer = setTimeout(() => {
        if (hovering === el) setAnchor({ ...dest, rect: el.getBoundingClientRect() });
      }, SHOW_DELAY);
    };
    const onOut = (e: MouseEvent) => {
      if (!hovering) return;
      const to = e.relatedTarget as Node | null;
      if (to && hovering.contains(to)) return;
      hide();
    };
    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    document.addEventListener("scroll", hide, true);
    document.addEventListener("mousedown", hide, true);
    onCleanup(() => {
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      document.removeEventListener("scroll", hide, true);
      document.removeEventListener("mousedown", hide, true);
      clearTimeout(timer);
    });
  });

  const doc = () => {
    const a = anchor();
    return a ? state.docs.find((d) => d.kind === a.kind && d.id === a.id) : undefined;
  };
  const kindLabel = () => state.kinds.find((k) => k.id === anchor()?.kind)?.label ?? anchor()?.kind ?? "";
  const category = () => {
    const c = doc()?.extra.category;
    return typeof c === "string" ? c : "";
  };
  const pos = () => {
    const r = anchor()!.rect;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - WIDTH - 8));
    // 下面放不下就翻到上面
    const below = r.bottom + 6;
    const flip = below + 140 > window.innerHeight;
    return flip ? { left, bottom: window.innerHeight - r.top + 6 } : { left, top: below };
  };

  return (
    <Show when={doc()}>
      {(d) => (
        <div
          class="fixed z-30 rounded-lg border border-line-2 bg-paper-2 shadow-lg px-3 py-2.5 pointer-events-none"
          style={{
            width: `${WIDTH}px`,
            left: `${pos().left}px`,
            ...("top" in pos() ? { top: `${(pos() as { top: number }).top}px` } : { bottom: `${(pos() as { bottom: number }).bottom}px` }),
          }}
        >
          <div class="flex items-center gap-1.5 text-xs text-ink-3 mb-1">
            <span>{kindLabel()}</span>
            <Show when={category()}>
              <span class="px-1.5 rounded bg-accent-soft text-accent font-medium">{category()}</span>
            </Show>
          </div>
          <div class="font-serif text-lg leading-snug text-ink mb-1">{d().title}</div>
          <Show when={d().summary && d().summary !== d().title}>
            <div class="text-sm text-ink-2 line-clamp-3">{d().summary}</div>
          </Show>
        </div>
      )}
    </Show>
  );
}
