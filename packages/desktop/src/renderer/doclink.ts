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

const DIR_ALTERNATION = Object.keys(ALIASES)
  .sort((a, b) => b.length - a.length)
  .map((k) => k.replace(/\//g, "\\/"))
  .join("|");

const REF = new RegExp(`(?<![\\w/.\\-\\p{Script=Han}])(${DIR_ALTERNATION})\\/([\\p{L}\\p{N}_\\-]+?)(\\.md)?(?![\\w/.\\-])`, "gu");

/** 给人看的路径：中文目录/id */
export function displayPath(kind: DocKindId | string, id: string): string {
  const dir = state.kinds.find((k) => k.id === kind)?.dir ?? kind;
  return `${dir}/${id}`;
}

export function parseDocRef(text: string): DocRef | null {
  const m = new RegExp(REF.source, "u").exec(text.trim());
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
      return chunk.replace(REF, (whole, dir: string, id: string) => {
        const kind = ALIASES[dir];
        if (!kind) return whole;
        return `<a class="doc-link" data-doc="${kind}/${id}" title="打开 ${displayPath(kind, id)}">${whole}</a>`;
      });
    })
    .join("");
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
    actions.openDoc(ref.slice(0, slash) as DocKindId, ref.slice(slash + 1));
  };
  document.addEventListener("click", handler);
  return () => document.removeEventListener("click", handler);
}
