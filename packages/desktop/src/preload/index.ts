import { contextBridge, ipcRenderer } from "electron";
import type { Bridge } from "./bridge-types";

const bridge: Bridge = {
  appInfo: () => ipcRenderer.invoke("app:info"),
  showInFolder: (path) => ipcRenderer.invoke("shell:showInFolder", path),
  request: (method, params) => ipcRenderer.invoke("kernel:request", { method, params }),
  onEvent: (listener) => {
    const handler = (_e: unknown, event: Parameters<typeof listener>[0]) => listener(event);
    ipcRenderer.on("kernel:event", handler);
    return () => ipcRenderer.removeListener("kernel:event", handler);
  },
  onMenu: (listener) => {
    const handler = (_e: unknown, command: Parameters<typeof listener>[0]) => listener(command);
    ipcRenderer.on("menu:command", handler);
    return () => ipcRenderer.removeListener("menu:command", handler);
  },
  pickFolder: (options) => ipcRenderer.invoke("dialog:pickFolder", options),
  openPath: (path) => ipcRenderer.invoke("shell:openPath", path),
  pickTextFiles: () => ipcRenderer.invoke("dialog:pickTextFiles"),
  readClipboardTextFiles: () => ipcRenderer.invoke("clipboard:readTextFiles"),
  saveTextFile: (options) => ipcRenderer.invoke("dialog:saveText", options),
  copyText: (text) => ipcRenderer.invoke("clipboard:writeText", text),
  trashProject: (root, options) => ipcRenderer.invoke("shell:trashProject", root, options),
  confirm: (options) => ipcRenderer.invoke("dialog:confirm", options),
  platform: process.platform,
  initialProject: process.env.OPENTOMATO_OPEN_PROJECT ?? null,
};

contextBridge.exposeInMainWorld("bridge", bridge);
