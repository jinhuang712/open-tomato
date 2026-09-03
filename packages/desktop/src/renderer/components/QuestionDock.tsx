import { hasLongOptions, optionLabel, optionText, type QuestionOption, type QuestionRequest } from "@opentomato/core/protocol";
import { createSignal, For, Show } from "solid-js";
import { autoGrow } from "../autogrow";
import { actions, state } from "../state";
import { renderMarkdown } from "../markdown";

/** 每个问题都带的两个逃生口，回答文本写成主编能直接执行的话 */
const ESCAPES = [
  { label: "我还没想好", hint: "让主编先给几个候选", answer: "我还没想好，你先替我想 3 个不同方向的候选，我来选。" },
  { label: "先跳过", hint: "这一项记「待定」，继续下一项", answer: "这一项先跳过，记「待定」，继续下一项。" },
];

const ORDINALS = ["一", "二", "三", "四", "五", "六", "七", "八"];

/** 长候选的稿纸标签：模型给了 label 就用，纯长字串按序补「写法一 / 二 / 三」 */
function draftLabel(o: QuestionOption, i: number): string {
  return typeof o === "string" ? `写法${ORDINALS[i] ?? i + 1}` : o.label;
}

/** 回给模型的答案：有 label 的回 label，纯字串回全文 */
function answerOf(o: QuestionOption): string {
  return optionLabel(o);
}

export function QuestionDock(props: { request: QuestionRequest }) {
  const [text, setText] = createSignal("");
  const agent = () => state.agents[props.request.agentId];
  const long = () => hasLongOptions(props.request.options);
  const submit = () => {
    const t = text().trim();
    if (!t) return;
    void actions.answer(props.request.questionId, t);
  };
  const pick = (o: QuestionOption) => void actions.answer(props.request.questionId, answerOf(o));

  return (
    <div class="mx-5 mb-2 rounded-xl border border-warn/40 bg-paper shadow-lg overflow-hidden">
      <div class="flex items-center gap-2 px-4 py-2 bg-warn-soft/60 border-b border-line">
        <span class="w-2 h-2 rounded-full bg-warn" />
        <span class="font-medium">{agent()?.label ?? "agent"} 想问你</span>
      </div>
      <div class="px-4 py-3 prose-zh" innerHTML={renderMarkdown(props.request.text)} />

      <Show
        when={long()}
        fallback={
          <div class="flex flex-wrap gap-2 px-4 pb-3">
            <For each={props.request.options}>
              {(opt) => (
                <button
                  class="px-3 py-1.5 rounded-lg border border-line bg-paper-2 hover:border-accent hover:bg-accent-soft text-left"
                  onClick={() => pick(opt)}
                >
                  {optionLabel(opt)}
                </button>
              )}
            </For>
            <EscapeButtons questionId={props.request.questionId} />
          </div>
        }
      >
        {/* 长候选：并排铺成稿纸，作者像在桌上对比两份草稿 */}
        <div class="drafts px-4 pb-3">
          <For each={props.request.options}>
            {(opt, i) => (
              <article class="draft">
                <header class="draft-tab">{draftLabel(opt, i())}</header>
                <div class="draft-body prose-zh" innerHTML={renderMarkdown(optionText(opt))} />
                <footer class="draft-foot">
                  <button class="draft-pick" onClick={() => pick(opt)}>
                    选这个
                  </button>
                </footer>
              </article>
            )}
          </For>
        </div>
        <div class="flex flex-wrap gap-2 px-4 pb-3">
          <EscapeButtons questionId={props.request.questionId} />
        </div>
      </Show>

      <Show when={props.request.allowFreeText}>
        <div class="flex gap-2 px-4 pb-3">
          <textarea
            class="flex-1 px-3 py-1.5 rounded-lg border border-line bg-paper-2 outline-none focus:border-accent resize-none"
            rows={2}
            placeholder={
              long()
                ? "都不满意？说说想怎么改，或者把两版混搭…（⌘↩ 发送）"
                : props.request.options.length
                  ? "或者直接输入…（⌘↩ 发送）"
                  : "输入回答…（⌘↩ 发送）"
            }
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

/** 逃生选项：永远都有，不靠模型记得给 */
function EscapeButtons(props: { questionId: string }) {
  return (
    <For each={ESCAPES}>
      {(e) => (
        <button
          class="px-3 py-1.5 rounded-lg border border-dashed border-line text-ink-2 hover:border-accent hover:text-ink text-left"
          title={e.hint}
          onClick={() => void actions.answer(props.questionId, e.answer)}
        >
          {e.label}
        </button>
      )}
    </For>
  );
}
