import { writeFile } from "node:fs/promises";
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
  // 渲染层任何外链（模型回复里的 [x](url)、搜索结果）都交给系统浏览器，主窗口不许离开 App 页面
  const openOutside = (url: string) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
  };
  win.webContents.setWindowOpenHandler(({ url }) => {
    openOutside(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (url === win.webContents.getURL()) return;
    e.preventDefault();
    openOutside(url);
  });

  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(join(__dirname, "../renderer/index.html"));

  // 开发钩子：OPENTOMATO_SCREENSHOT=/path.png 时，载入后延时截一张图再退出，给无头验证 UI 用
  const shot = process.env.OPENTOMATO_SCREENSHOT;
  if (shot) {
    win.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        const image = await win.webContents.capturePage();
        await writeFile(shot, image.toPNG());
        app.quit();
      }, Number(process.env.OPENTOMATO_SCREENSHOT_DELAY ?? 2500));
    });
  }

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

ipcMain.handle("dialog:saveText", async (_e, { defaultName, content }: { defaultName: string; content: string }) => {
  if (!mainWindow) return null;
  const r = await dialog.showSaveDialog(mainWindow, {
    title: "导出",
    defaultPath: join(app.getPath("documents"), defaultName),
    filters: [{ name: "JSON Lines", extensions: ["jsonl"] }],
  });
  if (r.canceled || !r.filePath) return null;
  await writeFile(r.filePath, content, "utf8");
  return r.filePath;
});

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
