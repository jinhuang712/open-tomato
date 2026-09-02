import { marked } from "marked";
import { linkifyDocRefs } from "./doclink";

marked.setOptions({ gfm: true, breaks: true });

const cache = new Map<string, string>();

export function renderMarkdown(src: string): string {
  const hit = cache.get(src);
  if (hit !== undefined) return hit;
  const html = linkifyDocRefs(marked.parse(src, { async: false }) as string);
  if (cache.size > 500) cache.clear();
  cache.set(src, html);
  return html;
}
