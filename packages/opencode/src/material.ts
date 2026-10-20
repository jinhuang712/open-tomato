import { pluginText as textValue } from "./text.ts";
import path from "node:path";
import {
  DOC_KIND_IDS,
  DOC_KINDS,
  zhDir,
  type DocKindId,
  type ProjectStore,
} from "@opentomato/core/headless";

/** 一份材料在磁盘上的位置：rel 是项目内的规范相对路径（目录/名字.md） */
export interface Material {
  kind: DocKindId;
  id: string;
  rel: string;
  abs: string;
}

const LAYOUT =
  textValue("material.LAYOUT");

/**
 * 把 write / edit 的 path 认成一份材料，按 core 的规则规范化 id（章纲/1.md → 章纲/0001.md）。
 * 不是材料就抛错：写作角色只写材料，不碰项目里的其他文件，也不出项目。
 * creating 时，自动编号的类型（守则）文件名里没有数字就分配下一个编号。
 */
export async function resolveMaterial(
  store: ProjectStore,
  input: string,
  creating: boolean,
): Promise<Material> {
  const root = store.info.root;
  const rel = path.relative(root, path.resolve(root, input)).split(path.sep).join("/");
  const parts = rel.split("/");
  const name = parts.at(-1) ?? "";
  if (rel.startsWith("..") || path.isAbsolute(rel) || parts.length > 2 || !name.endsWith(".md")) {
    throw new Error(textValue("material.message", { v0: LAYOUT, v1: input }));
  }
  const kind =
    parts.length === 1
      ? DOC_KIND_IDS.find((k) => DOC_KINDS[k].singleton && store.relPath(k, "") === rel)
      : DOC_KIND_IDS.find((k) => !DOC_KINDS[k].singleton && DOC_KINDS[k].dir === parts[0]);
  if (!kind) throw new Error(textValue("material.message", { v0: LAYOUT, v1: input }));
  const raw = name.slice(0, -".md".length);
  const id =
    DOC_KINDS[kind].autoId && creating && !/\d/.test(raw)
      ? await store.nextId(kind)
      : normalize(store, kind, raw, input);
  return { kind, id, rel: store.relPath(kind, id), abs: store.absPath(kind, id) };
}

function normalize(store: ProjectStore, kind: DocKindId, raw: string, input: string): string {
  try {
    return store.normalizeId(kind, raw);
  } catch {
    throw new Error(textValue("material.message_2", { v0: input, v1: zhDir(kind) }));
  }
}
