import { stubPrompt } from "@opentomato/core/protocol";
import { For, Show } from "solid-js";
import { actions, setState, state } from "../state";

interface Quick {
  label: string;
  hint: string;
  run: () => void;
  /** 只有已有历史时才出现 */
  needsHistory?: boolean;
}

const QUICKS: Quick[] = [
  {
    label: "继续",
    hint: "接着上次停下的地方做",
    needsHistory: true,
    run: () =>
      void actions.send(
        stubPrompt("继续", "继续上次的工作。先 project_overview 看一眼现状，用两三句话告诉我停在哪一步、下一步是什么，然后直接接着做。"),
      ),
  },
  {
    label: "现状盘点",
    hint: "进展到哪、还缺什么",
    run: () =>
      void actions.send(stubPrompt("现状盘点", "看一下项目盘面，用三五句话告诉我：进展到哪一步、哪些卡还是空的、下一步建议做什么。先不要动手改。")),
  },
  {
    label: "我有一个新点子",
    hint: "先说给主编听，再决定动不动卡",
    run: () => setState("composerDraft", "我有一个新点子："),
  },
  {
    label: "新会话",
    hint: "清空对话，项目文件不动",
    needsHistory: true,
    run: () => void actions.newChat(),
  },
];

/** 主编空闲时挂在输入框上方的一排快捷按钮，让用户不必每次都靠打字 */
export function QuickActions(props: { hasHistory: boolean }) {
  const idle = () => state.agents.lead?.status !== "running";
  const ready = () => !!state.models?.current;
  return (
    <Show when={idle() && ready()}>
      <div class="px-5 pb-2 flex flex-wrap gap-1.5">
        <For each={QUICKS.filter((q) => !q.needsHistory || props.hasHistory)}>
          {(q) => (
            <button
              class="px-3 py-1 rounded-full border border-line bg-paper-2 hover:border-accent hover:bg-accent-soft text-[12px]"
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
