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
  guide: "rules",
  守则: "rules",
};

/** 单例文档没有 目录/id 形式，路径就是名字 */
const SINGLETONS: Record<string, DocKindId> = { 简介: "brief" };
const SINGLETON_ALTERNATION = Object.keys(SINGLETONS).join("|");

/** 老会话里的守则引用：英文 id → 中文；「守则/立项」现在是 简介 */
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
  cachedRef = new RegExp(
    `(?<![\\w/.\\-\\p{Script=Han}])(?:(${DIR_ALTERNATION})\\/(${idAlt})|(${SINGLETON_ALTERNATION}))(\\.md)?(?![\\w/.\\-\\p{Script=Han}])`,
    "gu",
  );
  return cachedRef;
}

/** 给人看的路径：中文目录/名字。单例只有名字；编号类（守则）用 title 代替编号，对外只有一个名字 */
export function displayPath(kind: DocKindId | string, id: string): string {
  const dir = state.kinds.find((k) => k.id === kind)?.dir ?? kind;
  if (dir === "") return id;
  const shownId = kind === "rules" ? (state.docs.find((d) => d.kind === kind && d.id === id)?.title ?? id) : id;
  return `${dir}/${shownId}`;
}

/** 正则命中的三个分组 → 文档引用 */
function refFromMatch(dir: string | undefined, id: string | undefined, single: string | undefined): DocRef | null {
  if (single !== undefined) {
    const kind = SINGLETONS[single];
    return kind ? { kind, id: single } : null;
  }
  const kind = dir !== undefined ? ALIASES[dir] : undefined;
  return kind && id !== undefined ? { kind, id } : null;
}

export function parseDocRef(text: string): DocRef | null {
  const m = new RegExp(refPattern().source, "u").exec(text.trim());
  if (!m || m[0] !== text.trim()) return null;
  return refFromMatch(m[1], m[2], m[3]);
}

/** 把 HTML 里出现的 目录/id 引用包成可点的链接（只碰文本，不碰标签属性） */
export function linkifyDocRefs(html: string): string {
  return html
    .split(/(<[^>]+>)/g)
    .map((chunk) => {
      if (chunk.startsWith("<")) return chunk;
      return chunk.replace(refPattern(), (whole, dir: string | undefined, id: string | undefined, single: string | undefined) => {
        const ref = refFromMatch(dir, id, single);
        if (!ref) return whole;
        const shown = escapeHtml(displayPath(ref.kind, ref.id));
        return `<a class="doc-link" data-doc="${escapeHtml(`${ref.kind}/${ref.id}`)}" title="打开 ${shown}">${shown}</a>`;
      });
    })
    .join("")
    .replace(WRAPPED_LINK, "$1");
}

/** 芯片自己就是可点的块，外面再套一层「」显得多余 */
const WRAPPED_LINK = /[「『“"]\s*(<a class="doc-link"[^>]*>[^<]*<\/a>)\s*[」』”"]/g;

/** 老会话里还会出现英文守则 id 和「守则/立项」，点开时映射到现在的文档 */
export function resolveLegacyRef(kind: DocKindId, id: string): DocRef {
  if (kind !== "rules") return { kind, id };
  const zh = LEGACY_GUIDE_IDS[id] ?? id;
  return zh === "立项" ? { kind: "brief", id: "简介" } : { kind, id: zh };
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
    const dest = resolveLegacyRef(ref.slice(0, slash) as DocKindId, ref.slice(slash + 1));
    actions.openDoc(dest.kind, dest.id);
  };
  document.addEventListener("click", handler);
  return () => document.removeEventListener("click", handler);
}
