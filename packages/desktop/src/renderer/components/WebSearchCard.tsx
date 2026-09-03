import type { UiPart } from "@opentomato/core/protocol";
import { createMemo, createSignal, For, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { hostOf, parseWebSearchHits } from "../websearch";

type ToolPart = Extract<UiPart, { type: "tool" }>;

const query = (part: ToolPart) => String((part.args as Record<string, unknown> | undefined)?.query ?? "");

/** 搜网络：一行摘要，点开弹窗看清洗后的结果列表 */
export function WebSearchCard(props: { part: ToolPart }) {
  const [open, setOpen] = createSignal(false);
  const running = () => props.part.status === "running";
  const isError = () => props.part.status === "error";
  const hits = createMemo(() => (running() || isError() ? [] : parseWebSearchHits(props.part.output)));

  return (
    <>
      <div class="my-0.5 text-xs">
        <button
          class="w-full h-6.5 flex items-center gap-2 text-left text-ink-3 hover:text-ink-2 disabled:cursor-default"
          disabled={running()}
          onClick={() => setOpen(true)}
        >
          <span class={`w-1.5 h-1.5 rounded-full ${running() ? "bg-accent" : isError() ? "bg-danger" : "bg-ok"}`} />
          <span class={running() ? "shimmer" : "text-ink-2"}>搜网络</span>
          <span class="flex-1 min-w-0 truncate">{query(props.part)}</span>
          <Show when={!running()}>
            <span class="text-ink-3 shrink-0">{isError() ? "失败" : hits().length ? `${hits().length} 条` : "无结果"} ▸</span>
          </Show>
        </button>
      </div>
      <Show when={open()}>
        <Portal>
          <WebSearchModal part={props.part} hits={hits()} onClose={() => setOpen(false)} />
        </Portal>
      </Show>
    </>
  );
}

function WebSearchModal(props: { part: ToolPart; hits: ReturnType<typeof parseWebSearchHits>; onClose: () => void }) {
  let box: HTMLDivElement | undefined;
  const isError = () => props.part.status === "error";
  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={props.onClose}>
      <div
        ref={(el) => {
          box = el;
          queueMicrotask(() => box?.focus());
        }}
        tabIndex={-1}
        class="w-full max-w-[720px] max-h-[85vh] rounded-2xl bg-paper border border-line shadow-2xl flex flex-col overflow-hidden outline-none"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") props.onClose();
        }}
      >
        <div class="flex items-center gap-3 px-5 py-3 border-b border-line">
          <span class={`w-2 h-2 rounded-full ${isError() ? "bg-danger" : "bg-ok"}`} />
          <span class="font-medium">搜网络</span>
          <span class="text-ink-2 text-sm truncate flex-1 selectable">{query(props.part)}</span>
          <button class="text-ink-3 hover:text-ink text-xs px-2 py-1 rounded-md hover:bg-paper-2" onClick={props.onClose}>
            关闭 <span class="font-mono">esc</span>
          </button>
        </div>
        <div class="overflow-auto px-5 py-4 selectable">
          <Show
            when={!isError() && props.hits.length > 0}
            fallback={
              <pre class={`font-mono whitespace-pre-wrap break-words text-xs ${isError() ? "text-danger" : "text-ink-2"}`}>{props.part.output}</pre>
            }
          >
            <ol class="flex flex-col gap-4">
              <For each={props.hits}>
                {(hit, i) => (
                  <li class="flex gap-3">
                    <span class="text-ink-3 text-xs font-mono w-5 shrink-0 pt-0.5 text-right">{i() + 1}</span>
                    <div class="min-w-0 flex-1">
                      <a href={hit.url} target="_blank" rel="noreferrer" class="text-ink font-medium hover:underline break-words">
                        {hit.title || hit.url}
                      </a>
                      <div class="text-xs text-ink-3 mt-0.5 flex gap-2 flex-wrap">
                        <span class="truncate max-w-[60%]">{hostOf(hit.url)}</span>
                        <Show when={hit.published}>
                          <span>{hit.published}</span>
                        </Show>
                        <Show when={hit.author}>
                          <span class="truncate">{hit.author}</span>
                        </Show>
                      </div>
                      <Show when={hit.highlights.length > 0}>
                        <ul class="mt-1.5 flex flex-col gap-1 text-sm text-ink-2 leading-relaxed">
                          <For each={hit.highlights}>{(h) => <li class="pl-3 border-l-2 border-line-2">{h}</li>}</For>
                        </ul>
                      </Show>
                    </div>
                  </li>
                )}
              </For>
            </ol>
          </Show>
        </div>
      </div>
    </div>
  );
}
