import { contextBridge, ipcRenderer } from "electron";
import type { Bridge } from "./bridge-types";

const bridge: Bridge = {
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
  saveTextFile: (options) => ipcRenderer.invoke("dialog:saveText", options),
  copyText: (text) => ipcRenderer.invoke("clipboard:writeText", text),
  platform: process.platform,
  initialProject: process.env.OPENTOMATO_OPEN_PROJECT ?? null,
};

contextBridge.exposeInMainWorld("bridge", bridge);
