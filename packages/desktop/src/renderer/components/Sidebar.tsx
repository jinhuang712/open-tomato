import type { DocKindId } from "@opentomato/core/protocol";
import { createSignal, For, Show } from "solid-js";
import { actions, state } from "../state";

const ORDER: DocKindId[] = ["brief", "rules", "world", "characters", "threads", "milestones", "volumes", "chapters", "manuscript"];

/**
 * 边栏是这本书的骨架：各类材料按创作顺序排，空的类别灰显不展开。
 * 简介是单例，一行就是那份文档，计数是已填段 / 总段；守则一条一卡，「必须」排在「尽量」前面。
 * 机检结果只在有问题的文档旁点一个点，不另占地方；重新机检在书名菜单里。
 */
export function Sidebar() {
  const [collapsed, setCollapsed] = createSignal<Record<string, boolean>>({});
  const toggle = (k: string) => setCollapsed((c) => ({ ...c, [k]: !c[k] }));
  const docsOf = (k: DocKindId) => {
    const docs = state.docs.filter((d) => d.kind === k);
    return k === "rules" ? [...docs].sort((a, b) => Number(b.extra.level === "必须") - Number(a.extra.level === "必须")) : docs;
  };
  const kindOf = (k: DocKindId) => state.kinds.find((x) => x.id === k);
  const kindLabel = (k: DocKindId) => kindOf(k)?.label ?? k;
  const activeDoc = () => (state.view.type === "doc" ? `${state.view.kind}/${state.view.id}` : null);
  const issueOf = (kind: string, id: string) => state.issues?.find((i) => i.kind === kind && i.id === id);

  return (
    <div class="h-full overflow-y-auto px-2 py-3">
      <For each={ORDER}>
        {(k) => {
          const docs = () => docsOf(k);
          const empty = () => docs().length === 0;
          const single = () => (kindOf(k)?.singleton ? docs()[0] : undefined);
          const count = () => {
            if (empty()) return "—";
            const p = single()?.progress;
            return p ? `${p.filled}/${p.total}` : String(docs().length);
          };
          const on = () => !!single() && activeDoc() === `${k}/${single()!.id}`;
          return (
            <div>
              <button
                class={`w-full h-7.5 flex items-center gap-2 px-2 rounded-md text-left ${empty() ? "text-ink-3" : on() ? "bg-paper-3 text-ink" : "text-ink hover:bg-paper-3"}`}
                disabled={empty()}
                onClick={() => (single() ? actions.openDoc(k, single()!.id) : toggle(k))}
              >
                <span class="flex-1">{kindLabel(k)}</span>
                <span class="text-xs text-ink-3 tabular-nums">{count()}</span>
              </button>
              <Show when={!empty() && !single() && !collapsed()[k]}>
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
                        <Show when={d.kind === "rules" && d.extra.level === "必须"}>
                          <span class="w-1.5 h-1.5 rounded-full shrink-0 bg-ink-2" title="必须" />
                        </Show>
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
