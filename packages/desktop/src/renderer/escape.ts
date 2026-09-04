import { onCleanup } from "solid-js";
import { actions, setState, state } from "./state";

type Closer = () => boolean;
const closers: Closer[] = [];

/**
 * 组件内自己持有开合状态的轻量层（下拉、气泡）在挂载时登记：
 * 回调开着就关掉并返回 true，没开返回 false 让全局继续往下判。
 * 在组件 setup 里调用，随组件卸载自动注销。
 */
export function registerEscape(close: Closer): void {
  closers.push(close);
  onCleanup(() => {
    const i = closers.indexOf(close);
    if (i >= 0) closers.splice(i, 1);
  });
}

/**
 * Escape 的唯一裁决点：每按一次只退一层，从最上面的浮层开始，
 * 浮层都关完了再退二级视图（文档 / 子 agent 会话），回到主编的主会话就停。
 *
 * 局部想自己吃掉 Escape（搜索框里清选中、拒绝原因框退回按钮态、文档编辑态取消），
 * 在自己的 onKeyDown 里处理完调 preventDefault，这里看到 defaultPrevented 就不再动。
 *
 * 返回 true 表示这次按键被消费了。
 */
export function escapeOneLevel(): boolean {
  // 0. 本地登记的轻量层（顶栏下拉这类组件内 signal，全局 store 看不见），后登记的先问
  for (const close of [...closers].reverse()) if (close()) return true;

  // 1. 浮层：越靠前的越可能叠在最上面（关闭确认 > 审阅 > 表单类弹窗 > 设置 / 搜索）
  if (state.closePromptOpen) return (setState("closePromptOpen", false), true);
  if (state.reviewOpen) return (setState("reviewOpen", null), true);
  if (state.capabilityDialog) return (setState("capabilityDialog", null), true);
  if (state.cloudSettingsOpen) return (setState("cloudSettingsOpen", false), true);
  if (state.modelPickerOpen) return (setState("modelPickerOpen", false), true);
  if (state.settingsOpen) return (setState("settingsOpen", false), true);
  if (state.searchOpen) return (setState("searchOpen", false), true);

  // 2. 二级视图：文档、子 agent 会话，都回主编的主会话
  if (!state.project) return false;
  const v = state.view;
  if (v.type === "doc" || (v.type === "chat" && v.agentId !== "director")) {
    actions.openChat("director");
    return true;
  }
  return false;
}

/** 挂到 document 上；返回卸载函数 */
export function installEscapeHandler(): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || e.defaultPrevented || e.isComposing) return;
    if (escapeOneLevel()) e.preventDefault();
  };
  document.addEventListener("keydown", onKey);
  return () => document.removeEventListener("keydown", onKey);
}
