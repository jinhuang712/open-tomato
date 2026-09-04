import DOMPurify from "dompurify";
import { marked } from "marked";
import { docRefVersion, linkifyDocRefs } from "./doclink";
import { shortenUrls } from "./extlink";

marked.setOptions({ gfm: true, breaks: true });

/**
 * 进 innerHTML 的东西都过这一道：模型回复、搜索结果、文档正文都可能夹带原始 HTML。
 * CSP 已经挡了脚本，这里再把内联样式、iframe、表单这类能盖住 / 伪造界面的元素拿掉。
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "iframe", "form", "input", "button", "textarea", "select", "object", "embed", "svg", "math"],
    FORBID_ATTR: ["style"],
  });
}

const cache = new Map<string, string>();

export function renderMarkdown(src: string): string {
  // 文档表变了（新建了卡），同一段文字要重新识别引用
  const key = `${docRefVersion()}${src}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const html = sanitizeHtml(shortenUrls(linkifyDocRefs(marked.parse(src, { async: false }) as string)));
  if (cache.size > 500) cache.clear();
  cache.set(key, html);
  return html;
}
