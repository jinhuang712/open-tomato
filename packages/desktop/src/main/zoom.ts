import type { BrowserWindow } from "electron";

/**
 * 界面缩放跟着窗口走：以 1440×900 的设计尺寸为 1 倍，窗口越大整体越大，最多 1.8 倍，不缩小。
 * 用户按 ⌘+/⌘- 是在这个基准上叠加档位（每档 1.2 倍，和浏览器一致），⌘0 只清掉叠加档，不回到 13px。
 */
const DESIGN_WIDTH = 1440;
const DESIGN_HEIGHT = 900;
const MAX_BASE = 1.8;
const STEP = 1.2;
const MIN_OFFSET = -3;
const MAX_OFFSET = 4;

let offset = 0;

function baseFor(win: BrowserWindow) {
  const [w = DESIGN_WIDTH, h = DESIGN_HEIGHT] = win.getContentSize();
  const fit = Math.min(w / DESIGN_WIDTH, h / DESIGN_HEIGHT);
  return Math.min(MAX_BASE, Math.max(1, fit));
}

export function applyZoom(win: BrowserWindow) {
  if (win.isDestroyed()) return;
  const factor = baseFor(win) * Math.pow(STEP, offset);
  win.webContents.setZoomFactor(Number(factor.toFixed(3)));
}

export function adjustZoom(win: BrowserWindow, delta: number) {
  offset = Math.min(MAX_OFFSET, Math.max(MIN_OFFSET, offset + delta));
  applyZoom(win);
}

export function resetZoom(win: BrowserWindow) {
  offset = 0;
  applyZoom(win);
}

/** 窗口一建好就挂上：改尺寸时重算，每次页面载入完也重设一遍（导航会把 zoomFactor 还原） */
export function watchZoom(win: BrowserWindow) {
  win.on("resize", () => applyZoom(win));
  win.webContents.on("did-finish-load", () => applyZoom(win));
  applyZoom(win);
}
