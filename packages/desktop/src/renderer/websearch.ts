/**
 * 把 web_search 返回给模型的文本（Exa 格式，已经 compactResults 清洗过）解析成结构化条目，给弹窗渲染用。
 * 格式：若干块用 `---` 分隔，每块是 `Title:` / `URL:` / `Published:` / `Author:` 行加 `Highlights:` 后的正文。
 */

export interface WebSearchHit {
  title: string;
  url: string;
  published?: string;
  author?: string;
  /** 正文片段，「...」分隔的每段一项 */
  highlights: string[];
}

export function parseWebSearchHits(raw: string): WebSearchHit[] {
  const hits: WebSearchHit[] = [];
  for (const block of raw.split(/\n\s*---\s*\n/)) {
    const hit: WebSearchHit = { title: "", url: "", highlights: [] };
    const body: string[] = [];
    let inBody = false;
    for (const line of block.split("\n")) {
      const t = line.trim();
      if (!inBody) {
        const m = /^(Title|URL|Published|Author|Highlights):\s*(.*)$/.exec(t);
        if (m) {
          const key = m[1];
          const val = m[2] ?? "";
          if (key === "Title") hit.title = val;
          else if (key === "URL") hit.url = val;
          else if (key === "Published") {
            const d = formatDate(val);
            if (d) hit.published = d;
          } else if (key === "Author") {
            if (val) hit.author = val;
          } else inBody = true;
          continue;
        }
        if (t) inBody = true;
      }
      if (inBody) body.push(t);
    }
    hit.highlights = body
      .join("\n")
      .split(/\n?\.\.\.\n?/)
      .map((s) => s.replace(/\n+/g, " ").trim())
      .filter(Boolean);
    if (hit.title || hit.url) hits.push(hit);
  }
  return hits;
}

/** ISO 时间只留年月日；不是 ISO 就原样返回 */
function formatDate(v: string): string | undefined {
  const t = v.trim();
  if (!t) return undefined;
  const m = /^(\d{4}-\d{2}-\d{2})T/.exec(t);
  return m ? m[1] : t;
}

/** 给行内摘要用：域名去 www */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
