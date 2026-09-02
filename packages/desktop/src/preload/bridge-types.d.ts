import type { KernelEvent, RequestMap, RequestMethod } from "@opentomato/core/protocol";

export type MenuCommand = "project.new" | "project.open" | "chat.new" | "check.run";

export interface Bridge {
  request<M extends RequestMethod>(method: M, params: RequestMap[M]["params"]): Promise<RequestMap[M]["result"]>;
  onEvent(listener: (event: KernelEvent) => void): () => void;
  onMenu(listener: (command: MenuCommand) => void): () => void;
  pickFolder(options: { title: string; create: boolean }): Promise<string | null>;
  openPath(path: string): Promise<void>;
  platform: string;
  /** 开发钩子：OPENTOMATO_OPEN_PROJECT 指定启动即打开的项目 */
  initialProject: string | null;
}

declare global {
  interface Window {
    bridge: Bridge;
  }
}
