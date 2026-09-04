import type { KernelEvent, RequestMap, RequestMethod } from "@opentomato/core/protocol";

export type MenuCommand = "project.new" | "project.open" | "chat.new" | "check.run" | "chat.export" | "chat.copyPath";

export interface Bridge {
  request<M extends RequestMethod>(method: M, params: RequestMap[M]["params"]): Promise<RequestMap[M]["result"]>;
  onEvent(listener: (event: KernelEvent) => void): () => void;
  onMenu(listener: (command: MenuCommand) => void): () => void;
  pickFolder(options: { title: string; create: boolean }): Promise<string | null>;
  openPath(path: string): Promise<void>;
  /** 弹保存对话框写一个文本文件，返回落盘路径；用户取消返回 null */
  saveTextFile(options: { defaultName: string; content: string }): Promise<string | null>;
  /** 写系统剪贴板 */
  copyText(text: string): Promise<void>;
  platform: string;
  /** 开发钩子：OPENTOMATO_OPEN_PROJECT 指定启动即打开的项目 */
  initialProject: string | null;
}

declare global {
  interface Window {
    bridge: Bridge;
  }
}
