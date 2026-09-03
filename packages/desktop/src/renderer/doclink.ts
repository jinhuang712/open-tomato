import type { DocKindId } from "@opentomato/core/protocol";
import { actions, state } from "./state";

export interface DocRef {
  kind: DocKindId;
  id: string;
}

/** 英文 kind、中文目录、旧英文目录都认，都解析成 kind */
const ALIASES: Record<string, DocKindId> = {
  world: "world",
  世界: "world",
  characters: "characters",
  人物: "characters",
  threads: "threads",
  线索: "threads",
  milestones: "milestones",
  里程碑: "milestones",
  volumes: "volumes",
  "outline/volumes": "volumes",
  卷纲: "volumes",
  chapters: "chapters",
  "outline/chapters": "chapters",
  章纲: "chapters",
  manuscript: "manuscript",
  正文: "manuscript",
  guide: "guide",
  守则: "guide",
};

const LEGACY_GUIDE_IDS: Record<string, string> = { brief: "立项", style: "文风", rules: "铁律", preferences: "偏好" };

const DIR_ALTERNATION = Object.keys(ALIASES)
  .sort((a, b) => b.length - a.length)
  .map((k) => k.replace(/\//g, "\\/"))
  .join("|");

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

let cacheKey = "";
let cachedRef: RegExp | null = null;

/**
 * 只认项目里真实存在的文档 id（最长优先），中文 id 后面紧跟正文也不会多吃或少吃。
 * 没有项目时退回宽松匹配。
 */
/** 引用表的版本号，markdown 缓存靠它失效 */
export function docRefVersion(): string {
  refPattern();
  return cacheKey;
}

function refPattern(): RegExp {
  // 老会话里的英文守则 id 也认，点开时再映射
  const ids = [...new Set([...state.docs.map((d) => d.id), ...Object.keys(LEGACY_GUIDE_IDS)])].sort((a, b) => b.length - a.length);
  const key = ids.join("\u0000");
  if (cachedRef && key === cacheKey) return cachedRef;
  cacheKey = key;
  const idAlt = ids.length > 0 ? ids.map(escapeRe).join("|") : "[\\p{L}\\p{N}_\\-]+";
  cachedRef = new RegExp(`(?<![\\w/.\\-\\p{Script=Han}])(${DIR_ALTERNATION})\\/(${idAlt})(\\.md)?(?![\\w/.\\-])`, "gu");
  return cachedRef;
}

/** 给人看的路径：中文目录/id */
export function displayPath(kind: DocKindId | string, id: string): string {
  const dir = state.kinds.find((k) => k.id === kind)?.dir ?? kind;
  return `${dir}/${id}`;
}

export function parseDocRef(text: string): DocRef | null {
  const m = new RegExp(refPattern().source, "u").exec(text.trim());
  if (!m || m[0] !== text.trim()) return null;
  const kind = ALIASES[m[1]!];
  return kind ? { kind, id: m[2]! } : null;
}

/** 把 HTML 里出现的 目录/id 引用包成可点的链接（只碰文本，不碰标签属性） */
export function linkifyDocRefs(html: string): string {
  return html
    .split(/(<[^>]+>)/g)
    .map((chunk) => {
      if (chunk.startsWith("<")) return chunk;
      return chunk.replace(refPattern(), (whole, dir: string, id: string) => {
        const kind = ALIASES[dir];
        if (!kind) return whole;
        const shown = escapeHtml(displayPath(kind, id));
        return `<a class="doc-link" data-doc="${escapeHtml(`${kind}/${id}`)}" title="打开 ${shown}">${shown}</a>`;
      });
    })
    .join("");
}

/** 老会话里还会出现英文守则 id，点开时映射到中文 */
export function resolveLegacyId(kind: DocKindId, id: string): string {
  return kind === "guide" ? (LEGACY_GUIDE_IDS[id] ?? id) : id;
}

/** 全局委托：点到 a[data-doc] 就打开文档 */
export function installDocLinkHandler(): () => void {
  const handler = (e: MouseEvent) => {
    const target = (e.target as HTMLElement | null)?.closest?.("a[data-doc]") as HTMLElement | null;
    if (!target) return;
    const ref = target.dataset.doc ?? "";
    const slash = ref.indexOf("/");
    if (slash < 0) return;
    e.preventDefault();
    e.stopPropagation();
    const kind = ref.slice(0, slash) as DocKindId;
    actions.openDoc(kind, resolveLegacyId(kind, ref.slice(slash + 1)));
  };
  document.addEventListener("click", handler);
  return () => document.removeEventListener("click", handler);
}
