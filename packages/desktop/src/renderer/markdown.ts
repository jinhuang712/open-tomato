import { marked } from "marked";
import { docRefVersion, linkifyDocRefs } from "./doclink";

marked.setOptions({ gfm: true, breaks: true });

const cache = new Map<string, string>();

export function renderMarkdown(src: string): string {
  // 文档表变了（新建了卡），同一段文字要重新识别引用
  const key = `${docRefVersion()}\u0001${src}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const html = linkifyDocRefs(marked.parse(src, { async: false }) as string);
  if (cache.size > 500) cache.clear();
  cache.set(key, html);
  return html;
}
