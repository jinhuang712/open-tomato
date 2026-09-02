import type { DocKindId } from "@opentomato/core/protocol";
import { actions } from "./state";

export interface DocRef {
  kind: DocKindId;
  id: string;
}

/** 目录 → kind；同时接受 kind 名本身 */
const DIR_TO_KIND: Record<string, DocKindId> = {
  world: "world",
  characters: "characters",
  threads: "threads",
  milestones: "milestones",
  volumes: "volumes",
  "outline/volumes": "volumes",
  chapters: "chapters",
  "outline/chapters": "chapters",
  manuscript: "manuscript",
  guide: "guide",
};

const REF = /(?<![\w/.-])(outline\/volumes|outline\/chapters|world|characters|threads|milestones|volumes|chapters|manuscript|guide)\/([\p{L}\p{N}_-]+?)(\.md)?(?![\w/.-])/gu;

export function parseDocRef(text: string): DocRef | null {
  const m = new RegExp(REF.source, "u").exec(text.trim());
  if (!m || m[0] !== text.trim()) return null;
  const kind = DIR_TO_KIND[m[1]!];
  return kind ? { kind, id: m[2]! } : null;
}

/** 把 HTML 里出现的 kind/id 引用包成可点的链接（只碰文本，不碰标签属性） */
export function linkifyDocRefs(html: string): string {
  // 按标签切开，只在文本片段里替换，避免改到 href 之类的属性
  return html
    .split(/(<[^>]+>)/g)
    .map((chunk) => {
      if (chunk.startsWith("<")) return chunk;
      return chunk.replace(REF, (whole, dir: string, id: string) => {
        const kind = DIR_TO_KIND[dir];
        if (!kind) return whole;
        return `<a class="doc-link" data-doc="${kind}/${id}" title="打开 ${kind}/${id}">${whole}</a>`;
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
