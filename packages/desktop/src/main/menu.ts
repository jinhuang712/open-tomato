import { app, type BrowserWindow, Menu, type MenuItemConstructorOptions, shell } from "electron";
import type { MenuCommand } from "../preload/bridge-types";
import { binding } from "../shared/keymap";

export function installMenu(getWindow: () => BrowserWindow | null) {
  const send = (command: MenuCommand) => () => getWindow()?.webContents.send("menu:command", command);
  // 带快捷键的菜单项：按键从 keymap 单源取，菜单栏和设置页展示的永远是同一份
  const item = (id: string, label: string): MenuItemConstructorOptions => {
    const b = binding(id);
    return { label, accelerator: b.keys[0]!, click: send(b.menuCommand!) };
  };

  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: "about", label: `关于 ${app.name}` },
        { type: "separator" },
        item("settings.open", "设置…"),
        { type: "separator" },
        { role: "services", label: "服务" },
        { type: "separator" },
        { role: "hide", label: `隐藏 ${app.name}` },
        { role: "hideOthers", label: "隐藏其他" },
        { role: "unhide", label: "全部显示" },
        { type: "separator" },
        { role: "quit", label: `退出 ${app.name}` },
      ],
    },
    {
      label: "文件",
      submenu: [
        item("project.new", "新建项目…"),
        item("project.open", "打开项目…"),
        { type: "separator" },
        item("chat.new", "新会话"),
        { type: "separator" },
        item("project.exportSeed", "导出故事种子…"),
        item("chat.copyPath", "复制会话路径 [dev]"),
        { type: "separator" },
        { label: "同步到云端", accelerator: "CmdOrCtrl+S", click: send("cloud.upload") },
        { type: "separator" },
        { label: "关闭项目", accelerator: "CmdOrCtrl+W", click: send("project.close") },
        { role: "close", label: "关闭窗口", accelerator: "CmdOrCtrl+Shift+W" },
      ],
    },
    {
      label: "编辑",
      submenu: [
        { role: "undo", label: "撤销" },
        { role: "redo", label: "重做" },
        { type: "separator" },
        { role: "cut", label: "剪切" },
        { role: "copy", label: "拷贝" },
        { role: "paste", label: "粘贴" },
        { role: "selectAll", label: "全选" },
      ],
    },
    {
      label: "视图",
      submenu: [
        { role: "reload", label: "重新载入" },
        { role: "toggleDevTools", label: "开发者工具" },
        { type: "separator" },
        { role: "resetZoom", label: "实际大小" },
        { role: "zoomIn", label: "放大" },
        { role: "zoomOut", label: "缩小" },
        { type: "separator" },
        { role: "togglefullscreen", label: "全屏" },
      ],
    },
    {
      label: "窗口",
      role: "windowMenu",
      submenu: [
        { role: "minimize", label: "最小化" },
        { role: "zoom", label: "缩放" },
        { type: "separator" },
        { role: "front", label: "全部置于顶层" },
      ],
    },
    {
      label: "帮助",
      role: "help",
      submenu: [
        {
          label: "pi 模型提供方文档",
          click: () => void shell.openExternal("https://github.com/badlogic/pi-mono"),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
