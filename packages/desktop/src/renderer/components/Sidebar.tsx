import { THREAD_TYPES } from "@opentomato/core/protocol";
import type { DocHeader, DocKindId } from "@opentomato/core/protocol";
import { createSignal, For, Show } from "solid-js";
import { actions, state } from "../state";

const ORDER: DocKindId[] = ["brief", "rules", "world", "characters", "threads", "milestones", "volumes", "chapters", "manuscript"];
const UNTYPED = "未分类";

/** 线索按 type 分组，顺序跟 THREAD_TYPES 一致，type 没填或不在范围内的归「未分类」垫底；空组不出现 */
function groupThreads(docs: DocHeader[]): { label: string; docs: DocHeader[] }[] {
  const groups = new Map<string, DocHeader[]>();
  for (const d of docs) {
    const t = typeof d.extra.type === "string" && (THREAD_TYPES as readonly string[]).includes(d.extra.type) ? d.extra.type : UNTYPED;
    groups.set(t, [...(groups.get(t) ?? []), d]);
  }
  return [...THREAD_TYPES, UNTYPED].flatMap((label) => (groups.has(label) ? [{ label, docs: groups.get(label)! }] : []));
}

/**
 * 边栏是这本书的骨架：各类材料按创作顺序排，空的类别灰显不展开。
 * 简介是单例，一行就是那份文档，不显示计数；其余类别右侧是卡片数。守则一条一卡，「必须」排在「尽量」前面；里程碑按 order 排，没填 order 的垫底。
 * 线索按 type 分成主线 / 支线 / 主题 / 小故事几组，组名是一行小字，不可点。
 * 机检结果只在有问题的文档旁点一个点，不另占地方；机检由内核在文档变动后自动跑，没有手动入口。
 */
export function Sidebar() {
  const [collapsed, setCollapsed] = createSignal<Record<string, boolean>>({});
  const toggle = (k: string) => setCollapsed((c) => ({ ...c, [k]: !c[k] }));
  const docsOf = (k: DocKindId) => {
    const docs = state.docs.filter((d) => d.kind === k);
    if (k === "rules") return [...docs].sort((a, b) => Number(b.extra.level === "必须") - Number(a.extra.level === "必须"));
    if (k === "milestones") {
      const orderOf = (d: (typeof docs)[number]) => {
        const n = Number(d.extra.order);
        return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
      };
      return [...docs].sort((a, b) => orderOf(a) - orderOf(b));
    }
    return docs;
  };
  const kindOf = (k: DocKindId) => state.kinds.find((x) => x.id === k);
  const kindLabel = (k: DocKindId) => kindOf(k)?.label ?? k;
  const activeDoc = () => (state.view.type === "doc" ? `${state.view.kind}/${state.view.id}` : null);
  const issueOf = (kind: string, id: string) => state.issues?.find((i) => i.kind === kind && i.id === id);
  const item = (d: DocHeader) => {
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
        <Show when={d.kind === "rules" && d.extra.level === "必须"}>
          <span class="shrink-0 text-[10px] leading-none px-1 py-0.5 rounded bg-paper-3 text-ink-3">必须</span>
        </Show>
        <Show when={issue()}>
          {(i) => <span class={`w-1.5 h-1.5 rounded-full shrink-0 ${i().level === "error" ? "bg-danger" : "bg-warn"}`} />}
        </Show>
      </button>
    );
  };

  return (
    <div class="h-full overflow-y-auto px-2 py-3">
      <For each={ORDER}>
        {(k) => {
          const docs = () => docsOf(k);
          const empty = () => docs().length === 0;
          const single = () => (kindOf(k)?.singleton ? docs()[0] : undefined);
          const count = () => (empty() ? "—" : single() ? "" : String(docs().length));
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
                <Show when={k === "threads"} fallback={<For each={docs()}>{item}</For>}>
                  <For each={groupThreads(docs())}>
                    {(g) => (
                      <>
                        <div class="h-6 flex items-center pl-6 pr-2 text-xs text-ink-3 select-none">{g.label}</div>
                        <For each={g.docs}>{item}</For>
                      </>
                    )}
                  </For>
                </Show>
              </Show>
            </div>
          );
        }}
      </For>
    </div>
  );
}
