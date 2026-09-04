import { Show } from "solid-js";
import { actions, state } from "../state";
import { AgentBadge, subAgentCount } from "./AgentBadge";

/** 有多少个会动的徽章：「等你拍板」+ 子 agent。为 0 时整行不用留位 */
export const pendingCount = () => state.questions.length + state.approvals.length;
export const liveBadgeCount = () => (pendingCount() > 0 ? 1 : 0) + (subAgentCount() > 0 ? 1 : 0);

/**
 * 会动的徽章不放顶栏：顶栏右侧只留云端和模型两个静态项，这样它们永远不会被挤得折行。
 * 这一组钉在会话区左上角（看文档时在文档头部），跟右边的「暂停」同一行。
 */
export function LiveBadges(props: { row?: boolean }) {
  // 会话区里一个一行竖着排，各自能对齐左沿；文档头部那条是单行工具栏，只能横着
  return (
    <div class={`flex gap-1 text-xs whitespace-nowrap ${props.row ? "flex-row items-center" : "flex-col items-start"}`}>
      <Show when={pendingCount() > 0}>
        <button class="h-6.5 px-2.5 rounded-md bg-warn-soft text-warn font-medium hover:brightness-110 shrink-0" onClick={() => actions.openChat("director")}>
          {pendingCount()} 项等你拍板
        </button>
      </Show>
      <AgentBadge />
    </div>
  );
}
