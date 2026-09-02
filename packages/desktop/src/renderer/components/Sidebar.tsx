import type { DocKindId } from "@opentomato/core/protocol";
import { createSignal, For, Show } from "solid-js";
import { actions, state } from "../state";

const ORDER: DocKindId[] = ["guide", "world", "characters", "threads", "milestones", "volumes", "chapters", "manuscript"];

export function Sidebar() {
  const [collapsed, setCollapsed] = createSignal<Record<string, boolean>>({});
  const toggle = (k: string) => setCollapsed((c) => ({ ...c, [k]: !c[k] }));
  const docsOf = (k: DocKindId) => state.docs.filter((d) => d.kind === k);
  const kindLabel = (k: DocKindId) => state.kinds.find((x) => x.id === k)?.label ?? k;
  const activeDoc = () => (state.view.type === "doc" ? `${state.view.kind}/${state.view.id}` : null);
  const errorCount = () => state.issues?.filter((i) => i.level === "error").length ?? 0;
  const warnCount = () => state.issues?.filter((i) => i.level === "warning").length ?? 0;

  return (
    <div class="flex flex-col h-full">
      <div class="px-4 pt-3 pb-2 text-[11px] uppercase tracking-wider text-ink-3 flex items-center">
        <span>文档</span>
        <span class="flex-1" />
        <Show when={state.issues}>
          <button class="normal-case tracking-normal flex items-center gap-1" onClick={() => void actions.runCheck()} title="重新机检">
            <Show when={errorCount() > 0}>
              <span class="px-1.5 rounded bg-danger-soft text-danger">{errorCount()} err</span>
            </Show>
            <Show when={warnCount() > 0}>
              <span class="px-1.5 rounded bg-warn-soft text-warn">{warnCount()} warn</span>
            </Show>
            <Show when={errorCount() === 0 && warnCount() === 0}>
              <span class="px-1.5 rounded bg-ok-soft text-ok">通过</span>
            </Show>
          </button>
        </Show>
      </div>
      <div class="flex-1 overflow-y-auto px-2 pb-3">
        <For each={ORDER}>
          {(k) => (
            <div class="mb-1">
              <button class="w-full flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-paper-2 text-left" onClick={() => toggle(k)}>
                <span class="text-ink-3 text-[10px] w-3">{collapsed()[k] ? "▸" : "▾"}</span>
                <span class="font-medium">{kindLabel(k)}</span>
                <span class="text-ink-3 text-[11px]">{docsOf(k).length}</span>
              </button>
              <Show when={!collapsed()[k]}>
                <For each={docsOf(k)}>
                  {(d) => {
                    const hasIssue = () => state.issues?.some((i) => i.kind === d.kind && i.id === d.id && i.level === "error");
                    return (
                      <button
                        class={`w-full flex items-center gap-2 pl-7 pr-2 py-1 rounded-md text-left text-[12px] ${
                          activeDoc() === `${d.kind}/${d.id}` ? "bg-paper-3" : "hover:bg-paper-2"
                        }`}
                        onClick={() => actions.openDoc(d.kind, d.id)}
                        title={d.summary}
                      >
                        <span class="font-mono text-ink-3 shrink-0">{d.id}</span>
                        <span class="truncate">{d.title}</span>
                        <span class="flex-1" />
                        <Show when={hasIssue()}>
                          <span class="w-1.5 h-1.5 rounded-full bg-danger shrink-0" />
                        </Show>
                      </button>
                    );
                  }}
                </For>
              </Show>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}
