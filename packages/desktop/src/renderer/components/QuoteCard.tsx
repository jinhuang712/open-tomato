import { Show } from "solid-js";

/**
 * 一段被圈出来的原话：左竖线、上面一行小字说圈的是谁 / 哪份材料，下面是引文。
 * 三处共用一张卡——输入框上方的引用条、审阅视图的拒绝理由、发出去以后的用户气泡——作者在哪儿看到都是同一件东西。
 * clamp：还没发出去时折成两三行省地方；进了气泡就全文展开，那是记录
 */
export function QuoteCard(props: { from: string; text: string; clamp?: boolean; onRemove?: () => void }) {
  return (
    <div class="group flex items-start gap-2 pl-3 pr-1 py-0.5 border-l-2 border-ink-3 min-w-0">
      <div class="flex-1 min-w-0">
        <div class="text-xs text-ink-3 leading-tight">
          <span class="font-serif translate-y-px inline-block mr-1">❝</span>
          {props.from}
        </div>
        <div class={`font-serif text-sm text-ink-2 whitespace-pre-line ${props.clamp ? "line-clamp-2" : ""}`}>{props.text}</div>
      </div>
      <Show when={props.onRemove}>
        <button
          class="shrink-0 w-6 h-6 rounded-md text-ink-3 hover:text-ink hover:bg-paper-3 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          title="去掉这段引用"
          onClick={() => props.onRemove?.()}
        >
          ×
        </button>
      </Show>
    </div>
  );
}
