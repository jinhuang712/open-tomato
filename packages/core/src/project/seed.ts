import type { DocKindId } from "../protocol.js";
import { DOC_KINDS } from "./kinds.js";
import type { ProjectStore } from "./store.js";

/**
 * 导出顺序：先交代这是什么书、写作守则，再世界 → 人物 → 线索 → 里程碑 → 卷纲 → 章纲 → 正文，
 * 读的人（尤其是主编）按这个顺序一路往下就能重建全书脉络。
 */
export const SEED_KIND_ORDER: DocKindId[] = ["brief", "rules", "world", "characters", "threads", "milestones", "volumes", "chapters", "manuscript"];

/**
 * 把项目里所有文档拼成一份「故事种子」markdown：
 * - 每篇一个 H1，格式 `# <类型> · <id> · <标题>`（简介这类单例不带 id），正文原样接在后面
 * - frontmatter 一律剥掉，设置文件不进来；重新导入时由主编按最新结构拆回去，不做向后兼容
 */
export async function buildStorySeed(store: ProjectStore, now = new Date()): Promise<string> {
  const parts: string[] = [`# 故事种子 · ${store.info.name}`, "", `导出于 ${now.toISOString()}。每个一级标题是一篇文档，格式「类型 · 编号 · 标题」，正文不含 frontmatter。`, ""];
  for (const kind of SEED_KIND_ORDER) {
    const def = DOC_KINDS[kind];
    const headers = (await store.list(kind)).sort((a, b) => a.id.localeCompare(b.id));
    for (const h of headers) {
      const doc = await store.read(kind, h.id);
      if (!doc) continue;
      const heading = def.singleton ? `# ${def.label} · ${doc.title}` : `# ${def.label} · ${doc.id} · ${doc.title}`;
      parts.push("---", "", heading, "", doc.body.trim(), "");
    }
  }
  return parts.join("\n");
}

export function storySeedFilename(projectName: string, now = new Date()): string {
  const stamp = now.toISOString().slice(0, 16).replace("T", " ").replace(":", "-");
  return `${projectName}-故事种子-${stamp}.md`;
}
