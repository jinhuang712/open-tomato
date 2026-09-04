import { actions, setState, state } from "./state";

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
  if (v.type === "doc" || (v.type === "chat" && v.agentId !== "lead")) {
    actions.openChat("lead");
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
