import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BrowserWindow, app, clipboard, dialog, ipcMain, shell } from "electron";
import windowStateKeeper from "electron-window-state";
import { KernelHost } from "./kernel";
import { installMenu } from "./menu";

const kernel = new KernelHost();
let mainWindow: BrowserWindow | null = null;
// 用户在退出确认里点了「退出」之后置真：此后 close / before-quit 不再拦，让 app.quit() 一路走完
let quitConfirmed = false;
// 同时只允许一个确认框：连按 ⌘W 或 ⌘Q 不叠弹
let asking = false;

async function confirmAction(win: BrowserWindow | null, message: string, detail: string, okLabel: string) {
  if (asking) return false;
  asking = true;
  try {
    const opts = {
      type: "question" as const,
      buttons: [okLabel, "取消"],
      defaultId: 0,
      cancelId: 1,
      message,
      detail,
    };
    const { response } = win && !win.isDestroyed() ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts);
    return response === 0;
  } finally {
    asking = false;
  }
}

async function requestQuit() {
  const ok = await confirmAction(mainWindow, "退出 OpenTomato？", "正在运行的会话会被中断。", "退出");
  if (!ok) return;
  quitConfirmed = true;
  app.quit();
}

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
  // ⌘W 只收起窗口，App 留在 Dock，点图标再回来；确认过退出的路径直接放行
  win.on("close", (e) => {
    if (quitConfirmed) return;
    e.preventDefault();
    void confirmAction(win, "关闭窗口？", "OpenTomato 会留在 Dock，点击图标即可回到当前会话。", "关闭").then((ok) => {
      if (ok && !win.isDestroyed()) win.hide();
    });
  });
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
        quitConfirmed = true;
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

ipcMain.handle("clipboard:writeText", (_e, text: string) => clipboard.writeText(text));

ipcMain.handle("shell:openPath", (_e, path: string) => shell.openPath(path).then(() => undefined));

ipcMain.handle("dialog:saveText", async (_e, { defaultName, content }: { defaultName: string; content: string }) => {
  if (!mainWindow) return null;
  const r = await dialog.showSaveDialog(mainWindow, {
    title: "导出",
    defaultPath: join(app.getPath("documents"), defaultName),
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });
  if (r.canceled || !r.filePath) return null;
  await writeFile(r.filePath, content, "utf8");
  return r.filePath;
});

app.setName("OpenTomato");

void app.whenReady().then(() => {
  // 打包后图标由 electron-builder 写进 .app；开发态 Dock 显示的是 Electron 默认图标，这里手动换成自家的
  if (!app.isPackaged && process.platform === "darwin") {
    app.dock?.setIcon(join(__dirname, "../../build/icon.png"));
  }
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
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
    else createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ⌘Q / Dock 菜单退出：先问一句，点了「退出」才真走
app.on("before-quit", (e) => {
  if (quitConfirmed) {
    kernel.stop();
    return;
  }
  e.preventDefault();
  void requestQuit();
});
