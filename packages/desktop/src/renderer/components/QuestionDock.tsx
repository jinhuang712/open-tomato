import { formatChecklistAnswer, optionLabel, optionText, quoteBlock, type ChecklistMark, type QuestionKind, type QuestionOption, type QuestionRequest } from "@opentomato/core/protocol";
import { createEffect, createSignal, For, Show } from "solid-js";
import { autoGrow } from "../autogrow";
import { actions, state } from "../state";
import { renderMarkdown } from "../markdown";
import { escapesFor, type Escape } from "../question-escapes";
import { QuoteCard } from "./QuoteCard";
import { QuotePill } from "./QuotePill";

/** 自由输入框的提示语按形态换 */
const PLACEHOLDER: Record<QuestionKind, string> = {
  open: "输入回答…",
  single: "或者直接输入…",
  multi: "或者直接输入…",
  checklist: "有别的要改的，直接说…",
  compare: "都不满意？说说想怎么改，或者把两版混搭…",
};

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
  const kind = (): QuestionKind => props.request.kind;
  /** 作者在问题正文 / 某一版草稿上圈出来的段落，随这次回答一起交回去。换了问题就清空 */
  const [quotes, setQuotes] = createSignal<{ id: string; from: string; text: string }[]>([]);
  createEffect(() => {
    props.request.questionId;
    setQuotes([]);
  });
  let box: HTMLTextAreaElement | undefined;
  /** 圈一段点「批注」：引文挂在回答框上方，光标跟过去，作者接着对着它说 */
  const annotate = (t: string, from?: string) => {
    setQuotes((qs) => [...qs, { id: crypto.randomUUID(), from: from ?? agent()?.label ?? "agent", text: t }]);
    queueMicrotask(() => box?.focus());
  };
  const dropQuote = (id: string) => setQuotes((qs) => qs.filter((q) => q.id !== id));
  /** 所有交答案的路都走这里：圈的引文按围栏排在最前面，agent 才知道作者说的是哪一段 */
  const answer = (t: string) => {
    const blocks = quotes().map((q) => quoteBlock(q.from, q.text));
    void actions.answer(props.request.questionId, [...blocks, t].filter(Boolean).join("\n\n"));
  };
  const submit = () => {
    const t = text().trim();
    if (!t) return;
    answer(t);
  };
  const pick = (o: QuestionOption) => answer(answerOf(o));

  // multi：勾选态放本地，点「确定」一次交出去。换了问题就清空
  const [picked, setPicked] = createSignal<Set<number>>(new Set());
  createEffect(() => {
    props.request.questionId;
    setPicked(new Set<number>());
  });
  const toggle = (i: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  // checklist：每条三态放本地，统一走右下角「回答」+ ⌘↩ 交出去，输入框里的字当补充说明缀在末尾。
  // 没碰的条目就是没表态，不预设为不改；一个没定但写了话也照样能交。
  const [marks, setMarks] = createSignal<ChecklistMark[]>([]);
  createEffect(() => {
    props.request.questionId;
    setMarks([]);
  });
  const markOf = (i: number): ChecklistMark => marks()[i] ?? null;
  const setMark = (i: number, m: ChecklistMark) =>
    setMarks((prev) => {
      const next = [...prev];
      next[i] = next[i] === m ? null : m;
      return next;
    });
  const markedCount = () => marks().filter((m) => m !== null && m !== undefined).length;
  const canSubmitChecklist = () => markedCount() > 0 || text().trim().length > 0;
  const submitChecklist = () => {
    if (!canSubmitChecklist()) return;
    const t = text().trim();
    answer(formatChecklistAnswer(props.request.options, marks(), t || undefined));
  };
  const checklistEscapes = (): Escape[] => {
    const n = props.request.options.length;
    const all = (m: ChecklistMark) => Array<ChecklistMark>(n).fill(m);
    return [
      { label: "全改", hint: "每一条都改", answer: formatChecklistAnswer(props.request.options, all("yes")) },
      { label: "全不改", hint: "每一条都不改", answer: formatChecklistAnswer(props.request.options, all("no")) },
      { label: "没碰的你替我定", hint: "已表态的照办，没表态的主编拿主意并说明理由", answer: formatChecklistAnswer(props.request.options, marks(), "没表态的你替我定，说清为什么。") },
      { label: "先放一放", hint: "记进这张卡的 open 清单，不为它停下", answer: "这一项先放一放，记进对应卡的 open 清单，不为它停下，接着往下。" },
    ];
  };

  const submitMulti = () => {
    const labels = props.request.options.filter((_, i) => picked().has(i)).map(optionLabel);
    if (!labels.length) return;
    answer(`作者选了：${labels.join("、")}`);
  };

  let card: HTMLDivElement | undefined;
  return (
    <div ref={card} class="mx-5 mb-2 rounded-lg border border-line-2 bg-paper-2 overflow-hidden">
      {/* 提问卡自己收引文：圈问题正文或某一版草稿，引文进回答框上方，不往主编输入框里去（那会儿它是藏着的） */}
      <QuotePill within={() => card} onTake={annotate} title="对这段说点什么，连引文一起回给它" />
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
      <div class="px-4 py-3 prose-zh" data-quote-from={agent()?.label ?? "agent"} innerHTML={renderMarkdown(props.request.text)} />

      <Show when={kind() === "single"}>
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
          <EscapeButtons request={props.request} onAnswer={answer} />
        </div>
      </Show>

      <Show when={kind() === "multi"}>
        {/* 挑若干个：chip 可切换勾选，点确定一次交出去。没选的就是「不要」，不用报 */}
        <div class="flex flex-wrap gap-2 px-4 pb-2">
          <For each={props.request.options}>
            {(opt, i) => (
              <button
                class="min-h-7 px-3 py-1 rounded-md border text-left"
                classList={{
                  "border-ink-2 bg-paper-3 text-ink": picked().has(i()),
                  "border-line-2 hover:border-ink-3 hover:text-ink": !picked().has(i()),
                }}
                aria-pressed={picked().has(i())}
                onClick={() => toggle(i())}
              >
                <span class="mr-1.5 text-ink-3">{picked().has(i()) ? "☑" : "☐"}</span>
                {optionLabel(opt)}
              </button>
            )}
          </For>
        </div>
        <div class="flex flex-wrap items-center gap-2 px-4 pb-3">
          <button
            class="h-8 px-3 rounded-md bg-ink text-paper font-medium hover:brightness-110 disabled:opacity-30"
            disabled={picked().size === 0}
            onClick={submitMulti}
          >
            确定{picked().size > 0 ? `（已选 ${picked().size} 项）` : ""}
          </button>
          <EscapeButtons request={props.request} onAnswer={answer} />
        </div>
      </Show>

      <Show when={kind() === "checklist"}>
        {/* 逐条表态：每条一行，右侧「改」「不改」三态互斥可取消。没表态不标红不催，交出去时单独报 */}
        <div class="px-4 pb-2 flex flex-col gap-1.5">
          <For each={props.request.options}>
            {(opt, i) => (
              <div class="flex items-center gap-3 min-h-8 px-3 py-1 rounded-md border border-line-2" classList={{ "opacity-60": markOf(i()) !== null }}>
                <span class="text-ink-3 text-xs shrink-0 w-5">{i() + 1}.</span>
                <span class="flex-1 min-w-0 text-left">{optionLabel(opt)}</span>
                <div class="flex gap-1 shrink-0">
                  <button
                    class="h-6 px-2 rounded border text-xs"
                    classList={{
                      "border-ink-2 bg-ink text-paper": markOf(i()) === "yes",
                      "border-line-2 text-ink-3 hover:border-ink-3 hover:text-ink": markOf(i()) !== "yes",
                    }}
                    aria-pressed={markOf(i()) === "yes"}
                    onClick={() => setMark(i(), "yes")}
                  >
                    改
                  </button>
                  <button
                    class="h-6 px-2 rounded border text-xs"
                    classList={{
                      "border-ink-2 bg-paper-3 text-ink": markOf(i()) === "no",
                      "border-line-2 text-ink-3 hover:border-ink-3 hover:text-ink": markOf(i()) !== "no",
                    }}
                    aria-pressed={markOf(i()) === "no"}
                    onClick={() => setMark(i(), "no")}
                  >
                    不改
                  </button>
                </div>
              </div>
            )}
          </For>
        </div>
        <div class="flex flex-wrap items-center gap-2 px-4 pb-3">
          {/* 输入框收起（allowFreeText 关掉）时才留确定按钮，平时统一走右下角「回答」 */}
          <Show when={!props.request.allowFreeText}>
            <button
              class="h-8 px-3 rounded-md bg-ink text-paper font-medium hover:brightness-110 disabled:opacity-30"
              disabled={markedCount() === 0}
              onClick={() => submitChecklist()}
            >
              确定{markedCount() > 0 ? `（已定 ${markedCount()}/${props.request.options.length}）` : ""}
            </button>
          </Show>
          <For each={checklistEscapes()}>
            {(e) => (
              <button
                class="min-h-7 px-3 py-1 rounded-md border border-dashed border-line-2 text-ink-3 hover:border-ink-3 hover:text-ink text-left"
                title={e.hint}
                onClick={() => answer(e.answer)}
              >
                {e.label}
              </button>
            )}
          </For>
        </div>
      </Show>

      <Show when={kind() === "open"}>
        <div class="flex flex-wrap gap-2 px-4 pb-3">
          <EscapeButtons request={props.request} onAnswer={answer} />
        </div>
      </Show>

      <Show when={kind() === "compare"}>
        {/* 长候选：并排铺成稿纸，作者像在桌上对比两份草稿 */}
        <div class="drafts px-4 pb-3">
          <For each={props.request.options}>
            {(opt, i) => (
              <article class="draft">
                <header class="draft-tab">{draftLabel(opt, i())}</header>
                <div class="draft-body prose-zh" data-quote-from={draftLabel(opt, i())} innerHTML={renderMarkdown(optionText(opt))} />
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
          <EscapeButtons request={props.request} onAnswer={answer} />
        </div>
      </Show>

      {/* 圈出来的段落排在回答框上方：输入框收起（allowFreeText 关掉）时也照样露出来，跟着选的那一项交回去 */}
      <Show when={quotes().length > 0}>
        <div class="mx-4 mb-2 flex flex-col gap-1.5">
          <For each={quotes()}>{(q) => <QuoteCard from={q.from} text={q.text} clamp onRemove={() => dropQuote(q.id)} />}</For>
        </div>
      </Show>

      <Show when={props.request.allowFreeText}>
        <div class="mx-4 mb-3 rounded-md border border-line-2 bg-paper focus-within:border-ink-3">
          <textarea
            ref={box}
            class="w-full bg-transparent px-3 pt-1.5 pb-1 outline-none resize-none placeholder:text-ink-3"
            rows={2}
            placeholder={`${quotes().length > 0 ? "对这段说点什么" : PLACEHOLDER[kind()]}（⌘↩ 发送）`}
            value={text()}
            onInput={(e) => {
              setText(e.currentTarget.value);
              autoGrow(e.currentTarget);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (kind() === "checklist") submitChecklist();
                else submit();
              }
            }}
          />
          <div class="flex justify-end px-2 pb-2">
            <button
              class="h-7 px-3 rounded-md bg-ink text-paper font-medium hover:brightness-110 disabled:opacity-30"
              disabled={kind() === "checklist" ? !canSubmitChecklist() : !text().trim()}
              onClick={() => (kind() === "checklist" ? submitChecklist() : submit())}
            >
              {kind() === "checklist" && markedCount() > 0 ? `回答（已定 ${markedCount()}/${props.request.options.length}）` : "回答"}
            </button>
          </div>
        </div>
      </Show>
      </Show>
    </div>
  );
}

/** 逃生选项：永远都有，不靠模型记得给；具体几个、叫什么，按问题形态定 */
function EscapeButtons(props: { request: QuestionRequest; onAnswer: (text: string) => void }) {
  return (
    <For each={escapesFor(props.request)}>
      {(e) => (
        <button
          class="min-h-7 px-3 py-1 rounded-md border border-dashed border-line-2 text-ink-3 hover:border-ink-3 hover:text-ink text-left"
          title={e.hint}
          onClick={() => props.onAnswer(e.answer)}
        >
          {e.label}
        </button>
      )}
    </For>
  );
}
