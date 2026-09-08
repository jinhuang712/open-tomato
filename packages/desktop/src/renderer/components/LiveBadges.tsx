import { Show } from "solid-js";
import { actions, state } from "../state";

/** 一共有多少件等作者拍板的：待答 + 待审。为 0 时整行不用留位 */
export const pendingCount = () => state.questions.length + state.approvals.length;

/**
 * 会动的徽章不放顶栏：顶栏右侧只留云端和模型两个静态项，这样它们永远不会被挤得折行。
 * 只在看文档时用：那儿看不见对话，也看不见左沿名单，得有个东西喊一声。
 * 在对话里「谁在等你拍板」写在左沿名单那一行上（AgentStrip），不在正文顶上另挂一个。
 */
export function LiveBadges() {
  // 文档头部那条是单行工具栏，只能横着
  return (
    <div class="flex flex-row items-center gap-1 text-xs whitespace-nowrap">
      <Show when={pendingCount() > 0}>
        <button class="h-6.5 px-2.5 rounded-md bg-warn-soft text-warn font-medium hover:brightness-110 shrink-0" onClick={() => actions.openChat("director")}>
          {pendingCount()} 项等你拍板
        </button>
      </Show>
    </div>
  );
}
