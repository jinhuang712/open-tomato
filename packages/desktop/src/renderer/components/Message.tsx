import type { UiMessage } from "@opentomato/core/protocol";
import { For, Match, Show, Switch } from "solid-js";
import { renderMarkdown } from "../markdown";
import { ToolCard } from "./ToolCard";

/** 思考过程不展示，只靠状态行告诉作者在干什么 */
export function Message(props: { message: UiMessage }) {
  const isUser = () => props.message.role === "user";
  const visible = () => props.message.parts.filter((p) => p.type !== "thinking");
  return (
    <div class={`flex ${isUser() ? "justify-end" : "justify-start"} px-5 py-1.5`}>
      <div
        class={`max-w-[78%] ${
          isUser()
            ? "bg-accent-soft text-ink rounded-2xl rounded-br-md px-4 py-2 whitespace-pre-wrap selectable"
            : "w-full"
        }`}
      >
        <For each={visible()}>
          {(part) => (
            <Switch>
              <Match when={part.type === "text" && part}>
                {(p) => (
                  <Show when={isUser()} fallback={<div class="prose-zh" innerHTML={renderMarkdown(p().text)} />}>
                    <span>{p().text}</span>
                  </Show>
                )}
              </Match>
              <Match when={part.type === "tool" && part}>{(p) => <ToolCard part={p()} />}</Match>
            </Switch>
          )}
        </For>
      </div>
    </div>
  );
}
