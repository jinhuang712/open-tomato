import type { DocContent, DocKindId } from "@opentomato/core/protocol";
import { createEffect, createResource, createSignal, For, on, Show } from "solid-js";
import { bridge } from "../bridge";
import { renderMarkdown } from "../markdown";
import { actions, errText, state, toast } from "../state";

export function DocViewer(props: { kind: DocKindId; id: string }) {
  const [doc, { refetch }] = createResource(
    () => ({ kind: props.kind, id: props.id, tick: state.docs.length }),
    async ({ kind, id }) => bridge.request("doc.read", { kind, id }),
  );
  const [editing, setEditing] = createSignal(false);
  const [draft, setDraft] = createSignal("");
  const kindLabel = () => state.kinds.find((k) => k.id === props.kind)?.label ?? props.kind;
  const issues = () => state.issues?.filter((i) => i.kind === props.kind && i.id === props.id) ?? [];

  createEffect(
    on(
      () => state.docs,
      () => void refetch(),
      { defer: true },
    ),
  );

  const startEdit = (d: DocContent) => {
    setDraft(d.raw);
    setEditing(true);
  };
  const save = async () => {
    try {
      await bridge.request("doc.write", { kind: props.kind, id: props.id, raw: draft() });
      setEditing(false);
      toast("已保存");
    } catch (e) {
      toast(errText(e), "error");
    }
  };

  return (
    <div class="flex flex-col h-full min-w-0">
      <div class="flex items-center gap-2 px-5 py-2 border-b border-line bg-paper-2 text-xs">
        <button class="text-ink-2 hover:text-ink" onClick={() => actions.openChat("lead")}>
          ← 对话
        </button>
        <span class="text-ink-3">|</span>
        <span class="text-ink-3">{kindLabel()}</span>
        <span class="text-ink-2">{props.id}</span>
        <span class="flex-1" />
        <Show when={doc()}>
          {(d) => (
            <>
              <button class="text-ink-2 hover:text-ink" onClick={() => void bridge.openPath(`${state.project?.root}/${d().path}`)}>
                用外部编辑器打开
              </button>
              <Show
                when={editing()}
                fallback={
                  <button class="px-2.5 py-1 rounded-md border border-line hover:bg-paper-3" onClick={() => startEdit(d())}>
                    编辑
                  </button>
                }
              >
                <button class="px-2.5 py-1 rounded-md bg-ink text-paper" onClick={() => void save()}>
                  保存
                </button>
                <button class="px-2.5 py-1 rounded-md border border-line" onClick={() => setEditing(false)}>
                  取消
                </button>
              </Show>
            </>
          )}
        </Show>
      </div>
      <Show when={issues().length > 0}>
        <div class="px-5 py-2 bg-warn-soft/50 border-b border-line text-xs space-y-0.5">
          <For each={issues()}>
            {(i) => (
              <div class={i.level === "error" ? "text-danger" : "text-warn"}>
                [{i.level}] {i.message}
              </div>
            )}
          </For>
        </div>
      </Show>
      <div class="flex-1 overflow-y-auto">
        <Show when={doc.loading && !doc()}>
          <div class="p-6 text-ink-3">读取中…</div>
        </Show>
        <Show when={doc.error}>
          <div class="p-6 text-danger">{errText(doc.error)}</div>
        </Show>
        <Show when={doc()}>
          {(d) => (
            <Show
              when={editing()}
              fallback={
                <div class="max-w-3xl mx-auto px-8 py-6">
                  <h1 class="font-serif text-xl mb-1">{d().title}</h1>
                  <div class="text-ink-2 mb-1">{d().summary}</div>
                  <div class="flex flex-wrap gap-1.5 mb-5 text-xs">
                    <span class="px-1.5 rounded bg-paper-3 text-ink-2">{d().status}</span>
                    <For each={d().keywords}>{(k) => <span class="px-1.5 rounded bg-paper-3 text-ink-2">{k}</span>}</For>
                    <For each={Object.entries(d().extra)}>
                      {([k, v]) => (
                        <span class="px-1.5 rounded bg-paper-2 text-ink-3">
                          {k}={typeof v === "string" ? v : JSON.stringify(v)}
                        </span>
                      )}
                    </For>
                  </div>
                  <div class={`prose-zh ${props.kind === "manuscript" ? "font-serif text-lg leading-8" : ""}`} innerHTML={renderMarkdown(d().body)} />
                </div>
              }
            >
              <textarea
                class="w-full h-full p-6 bg-paper font-mono text-xs leading-relaxed outline-none resize-none"
                value={draft()}
                onInput={(e) => setDraft(e.currentTarget.value)}
                spellcheck={false}
              />
            </Show>
          )}
        </Show>
      </div>
    </div>
  );
}
