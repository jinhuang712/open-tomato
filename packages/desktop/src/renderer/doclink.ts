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
  rules: "rules",
  guide: "rules",
  守则: "rules",
};

/** 单例文档没有 目录/id 形式，路径就是名字 */
const SINGLETONS: Record<string, DocKindId> = { 简介: "brief" };
/** 中文后缀：名字 + 后缀还是指同一张卡。真名优先，stem 必须全项目唯一 */
const SUFFIXES = ["势力卡", "势力", "卡", "线"];
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
/** kind + 正文里写出的名字 → 真实文档 id；标题只给守则开放，重名标题不入表 */
let cachedAliases = new Map<string, string>();
/** 正文里不带目录直接写的名字 → 文档。只收全项目唯一的名字，两张卡同名就都不认 */
let cachedBare = new Map<string, DocRef>();

const aliasKey = (kind: DocKindId, shown: string) => `${kind}\u0000${shown}`;

/**
 * 认三种写法（最长优先）：带目录的全名「目录/id」，缺「/」的粘连（卷纲01、守则001、人物陈默），以及正文里直接写的唯一卡名（含 陈默卡 / 复仇线 / 饭团势力卡 这类后缀）。
 * 全名里的「/」本身就是定界符，所以前后紧贴汉字也照认（「读人物/陈默的卡」「从卷纲/01往下推」都能命中）；
 * 单例「简介」没有「/」定界，前后紧贴汉字时不认，避免把「个人简介」里的两个字链到立项简介。
 * 裸名是回退：中文里没有词边界，这一支不做汉字边界（否则「陈默说」永远链不上），只靠全项目唯一 + 最长优先，真名优先于后缀展开；
 * 纯数字编号（01、0001）不收进裸名——正文里数字太多，只写编号不链；但粘连里的 守则001 照认，因为目录锚定了 kind，误伤不了。
 * 显示规则：渲染只加链不改字——全名显示规范路径，其余保持原文；真目标永远写在 title 和悬停速览里。
 * 守则对作者显示的是 title，不是 001 这类编号，所以唯一 title 也是合法引用名；重名时不猜。
 * 项目文档尚未载入时，只识别仍在正则表里的旧守则引用。
 */
/** 引用表的版本号，markdown 缓存靠它失效 */
export function docRefVersion(): string {
  refPattern();
  return cacheKey;
}

function refPattern(): RegExp {
  const docs = state.docs;
  // title 要进 key：守则改名后，同一段 markdown 必须重新识别并渲染
  const key = docs.map((d) => `${d.kind}\u0000${d.id}\u0000${d.kind === "rules" ? d.title : ""}`).join("\u0001");
  if (cachedRef && key === cacheKey) return cachedRef;
  cacheKey = key;
  cachedAliases = new Map();

  const shown = new Set<string>();
  for (const d of docs) {
    cachedAliases.set(aliasKey(d.kind, d.id), d.id);
    shown.add(d.id);
  }

  // 模型按约定写「守则/<title>」。只接唯一标题；两个同名规则无法可靠判断，保持纯文本。
  const rules = docs.filter((d) => d.kind === "rules");
  const titleCounts = new Map<string, number>();
  for (const d of rules) titleCounts.set(d.title, (titleCounts.get(d.title) ?? 0) + 1);
  for (const d of rules) {
    if (!d.title || titleCounts.get(d.title) !== 1) continue;
    for (const name of new Set([d.title, escapeHtml(d.title)])) {
      const k = aliasKey("rules", name);
      if (!cachedAliases.has(k)) cachedAliases.set(k, d.id); // 真 id 优先于恰好同名的 title
      shown.add(name);
    }
  }

  // 老会话里的英文守则 id 仍可点；它们在 click 时再由 resolveLegacyRef 映射
  for (const id of Object.keys(LEGACY_GUIDE_IDS)) {
    cachedAliases.set(aliasKey("rules", id), id);
    shown.add(id);
  }

  const idAlt = shown.size > 0 ? [...shown].sort((a, b) => b.length - a.length).map(escapeRe).join("|") : "[\\p{L}\\p{N}_\\-]+";

  // 裸名字：卡的 id（守则换成唯一 title）。中文名前后紧贴正文是常态，所以这一支不做汉字边界，只靠最长优先；
  // 纯数字编号不收（只写 01、0001 不链），否则正文里随手一个数字就成链；目录锚定的粘连（守则001）不受这条限制。
  cachedBare = new Map();
  const bareCounts = new Map<string, number>();
  const bareNames: [string, DocRef][] = [];
  for (const d of docs) {
    if (d.kind === "brief") continue;
    const name = d.kind === "rules" ? d.title : d.id;
    if (!name || name.length < 2 || /^[\d]+$/.test(name) || (d.kind === "rules" && titleCounts.get(name) !== 1)) continue;
    bareCounts.set(name, (bareCounts.get(name) ?? 0) + 1);
    bareNames.push([name, { kind: d.kind, id: d.id }]);
  }
  for (const [name, ref] of bareNames) {
    if (bareCounts.get(name) !== 1) continue;
    cachedBare.set(name, ref);
    if (escapeHtml(name) !== name) cachedBare.set(escapeHtml(name), ref);
  }
  // 后缀：真名优先（已在表里的不动），剩下唯一的才展开；命中时整词成链、显示原文。
  const uniqueStems = bareNames
    .filter(([name]) => bareCounts.get(name) === 1)
    .map(([name]) => name)
    .sort((a, b) => b.length - a.length);
  for (const stem of uniqueStems) {
    const ref = cachedBare.get(stem);
    if (!ref) continue;
    for (const s of SUFFIXES) {
      for (const key of new Set([stem + s, escapeHtml(stem) + s])) {
        if (!cachedBare.has(key)) cachedBare.set(key, ref);
      }
    }
  }
  const bareAlt = cachedBare.size > 0 ? [...cachedBare.keys()].sort((a, b) => b.length - a.length).map(escapeRe).join("|") : "(?!)";
  cachedRef = new RegExp(
    `(?:(?<![\\w/.\\-])(${DIR_ALTERNATION})\\/(${idAlt})(\\.md)?(?![\\w/.\\-])|(?<![\\w/.\\-\\p{Script=Han}])(${SINGLETON_ALTERNATION})(\\.md)?(?![\\w/.\\-\\p{Script=Han}])|(?<![\\w/\\-])(${bareAlt})(?![\\w/\\-])|(?<![\\w/.\\-])(${DIR_ALTERNATION})[ \u3000]?(${idAlt})(\\.md)?(?![\\w/.\\-]))`,
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

/** 正则命中的分组 → 文档引用；bare 查裸名表，glue（目录粘连）走和全名同一套 kind/id 校验 */
function refFromMatch(dir: string | undefined, id: string | undefined, single: string | undefined, bare?: string, glueDir?: string, glueId?: string): DocRef | null {
  if (bare !== undefined) return cachedBare.get(bare) ?? null;
  if (glueDir !== undefined && glueId !== undefined) {
    const kind = ALIASES[glueDir];
    if (!kind) return null;
    if (state.docs.length === 0) return { kind, id: glueId };
    const resolved = cachedAliases.get(aliasKey(kind, glueId));
    return resolved ? { kind, id: resolved } : null;
  }
  if (single !== undefined) {
    const kind = SINGLETONS[single];
    return kind ? { kind, id: single } : null;
  }
  const kind = dir !== undefined ? ALIASES[dir] : undefined;
  if (!kind || id === undefined) return null;
  // 没有项目盘面时，沿用正则已识别出的旧引用；有盘面时必须命中真实 kind/id 或唯一守则 title
  if (state.docs.length === 0) return { kind, id };
  const resolved = cachedAliases.get(aliasKey(kind, id));
  return resolved ? { kind, id: resolved } : null;
}

export function parseDocRef(text: string): DocRef | null {
  const m = new RegExp(refPattern().source, "u").exec(text.trim());
  if (!m || m[0] !== text.trim()) return null;
  return refFromMatch(m[1], m[2], m[4], m[6], m[7], m[8]);
}

/**
 * 把 HTML 里出现的文档引用包成可点的链接（只碰文本，不碰标签属性）。
 * 认三种写法：目录/id 全名、缺「/」的粘连、唯一卡名（含后缀）；全名显示规范路径，其余保持原文。
 * `self` 是正在看的这张卡，它自己在自己正文里不成链。
 */
export function linkifyDocRefs(html: string, self?: DocRef): string {
  return html
    .split(/(<[^>]+>)/g)
    .map((chunk) => {
      if (chunk.startsWith("<")) return chunk;
      return chunk.replace(refPattern(), (whole, dir: string | undefined, id: string | undefined, _md: string | undefined, single: string | undefined, _md2: string | undefined, bare: string | undefined, glueDir: string | undefined, glueId: string | undefined) => {
        const ref = refFromMatch(dir, id, single, bare, glueDir, glueId);
        if (!ref) return whole;
        if (self && ref.kind === self.kind && ref.id === self.id) return whole;
        const path = escapeHtml(displayPath(ref.kind, ref.id));
        const shown = bare !== undefined || glueDir !== undefined ? whole : path;
        return `<a class="doc-link" data-doc="${escapeHtml(`${ref.kind}/${ref.id}`)}" title="打开 ${path}">${shown}</a>`;
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

