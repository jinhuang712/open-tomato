import type { MenuCommand } from "../preload/bridge-types";

/**
 * 快捷键单源。三处消费：
 * - main/menu.ts 从带 menuCommand 的条目生成 Electron accelerator（真正的系统级按键）
 * - 渲染层各组件的 kbd 提示文字从这里取，不再手写符号
 * - 设置页「快捷键」分组按 scope 整表展示
 * editor / panel 两类是渲染层 DOM keydown 判定的，窗口失焦不生效；判定逻辑仍在各组件里，这里只登记。
 */
export type KeyScope = "global" | "editor" | "panel";

export interface KeyBinding {
  id: string;
  label: string;
  scope: KeyScope;
  /** Electron accelerator 语法；多个等价键并列 */
  keys: string[];
  /** 生效条件补充，展示在设置页 */
  note?: string;
  /** 有则由应用菜单注册，点击经 menu:command 转发 */
  menuCommand?: MenuCommand;
}

export const SCOPES: KeyScope[] = ["global", "editor", "panel"];

export const SCOPE_LABEL: Record<KeyScope, { title: string; hint: string }> = {
  global: { title: "全局", hint: "窗口在前台时任何位置都生效" },
  editor: { title: "输入框", hint: "光标在对话输入框里时生效" },
  panel: { title: "面板", hint: "对应面板打开时生效" },
};

export const KEYMAP: KeyBinding[] = [
  { id: "project.new", label: "新建项目", scope: "global", keys: ["CmdOrCtrl+N"], menuCommand: "project.new" },
  { id: "project.open", label: "打开项目", scope: "global", keys: ["CmdOrCtrl+O"], menuCommand: "project.open" },
  { id: "chat.new", label: "新会话", scope: "global", keys: ["CmdOrCtrl+Shift+N"], menuCommand: "chat.new" },
  { id: "chat.copyPath", label: "复制会话路径", scope: "global", keys: ["CmdOrCtrl+Shift+E"], note: "开发用", menuCommand: "chat.copyPath" },
  { id: "settings.open", label: "设置", scope: "global", keys: ["CmdOrCtrl+,"], menuCommand: "settings.open" },
  { id: "search.open", label: "搜索", scope: "global", keys: ["CmdOrCtrl+K", "CmdOrCtrl+P"], note: "已打开项目时" },

  { id: "composer.send", label: "发送 / 排队", scope: "editor", keys: ["CmdOrCtrl+Enter"], note: "agent 跑着时排队，等这轮做完再送；排队里每条都能单独「打断它」或「取消」" },
  { id: "composer.insert", label: "打断它", scope: "editor", keys: ["CmdOrCtrl+Shift+Enter"], note: "agent 跑着时不排队，当前这步工具结束后就送到；送出去就撤不回" },
  { id: "composer.pause", label: "暂停 / 停止", scope: "editor", keys: ["CmdOrCtrl+."], note: "第一次让它收尾这一步停下来，再按一次立刻掐断" },
  { id: "composer.stop", label: "停止", scope: "editor", keys: ["CmdOrCtrl+Shift+."], note: "agent 跑着时，立刻掐断" },

  { id: "doc.edit", label: "编辑这张卡", scope: "panel", keys: ["CmdOrCtrl+E"], note: "卡片打开着、还在预览时" },
  { id: "doc.save", label: "保存并回到预览", scope: "panel", keys: ["CmdOrCtrl+S"], note: "卡片编辑模式里" },
  { id: "review.approve", label: "审阅通过 / 确认拒绝", scope: "panel", keys: ["CmdOrCtrl+Enter"], note: "审阅视图：没写理由时是通过，一旦圈了批注或开始写理由就是拒绝" },
  { id: "question.submit", label: "提交回答", scope: "panel", keys: ["CmdOrCtrl+Enter"], note: "问答卡" },
  { id: "search.move", label: "上下选择", scope: "panel", keys: ["Up", "Down"], note: "搜索面板" },
  { id: "search.pick", label: "打开选中项", scope: "panel", keys: ["Enter"], note: "搜索面板" },
  { id: "panel.close", label: "退一层", scope: "panel", keys: ["Escape"], note: "先关最上面的浮层（搜索、审阅、设置…），卡片在编辑模式时先退出编辑，都没有时从文档 / 子 agent 会话退回主会话" },
];

export function binding(id: string): KeyBinding {
  const b = KEYMAP.find((k) => k.id === id);
  if (!b) throw new Error(`keymap 里没有 ${id}`);
  return b;
}

const SYMBOL: Record<string, string> = {
  Enter: "↩",
  Return: "↩",
  Escape: "Esc",
  Esc: "Esc",
  Up: "↑",
  Down: "↓",
  Left: "←",
  Right: "→",
  Backspace: "⌫",
  Delete: "⌦",
  Tab: "⇥",
  Space: "␣",
};

/** accelerator → macOS 符号串，修饰键按系统惯例排 ⌃⌥⇧⌘ */
export function formatKeys(accelerator: string): string {
  let ctrl = false;
  let alt = false;
  let shift = false;
  let cmd = false;
  let key = "";
  for (const p of accelerator.split("+")) {
    switch (p) {
      case "CmdOrCtrl":
      case "CommandOrControl":
      case "Cmd":
      case "Command":
      case "Super":
        cmd = true;
        break;
      case "Ctrl":
      case "Control":
        ctrl = true;
        break;
      case "Alt":
      case "Option":
        alt = true;
        break;
      case "Shift":
        shift = true;
        break;
      default:
        key = SYMBOL[p] ?? p.toUpperCase();
    }
  }
  return `${ctrl ? "⌃" : ""}${alt ? "⌥" : ""}${shift ? "⇧" : ""}${cmd ? "⌘" : ""}${key}`;
}

/** 第一个等价键的符号串，给按钮上的 kbd 提示用 */
export function keyHint(id: string): string {
  return formatKeys(binding(id).keys[0]!);
}
