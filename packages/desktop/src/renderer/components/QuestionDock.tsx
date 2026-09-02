import type { QuestionRequest } from "@opentomato/core/protocol";
import { createSignal, For, Show } from "solid-js";
import { autoGrow } from "../autogrow";
import { actions, state } from "../state";
import { renderMarkdown } from "../markdown";

/** 每个问题都带的两个逃生口，回答文本写成主编能直接执行的话 */
const ESCAPES = [
  { label: "我还没想好", hint: "让主编先给几个候选", answer: "我还没想好，你先替我想 3 个不同方向的候选，我来选。" },
  { label: "先跳过", hint: "这一项记「待定」，继续下一项", answer: "这一项先跳过，记「待定」，继续下一项。" },
];

export function QuestionDock(props: { request: QuestionRequest }) {
  const [text, setText] = createSignal("");
  const agent = () => state.agents[props.request.agentId];
  const submit = () => {
    const t = text().trim();
    if (!t) return;
    void actions.answer(props.request.questionId, t);
  };

  return (
    <div class="mx-5 mb-2 rounded-xl border border-warn/40 bg-paper shadow-lg overflow-hidden">
      <div class="flex items-center gap-2 px-4 py-2 bg-warn-soft/60 border-b border-line">
        <span class="w-2 h-2 rounded-full bg-warn" />
        <span class="font-medium">{agent()?.label ?? "agent"} 想问你</span>
      </div>
      <div class="px-4 py-3 prose-zh" innerHTML={renderMarkdown(props.request.text)} />
      <div class="flex flex-wrap gap-2 px-4 pb-3">
        <For each={props.request.options}>
          {(opt) => (
            <button
              class="px-3 py-1.5 rounded-lg border border-line bg-paper-2 hover:border-accent hover:bg-accent-soft text-left"
              onClick={() => void actions.answer(props.request.questionId, opt)}
            >
              {opt}
            </button>
          )}
        </For>
        {/* 逃生选项：永远都有，不靠模型记得给 */}
        <For each={ESCAPES}>
          {(e) => (
            <button
              class="px-3 py-1.5 rounded-lg border border-dashed border-line text-ink-2 hover:border-accent hover:text-ink text-left"
              title={e.hint}
              onClick={() => void actions.answer(props.request.questionId, e.answer)}
            >
              {e.label}
            </button>
          )}
        </For>
      </div>
      <Show when={props.request.allowFreeText}>
        <div class="flex gap-2 px-4 pb-3">
          <textarea
            class="flex-1 px-3 py-1.5 rounded-lg border border-line bg-paper-2 outline-none focus:border-accent resize-none"
            rows={2}
            placeholder={props.request.options.length ? "或者直接输入…（⌘↩ 发送）" : "输入回答…（⌘↩ 发送）"}
            value={text()}
            onInput={(e) => {
              setText(e.currentTarget.value);
              autoGrow(e.currentTarget);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button class="px-3 rounded-lg bg-ink text-paper font-medium hover:brightness-110 disabled:opacity-40" disabled={!text().trim()} onClick={submit}>
            回答
          </button>
        </div>
      </Show>
    </div>
  );
}
