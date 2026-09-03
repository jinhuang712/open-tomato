import { promises as fs } from "node:fs";
import path from "node:path";
import type { ThinkingLevel } from "../protocol.js";

/**
 * 项目级设置，落在 <root>/.opentomato/settings.json，随项目进 git。
 * 全局 ~/.opentomato/state.json 记的是"上次用的"；这里记的是"这本书固定用的"，
 * 打开项目时以这里为准，没写的字段退回全局。
 */
export interface ProjectSettings {
  /** 默认模型；null 表示未指定，沿用全局选择 */
  model: { provider: string; id: string } | null;
  /** 默认思考档；undefined 表示沿用全局 */
  thinkingLevel?: ThinkingLevel;
}

export const SETTINGS_FILE = "settings.json";
const THINKING_LEVELS: readonly ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

export function settingsPath(root: string, markerDir: string): string {
  return path.join(root, markerDir, SETTINGS_FILE);
}

/** 文件不存在或坏掉都当空设置，不让一个手改坏的 json 挡住打开项目 */
export async function readProjectSettings(file: string): Promise<ProjectSettings> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return normalize(JSON.parse(raw));
  } catch {
    return { model: null };
  }
}

/** 只改传入的字段，其余保留；写完返回合并后的结果 */
export async function writeProjectSettings(file: string, patch: Partial<ProjectSettings>): Promise<ProjectSettings> {
  const current = await readProjectSettings(file);
  const next: ProjectSettings = normalize({ ...current, ...patch });
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

function normalize(input: unknown): ProjectSettings {
  const obj = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const out: ProjectSettings = { model: null };
  const m = obj.model as Record<string, unknown> | null | undefined;
  if (m && typeof m.provider === "string" && typeof m.id === "string" && m.provider && m.id) {
    out.model = { provider: m.provider, id: m.id };
  }
  if (typeof obj.thinkingLevel === "string" && (THINKING_LEVELS as readonly string[]).includes(obj.thinkingLevel)) {
    out.thinkingLevel = obj.thinkingLevel as ThinkingLevel;
  }
  return out;
}
