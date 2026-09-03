import { stubPrompt } from "@opentomato/core/protocol";
import { createMemo, For, Show } from "solid-js";
import { actions, setState, state } from "../state";
import { stagePlan } from "../stage";
import { runStep } from "./EmptyStart";

interface Quick {
  label: string;
  hint: string;
  run: () => void;
  /** 高亮：这是此刻最顺手的下一步 */
  primary?: boolean;
}

/** 对话超过这么多条，「新会话」就开始劝你清一清 */
const LONG_CHAT = 40;

/**
 * 主编空闲时挂在输入框上方的一排快捷按钮。
 * 按钮的名字、提示和发出去的话都随现状变：上次是不是被打断、项目走到哪个阶段、对话有多长。
 */
export function QuickActions(props: { hasHistory: boolean }) {
  const idle = () => state.agents.lead?.status !== "running";
  const ready = () => !!state.models?.current;
  const plan = createMemo(() => stagePlan(state.docs));
  const interrupted = () => !!state.interruptedAfter.lead;
  const chatLen = () => state.transcripts.lead?.length ?? 0;

  const quicks = createMemo<Quick[]>(() => {
    const p = plan();
    const next = p.steps.find((s) => s.primary);
    const list: Quick[] = [];

    if (props.hasHistory) {
      list.push(
        interrupted()
          ? {
              label: "接着上次",
              hint: "上次没收尾，从断点接着做",
              primary: true,
              run: () =>
                void actions.send(
                  stubPrompt(
                    "接着上次",
                    `上次会话没有正常收尾。现状：${p.line}先 project_overview 核对一下，用两三句话告诉我断在哪一步、有没有做了一半的事，然后从断点接着做。`,
                  ),
                ),
            }
          : {
              label: "继续",
              hint: `${p.stage}阶段，接着往下推`,
              run: () =>
                void actions.send(
                  stubPrompt("继续", `继续上次的工作。现状：${p.line}先 project_overview 核对，用两三句话告诉我停在哪一步、下一步是什么，然后直接接着做。`),
                ),
            },
      );
    }

    if (next && props.hasHistory && !interrupted()) {
      list.push({ label: next.title, hint: next.desc, primary: true, run: () => runStep(next) });
    }

    list.push({
      label: "现状盘点",
      hint: `${p.stage}阶段 · 进展到哪、还缺什么`,
      run: () =>
        void actions.send(stubPrompt("现状盘点", "看一下项目盘面，用三五句话告诉我：进展到哪一步、哪些卡还是空的、下一步建议做什么。先不要动手改。")),
    });

    list.push({
      label: "我有一个新点子",
      hint: p.stage === "立项" ? "还没成形也行，主编边聊边记" : "先说给主编听，再决定动不动卡",
      run: () => setState("composerDraft", "我有一个新点子："),
    });

    if (props.hasHistory) {
      const long = chatLen() >= LONG_CHAT;
      list.push({
        label: "新会话",
        hint: long ? `对话已有 ${chatLen()} 条，清一清主编更清醒；项目文件不动` : "清空对话，项目文件不动",
        run: () => void actions.newChat(),
      });
    }
    return list;
  });

  return (
    <Show when={idle() && ready()}>
      <div class="px-5 pb-2 flex flex-wrap gap-1.5">
        <For each={quicks()}>
          {(q) => (
            <button
              class="h-7 px-3 rounded-md border text-xs hover:border-ink-3 hover:text-ink"
              classList={{
                "border-line-2 text-ink": !!q.primary,
                "border-line text-ink-2": !q.primary,
              }}
              title={q.hint}
              onClick={q.run}
            >
              {q.label}
            </button>
          )}
        </For>
      </div>
    </Show>
  );
}
