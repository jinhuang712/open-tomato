import { hasLongOptions, optionLabel, optionText, type QuestionOption, type QuestionRequest } from "@opentomato/core/protocol";
import { createEffect, createSignal, For, Show } from "solid-js";
import { autoGrow } from "../autogrow";
import { actions, state } from "../state";
import { renderMarkdown } from "../markdown";

interface Escape {
  label: string;
  hint: string;
  /** 回给主编的话，写成它能直接执行的指令 */
  answer: string;
}

/**
 * 逃生口按问题的形态变：
 * - 没给候选：让主编先想几个
 * - 给了短候选：都不对就换一批；也可以把这个决定交给主编
 * - 给了长稿（两版写法、两版小传）：可以混搭、可以换思路
 * 「先放一放」永远都有，不确定的留白是合法的。
 */
function escapesFor(req: QuestionRequest): Escape[] {
  const n = req.options.length;
  const list: Escape[] = [];
  if (n === 0) {
    list.push({ label: "我还没想好", hint: "让主编先给几个候选", answer: "我还没想好，你先替我想 3 个不同方向的候选，我来选。" });
  } else if (hasLongOptions(req.options)) {
    if (n >= 2) list.push({ label: "混搭", hint: "把几版的优点合成一版", answer: "这几版各有可取之处，帮我把优点合成一版再给我看。" });
    list.push({ label: "都不太对", hint: "换个思路再给两版", answer: `这${n > 1 ? "几版" : "版"}方向都不太对，换个思路再给我两版。` });
  } else {
    list.push({ label: "换一批", hint: "这几个方向都不太对，再来 3 个", answer: "这几个都不太对，换 3 个不同方向再给我一批。" });
    if (n >= 2) list.push({ label: "你替我定", hint: "主编从这几个里挑一个，说明理由", answer: "这个你替我定，从这几个里挑一个，说清为什么，然后接着往下。" });
  }
  list.push({ label: "先放一放", hint: "这一项记「待定」，不为它停下", answer: "这一项先记「待定」，不为它停下，接着往下。" });
  return list;
}

const ORDINALS = ["一", "二", "三", "四", "五", "六", "七", "八"];

/** 长候选的稿纸标签：模型给了 label 就用，纯长字串按序补「写法一 / 二 / 三」 */
function draftLabel(o: QuestionOption, i: number): string {
  return typeof o === "string" ? `写法${ORDINALS[i] ?? i + 1}` : o.label;
}

/** 折叠态的一行摘要：取问题正文首行，抹掉 markdown 记号 */
export function summarizeQuestion(text: string): string {
  const line = text.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  return line.replace(/^[#>\-*\s]+/, "").replace(/[*`_]/g, "");
}

/** 回给模型的答案：有 label 的回 label，纯字串回全文 */
function answerOf(o: QuestionOption): string {
  return optionLabel(o);
}

export function QuestionDock(props: { request: QuestionRequest }) {
  const [text, setText] = createSignal("");
  const [open, setOpen] = createSignal(true);
  // 换了一个问题就重新展开，别让上一个问题的收起状态盖住新问题
  createEffect(() => {
    props.request.questionId;
    setOpen(true);
  });
  const agent = () => state.agents[props.request.agentId];
  const long = () => hasLongOptions(props.request.options);
  const submit = () => {
    const t = text().trim();
    if (!t) return;
    void actions.answer(props.request.questionId, t);
  };
  const pick = (o: QuestionOption) => void actions.answer(props.request.questionId, answerOf(o));

  return (
    <div class="mx-5 mb-2 rounded-lg border border-line-2 bg-paper-2 overflow-hidden">
      <button
        class="w-full flex items-center gap-2 px-4 h-9 text-xs text-left hover:bg-paper"
        classList={{ "border-b border-line": open() }}
        onClick={() => setOpen(!open())}
        title={open() ? "收起" : "展开"}
      >
        <span class="w-2 h-2 rounded-full bg-warn shrink-0" />
        <span class="font-medium shrink-0">{agent()?.label ?? "agent"} 想问你</span>
        <Show when={!open()}>
          <span class="flex-1 min-w-0 truncate text-ink-3">{summarizeQuestion(props.request.text)}</span>
        </Show>
        <span class="ml-auto shrink-0 text-ink-3 transition-transform" classList={{ "rotate-90": open() }}>
          ›
        </span>
      </button>

      <Show when={open()}>
      <div class="px-4 py-3 prose-zh" innerHTML={renderMarkdown(props.request.text)} />

      <Show
        when={long()}
        fallback={
          <div class="flex flex-wrap gap-2 px-4 pb-3">
            <For each={props.request.options}>
              {(opt) => (
                <button
                  class="min-h-7 px-3 py-1 rounded-md border border-line-2 hover:border-ink-3 hover:text-ink text-left"
                  onClick={() => pick(opt)}
                >
                  {optionLabel(opt)}
                </button>
              )}
            </For>
            <EscapeButtons request={props.request} />
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
          <EscapeButtons request={props.request} />
        </div>
      </Show>

      <Show when={props.request.allowFreeText}>
        <div class="flex gap-2 px-4 pb-3">
          <textarea
            class="flex-1 px-3 py-1.5 rounded-md border border-line-2 bg-paper outline-none focus:border-ink-3 resize-none placeholder:text-ink-3"
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
          <button class="px-3 rounded-md bg-ink text-paper font-medium hover:brightness-110 disabled:opacity-30" disabled={!text().trim()} onClick={submit}>
            回答
          </button>
        </div>
      </Show>
      </Show>
    </div>
  );
}

/** 逃生选项：永远都有，不靠模型记得给；具体几个、叫什么，按问题形态定 */
function EscapeButtons(props: { request: QuestionRequest }) {
  return (
    <For each={escapesFor(props.request)}>
      {(e) => (
        <button
          class="min-h-7 px-3 py-1 rounded-md border border-dashed border-line-2 text-ink-3 hover:border-ink-3 hover:text-ink text-left"
          title={e.hint}
          onClick={() => void actions.answer(props.request.questionId, e.answer)}
        >
          {e.label}
        </button>
      )}
    </For>
  );
}
