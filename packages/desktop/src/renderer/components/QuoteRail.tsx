import { createEffect, createSignal, For, on, onCleanup, onMount, Show } from "solid-js";
import { findTextRange } from "../annotate";

/**
 * 批注栏：圈出来的段落不进输入框，就贴在它右边的空白里，和那段字齐平。
 * 卡只是那段字的一个标记，位置靠每次重新在正文里找引文算出来 —— 内容流着长、窗口缩放都跟着走。
 * 找不到（跨段的选区在 DOM 里没有那个换行）就退一步用第一行定位；连第一行都找不到，卡浮在当前视口顶上，不让它消失。
 * 窗口窄到旁边放不下时整栏不出现，输入框那边据此把整张引用卡留着（railRoom）。
 */

const RAIL_GAP = 16;
const RAIL_MIN = 176;
const RAIL_MAX = 260;
/** 两张卡之间的最小间距：位置撞了就往下压 */
const CARD_GAP = 8;
/** 还没渲染出来的卡按这个高度先占位，下一帧再用真高度压一遍 */
const CARD_GUESS = 56;

export interface RailNote {
  id: string;
  /** 卡头那行小字：批注编号，或「等你说话」 */
  label: string;
  /** 引文。也是找位置的凭据 */
  text: string;
  /** 作者写在这段上的话（已经发出去的批注才有） */
  note?: string;
  onClick?: () => void;
  onRemove?: () => void;
}

const [room, setRoom] = createSignal(true);
/** 旁边还放得下批注卡吗：放不下时输入框那边把整张引用卡留着，别只剩一个小 ref */
export const railRoom = () => room();

/** 整段找不到就退成第一行：卡只需要一个高度 */
function anchor(root: HTMLElement, text: string): Range | null {
  const whole = findTextRange(root, text);
  if (whole) return whole;
  const first = text.split("\n").map((s) => s.trim()).find((s) => s.length >= 2);
  return first ? findTextRange(root, first) : null;
}

export function QuoteRail(props: {
  /** 在这个容器里找引文（消息列 / 正文）。卡按它的左上角定位，所以它必须是 relative */
  root: () => HTMLElement | undefined;
  /** 右边到这儿为止：量还有没有地方放 */
  bounds: () => HTMLElement | undefined;
  notes: () => RailNote[];
  /** 这个变了就重新量一遍（正文换了、退出编辑模式……） */
  deps?: () => unknown;
}) {
  let rail: HTMLDivElement | undefined;
  const cards = new Map<string, HTMLElement>();
  const [tops, setTops] = createSignal<Record<string, number>>({});
  const [width, setWidth] = createSignal(RAIL_MAX);

  const place = () => {
    const root = props.root();
    const bounds = props.bounds();
    if (!rail || !root || !bounds) return;
    const railRect = rail.getBoundingClientRect();
    const boundsRect = bounds.getBoundingClientRect();
    // clientWidth 不含滚动条：卡不要压在滚动条上
    const avail = boundsRect.left + bounds.clientWidth - railRect.left - 8;
    setRoom(avail >= RAIL_MIN);
    setWidth(Math.min(Math.max(avail, RAIL_MIN), RAIL_MAX));
    if (avail < RAIL_MIN) return;
    // rail 的 top 就是容器内容顶：卡的 top 都是相对它算的
    const base = railRect.top;
    const inView = boundsRect.top - base + 24;
    const desired = props
      .notes()
      .map((n) => {
        const r = anchor(root, n.text);
        return { id: n.id, top: r ? r.getBoundingClientRect().top - base : inView };
      })
      .sort((a, b) => a.top - b.top);
    const next: Record<string, number> = {};
    let floor = Number.NEGATIVE_INFINITY;
    for (const d of desired) {
      const top = Math.max(d.top, floor);
      next[d.id] = top;
      floor = top + (cards.get(d.id)?.offsetHeight ?? CARD_GUESS) + CARD_GAP;
    }
    setTops(next);
  };
  /** 第一遍卡可能还没渲染出来、量不到高度，下一帧再压一次 */
  const settle = () => {
    place();
    requestAnimationFrame(place);
  };

  onMount(() => {
    settle();
    const ro = new ResizeObserver(() => place());
    const root = props.root();
    const bounds = props.bounds();
    // 正文流着长、窗口缩放都会改容器尺寸，卡跟着重排
    if (root) ro.observe(root);
    if (bounds && bounds !== root) ro.observe(bounds);
    onCleanup(() => ro.disconnect());
  });

  createEffect(
    on(
      () => [props.notes().map((n) => `${n.id}:${n.text}`).join("|"), props.deps?.()] as const,
      () => settle(),
      { defer: true },
    ),
  );

  return (
    <div ref={rail} class="absolute top-0 left-full h-0" style={{ "margin-left": `${RAIL_GAP}px`, width: `${width()}px` }}>
      <Show when={room()}>
        <For each={props.notes()}>
          {(n) => {
            onCleanup(() => cards.delete(n.id));
            return (
              <div
                ref={(el) => cards.set(n.id, el)}
                class="absolute left-0 w-full"
                style={{ top: `${tops()[n.id] ?? 0}px`, visibility: tops()[n.id] === undefined ? "hidden" : undefined }}
              >
                <div class="group rounded-lg border border-line bg-paper-2 px-2.5 py-2 text-xs shadow-sm">
                  <div class="flex items-baseline gap-1 text-ink-3 leading-tight">
                    <span class="font-serif translate-y-px">❝</span>
                    <span class="flex-1 min-w-0 truncate">{n.label}</span>
                    <Show when={n.onRemove}>
                      <button
                        class="shrink-0 w-4 h-4 -my-0.5 rounded text-ink-3 hover:text-ink hover:bg-paper-3"
                        title="去掉这段引用"
                        onClick={() => n.onRemove?.()}
                      >
                        ×
                      </button>
                    </Show>
                  </div>
                  <Show
                    when={n.onClick}
                    fallback={<div class="mt-1 font-serif text-ink-2 line-clamp-3 whitespace-pre-line">{n.text}</div>}
                  >
                    <button class="mt-1 block w-full text-left" title="滚到这段" onClick={() => n.onClick?.()}>
                      <span class="font-serif text-ink-2 line-clamp-3 whitespace-pre-line group-hover:text-ink">{n.text}</span>
                    </button>
                  </Show>
                  <Show when={n.note}>
                    <div class="mt-1.5 pt-1.5 border-t border-line text-ink line-clamp-3">{n.note}</div>
                  </Show>
                </div>
              </div>
            );
          }}
        </For>
      </Show>
    </div>
  );
}
