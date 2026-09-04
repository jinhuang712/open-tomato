import type { KernelEvent, RequestMap, RequestMethod } from "@opentomato/core/protocol";

export type MenuCommand =
  | "project.new"
  | "project.open"
  | "project.close"
  | "chat.new"
  | "project.exportSeed"
  | "chat.copyPath"
  | "cloud.upload"
  | "settings.open";

/** 设置页「存储 / 关于」要展示的本机信息，全部由 main 进程直接给，不经内核 */
export interface AppInfo {
  version: string;
  electron: string;
  chrome: string;
  node: string;
  /** Electron userData，内核的 OPENTOMATO_HOME */
  home: string;
  /** pi 的配置目录，凭据与自定义 provider 在这里 */
  piAgentDir: string;
  logsDir: string;
}

export interface Bridge {
  appInfo(): Promise<AppInfo>;
  /** 在 Finder 里选中这个路径 */
  showInFolder(path: string): Promise<void>;
  request<M extends RequestMethod>(method: M, params: RequestMap[M]["params"]): Promise<RequestMap[M]["result"]>;
  onEvent(listener: (event: KernelEvent) => void): () => void;
  onMenu(listener: (command: MenuCommand) => void): () => void;
  pickFolder(options: { title: string; create: boolean }): Promise<string | null>;
  openPath(path: string): Promise<void>;
  /** 弹保存对话框写一个 markdown 文件，返回落盘路径；用户取消返回 null */
  saveTextFile(options: { defaultName: string; content: string }): Promise<string | null>;
  /** 写系统剪贴板 */
  copyText(text: string): Promise<void>;
  /** 弹确认框后把项目文件夹移到系统废纸篓；用户取消返回 false */
  trashProject(root: string): Promise<boolean>;
  platform: string;
  /** 开发钩子：OPENTOMATO_OPEN_PROJECT 指定启动即打开的项目 */
  initialProject: string | null;
}

declare global {
  interface Window {
    bridge: Bridge;
  }
}
