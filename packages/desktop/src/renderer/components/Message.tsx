import type { UiMessage } from "@opentomato/core/protocol";
import { For, Match, Show, Switch } from "solid-js";
import { renderMarkdown } from "../markdown";
import { ToolCard } from "./ToolCard";

/** 思考过程不展示，只靠状态行告诉作者在干什么 */
export function Message(props: { message: UiMessage }) {
  const isUser = () => props.message.role === "user";
  const visible = () => props.message.parts.filter((p) => p.type !== "thinking");
  const stub = () => {
    const p = props.message.parts.find((x) => x.type === "stub");
    return p && p.type === "stub" ? p.label : null;
  };
  // 界面按钮发出的指令只显示一个小标签，不露内部 prompt
  if (stub() !== null) {
    return (
      <div class="flex justify-end px-5 py-1.5">
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-paper-3 text-ink-2 text-xs">
          <span class="text-ink-3">▶</span>
          {stub()}
        </span>
      </div>
    );
  }
  return (
    <div class={`flex ${isUser() ? "justify-end" : "justify-start"} px-5 py-1.5`}>
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
