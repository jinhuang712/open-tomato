import type { Bridge } from "../preload/bridge-types";

export const bridge: Bridge = window.bridge;

if (!bridge) {
  throw new Error("window.bridge 不存在：渲染层必须运行在 Electron 里");
}
