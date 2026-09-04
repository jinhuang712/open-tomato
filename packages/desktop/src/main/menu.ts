import { app, type BrowserWindow, Menu, type MenuItemConstructorOptions, shell } from "electron";
import type { MenuCommand } from "../preload/bridge-types";

export function installMenu(getWindow: () => BrowserWindow | null) {
  const send = (command: MenuCommand) => () => getWindow()?.webContents.send("menu:command", command);

  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: "about", label: `关于 ${app.name}` },
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
        { label: "新建项目…", accelerator: "CmdOrCtrl+N", click: send("project.new") },
        { label: "打开项目…", accelerator: "CmdOrCtrl+O", click: send("project.open") },
        { type: "separator" },
        { label: "新会话", accelerator: "CmdOrCtrl+Shift+N", click: send("chat.new") },
        { label: "一致性机检", accelerator: "CmdOrCtrl+Shift+K", click: send("check.run") },
        { type: "separator" },
        { label: "导出故事种子…", accelerator: "CmdOrCtrl+E", click: send("project.exportSeed") },
        { label: "复制会话路径 [dev]", accelerator: "CmdOrCtrl+Shift+E", click: send("chat.copyPath") },
        { type: "separator" },
        { role: "close", label: "关闭窗口" },
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
