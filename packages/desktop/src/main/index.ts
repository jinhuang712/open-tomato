import { join } from "node:path";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import windowStateKeeper from "electron-window-state";
import { KernelHost } from "./kernel";
import { installMenu } from "./menu";

const kernel = new KernelHost();
let mainWindow: BrowserWindow | null = null;

function createWindow() {
  const state = windowStateKeeper({ defaultWidth: 1440, defaultHeight: 900 });
  const win = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 1080,
    minHeight: 640,
    title: "OpenTomato",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: "#f6f4ef",
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  state.manage(win);
  win.once("ready-to-show", () => win.show());
  win.on("closed", () => {
    mainWindow = null;
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(join(__dirname, "../renderer/index.html"));

  mainWindow = win;
  kernel.attach(win);
  return win;
}

ipcMain.handle("kernel:request", (_e, { method, params }: { method: string; params: unknown }) =>
  kernel.request(method, params),
);

ipcMain.handle("dialog:pickFolder", async (_e, { title, create }: { title: string; create: boolean }) => {
  if (!mainWindow) return null;
  const r = await dialog.showOpenDialog(mainWindow, {
    title,
    properties: create ? ["openDirectory", "createDirectory"] : ["openDirectory"],
    buttonLabel: create ? "选择这里" : "打开",
  });
  return r.canceled ? null : (r.filePaths[0] ?? null);
});

ipcMain.handle("shell:openPath", (_e, path: string) => shell.openPath(path).then(() => undefined));

app.setName("OpenTomato");

void app.whenReady().then(() => {
  installMenu(() => mainWindow);
  createWindow();
  try {
    kernel.start();
  } catch (e) {
    const message = `内核启动失败：${e instanceof Error ? e.message : String(e)}`;
    console.error(message);
    mainWindow?.webContents.once("did-finish-load", () => {
      mainWindow?.webContents.send("kernel:event", { type: "kernel.error", message });
    });
  }
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => kernel.stop());
