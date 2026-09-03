import type { DocKindId } from "@opentomato/core/protocol";
import { createSignal, For, Show } from "solid-js";
import { actions, state } from "../state";

const ORDER: DocKindId[] = ["guide", "world", "characters", "threads", "milestones", "volumes", "chapters", "manuscript"];

/**
 * 边栏是这本书的骨架：八类材料按创作顺序排，空的类别灰显不展开。
 * 机检结果只在有问题的文档旁点一个点，不另占地方；重新机检在书名菜单里。
 */
export function Sidebar() {
  const [collapsed, setCollapsed] = createSignal<Record<string, boolean>>({});
  const toggle = (k: string) => setCollapsed((c) => ({ ...c, [k]: !c[k] }));
  const docsOf = (k: DocKindId) => state.docs.filter((d) => d.kind === k);
  const kindLabel = (k: DocKindId) => state.kinds.find((x) => x.id === k)?.label ?? k;
  const activeDoc = () => (state.view.type === "doc" ? `${state.view.kind}/${state.view.id}` : null);
  const issueOf = (kind: string, id: string) => state.issues?.find((i) => i.kind === kind && i.id === id);

  return (
    <div class="h-full overflow-y-auto px-2 py-3">
      <For each={ORDER}>
        {(k) => {
          const docs = () => docsOf(k);
          const empty = () => docs().length === 0;
          return (
            <div>
              <button
                class={`w-full h-7.5 flex items-center gap-2 px-2 rounded-md text-left ${empty() ? "text-ink-3" : "text-ink hover:bg-paper-3"}`}
                disabled={empty()}
                onClick={() => toggle(k)}
              >
                <span class="flex-1">{kindLabel(k)}</span>
                <span class="text-xs text-ink-3 tabular-nums">{empty() ? "—" : docs().length}</span>
              </button>
              <Show when={!empty() && !collapsed()[k]}>
                <For each={docs()}>
                  {(d) => {
                    const issue = () => issueOf(d.kind, d.id);
                    const on = () => activeDoc() === `${d.kind}/${d.id}`;
                    return (
                      <button
                        class={`w-full h-7 flex items-center gap-2 pl-6 pr-2 rounded-md text-left ${on() ? "bg-paper-3 text-ink" : "text-ink-2 hover:bg-paper-3 hover:text-ink"}`}
                        onClick={() => actions.openDoc(d.kind, d.id)}
                        title={issue()?.message ?? d.summary}
                      >
                        <span class="truncate">{d.title}</span>
                        <span class="flex-1" />
                        <Show when={issue()}>
                          {(i) => <span class={`w-1.5 h-1.5 rounded-full shrink-0 ${i().level === "error" ? "bg-danger" : "bg-warn"}`} />}
                        </Show>
                      </button>
                    );
                  }}
                </For>
              </Show>
            </div>
          );
        }}
      </For>
    </div>
  );
}
