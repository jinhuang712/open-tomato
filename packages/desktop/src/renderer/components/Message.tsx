import type { UiMessage } from "@opentomato/core/protocol";
import { For, Match, Show, Switch, createSignal } from "solid-js";
import { renderMarkdown } from "../markdown";
import { splitAttachments } from "../attachments";
import { actions, state } from "../state";
import { QuoteCard } from "./QuoteCard";
import { ToolCard } from "./ToolCard";

/** 用户消息里的附件：默认只露文件名和字数，点开才看正文 */
function AttachmentChip(props: { name: string; content: string }) {
  const [open, setOpen] = createSignal(false);
  return (
    <div class="mt-2 text-xs">
      <button
        class="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-paper-2 text-ink-2 hover:text-ink text-left"
        onClick={() => setOpen(!open())}
      >
        <span class="text-ink-3">📎</span>
        <span class="truncate flex-1 min-w-0">{props.name}</span>
        <span class="text-ink-3 shrink-0">{props.content.length} 字</span>
        <span class="text-ink-3 shrink-0">{open() ? "▾" : "▸"}</span>
      </button>
      <Show when={open()}>
        <pre class="mt-1 px-3 py-2 rounded-md bg-paper-2 text-ink-2 whitespace-pre-wrap break-words max-h-80 overflow-y-auto selectable font-mono text-[11px]">
          {props.content}
        </pre>
      </Show>
    </div>
  );
}

/** 用户气泡正文：正文 + 折叠附件 */
function UserText(props: { text: string }) {
  const parsed = () => splitAttachments(props.text);
  return (
    <>
      <Show when={parsed().body}>
        <span>{parsed().body}</span>
      </Show>
      <For each={parsed().attachments}>{(a) => <AttachmentChip name={a.name} content={a.content} />}</For>
    </>
  );
}

/**
 * 思考过程不展示，只靠状态行告诉作者在干什么。
 * 正文就是这个 agent 说的话：主编的是对作者的回复，子 agent 的是报告，都照常渲染（和 pi 一致，没有"工具之外的正文不算话"）
 */
export function Message(props: { message: UiMessage }) {
  const isUser = () => props.message.role === "user";
  // 只剩空白的正文（状态行摘完留下的换行）也不渲染，不然是一段空白撑开行距
  const visible = () => props.message.parts.filter((p) => p.type !== "thinking" && !(p.type === "text" && !p.text.trim()));
  const stub = () => {
    const p = props.message.parts.find((x) => x.type === "stub");
    return p && p.type === "stub" ? p.label : null;
  };
  // 界面按钮发出的指令只显示一个小标签，不露内部 prompt
  // 批注的桩能点：跳回原处看全文；批注已处理就只剩桩
  const isAnnotation = () => /^批注\d+$/.test(stub() ?? "");
  const alive = () => state.annotations.some((n) => n.label === stub());
  if (stub() !== null) {
    return (
      <div class="flex justify-end px-5 py-1.5">
        <Show
          when={isAnnotation()}
          fallback={
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-paper-3 text-ink-2 text-xs">
              <span class="text-ink-3">▶</span>
              {stub()}
            </span>
          }
        >
          <button
            class={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs ${alive() ? "bg-accent-soft text-ink hover:brightness-95" : "bg-paper-3 text-ink-3"}`}
            title={alive() ? "跳回去看这条批注" : "这条批注已经处理完"}
            onClick={() => actions.jumpToAnnotation(stub() ?? "")}
          >
            <span class="font-serif translate-y-px">❝</span>
            {stub()}
          </button>
        </Show>
      </div>
    );
  }
  // 只有思考、没有可见内容的助手消息不占行，否则一段空白把工具行之间的间距撑得忽宽忽窄
  return (
    <Show when={visible().length > 0}>
    <div class={`flex ${isUser() ? "justify-end px-5 py-1.5" : "justify-start px-5"}`} data-role={props.message.role}>
      <div
        class={
          isUser()
            ? "max-w-[78%] bg-paper-3 text-ink rounded-xl px-4 py-2 whitespace-pre-wrap selectable"
            : "w-full min-w-0"
        }
      >
        <For each={visible()}>
          {(part) => (
            <Switch>
              {/* 主编派活时的阶段标记：提示词本身不露，只留一个小标签说明这轮能不能落盘 */}
              <Match when={part.type === "mode" && part}>
                {(p) => (
                  <div class="mb-1 text-[11px] text-ink-3 select-none" title={p().mode === "propose" ? "这一轮只出候选、不落盘，作者拍板后主编再让它落盘" : "作者已拍板，这一轮可以落盘"}>
                    <span class="mr-1">{p().mode === "propose" ? "◇" : "◆"}</span>
                    {p().mode === "propose" ? "候选阶段" : "落盘阶段"}
                  </div>
                )}
              </Match>
              {/* 作者圈的原话：引用卡排在他自己的话前面，和输入框里看到的是同一张 */}
              <Match when={part.type === "quote" && part}>
                {(p) => (
                  <div class="mb-2 last:mb-0">
                    <QuoteCard from={p().from} text={p().text} />
                  </div>
                )}
              </Match>
              <Match when={part.type === "text" && part}>
                {(p) => (
                  <Show when={isUser()} fallback={<div class="prose-zh py-1.5" innerHTML={renderMarkdown(p().text)} />}>
                    <UserText text={p().text} />
                  </Show>
                )}
              </Match>
              <Match when={part.type === "tool" && part}>{(p) => <ToolCard part={p()} />}</Match>
            </Switch>
          )}
        </For>
      </div>
    </div>
    </Show>
  );
}
