import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { app, nativeTheme } from "electron";
import type { ThemeSource } from "../preload/bridge-types";

/**
 * 界面主题：跟系统 / 浅色 / 深色。渲染层的颜色全是 light-dark() token，只认 prefers-color-scheme，
 * 所以这里只要设 nativeTheme.themeSource，整套颜色自己会切，渲染层不用知道主题这回事。
 * 这是这台机器的偏好，不是这本书的，存 userData/theme.json，不进项目、不经内核。
 */
const SOURCES: readonly ThemeSource[] = ["system", "light", "dark"];
const isSource = (v: unknown): v is ThemeSource => typeof v === "string" && (SOURCES as readonly string[]).includes(v);

const file = () => join(app.getPath("userData"), "theme.json");

export function loadTheme(): ThemeSource {
  try {
    const v = (JSON.parse(readFileSync(file(), "utf8")) as { source?: unknown }).source;
    return isSource(v) ? v : "system";
  } catch {
    return "system";
  }
}

export function currentTheme(): ThemeSource {
  return nativeTheme.themeSource;
}

export function applyTheme(source: ThemeSource) {
  nativeTheme.themeSource = source;
}

export function saveTheme(source: ThemeSource) {
  applyTheme(source);
  try {
    mkdirSync(dirname(file()), { recursive: true });
    writeFileSync(file(), `${JSON.stringify({ source }, null, 2)}\n`, "utf8");
  } catch {
    // 写不进去就只在这次运行里生效
  }
}

/** 窗口底色跟主题走：和 styles.css 的 --color-paper 同一组值，首帧不闪白 */
export function paperColor(): string {
  return nativeTheme.shouldUseDarkColors ? "#131314" : "#f7f7f6";
}
