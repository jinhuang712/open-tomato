import type { UiMessage } from "@opentomato/core/protocol";
import { createSignal, For, Match, Show, Switch } from "solid-js";
import { renderMarkdown } from "../markdown";
import { ToolCard } from "./ToolCard";

function Thinking(props: { text: string }) {
  const [open, setOpen] = createSignal(false);
  return (
    <div class="my-1 text-[12px]">
      <button class="text-ink-3 hover:text-ink-2" onClick={() => setOpen(!open())}>
        {open() ? "▾" : "▸"} 思考过程
      </button>
      <Show when={open()}>
        <div class="mt-1 pl-3 border-l-2 border-line text-ink-2 whitespace-pre-wrap selectable">{props.text}</div>
      </Show>
    </div>
  );
}

export function Message(props: { message: UiMessage }) {
  const isUser = () => props.message.role === "user";
  return (
    <div class={`flex ${isUser() ? "justify-end" : "justify-start"} px-5 py-1.5`}>
      <div
        class={`max-w-[78%] ${
          isUser()
            ? "bg-accent-soft text-ink rounded-2xl rounded-br-md px-4 py-2 whitespace-pre-wrap selectable"
            : "w-full"
        }`}
      >
        <For each={props.message.parts}>
          {(part) => (
            <Switch>
              <Match when={part.type === "text" && part}>
                {(p) => (
                  <Show when={isUser()} fallback={<div class="prose-zh" innerHTML={renderMarkdown(p().text)} />}>
                    <span>{p().text}</span>
                  </Show>
                )}
              </Match>
              <Match when={part.type === "thinking" && part}>{(p) => <Thinking text={p().text} />}</Match>
              <Match when={part.type === "tool" && part}>{(p) => <ToolCard part={p()} />}</Match>
            </Switch>
          )}
        </For>
      </div>
    </div>
  );
}
