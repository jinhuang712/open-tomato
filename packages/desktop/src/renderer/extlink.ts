/**
 * 正文里的裸 URL 太长太丑，压成「域名」胶囊；href 保留完整地址，
 * 点开由主进程 will-navigate 拦截后交给系统浏览器。
 */

// 中文标点、括号、引号都不算 URL 的一部分
const URL_RE = /https?:\/\/[^\s<>"'`（）「」『』【】，。；：、　]+/g;
const TRAILING = /[.,;:!?)\]]+$/;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function unescapeHtml(s: string): string {
  return s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

export function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function pill(url: string): string {
  return `<a class="ext-link" href="${escapeHtml(url)}" title="${escapeHtml(url)}">${escapeHtml(hostLabel(url))}</a>`;
}

function pillifyText(text: string): string {
  return text.replace(URL_RE, (whole) => {
    const tail = TRAILING.exec(whole)?.[0] ?? "";
    const url = whole.slice(0, whole.length - tail.length);
    return pill(unescapeHtml(url)) + tail;
  });
}

/** 把 HTML 里的外链压成域名胶囊：已是 <a href=URL>URL</a> 的换文字，裸文本里的补成链接 */
export function shortenUrls(html: string): string {
  // marked 的 GFM autolink 会先把裸 URL 变成 <a href="X">X</a>，而且会把紧跟的中文标点一起吞进去；
  // 丢掉它的 href，按链接文字重新切
  const autoLinked = html.replace(/<a href="[^"]*">(https?:\/\/[^<]*)<\/a>/g, (_, text: string) => pillifyText(text));
  let inAnchor = 0;
  return autoLinked
    .split(/(<[^>]+>)/g)
    .map((chunk) => {
      if (chunk.startsWith("<")) {
        if (/^<a[\s>]/i.test(chunk)) inAnchor++;
        else if (/^<\/a>/i.test(chunk)) inAnchor = Math.max(0, inAnchor - 1);
        return chunk;
      }
      return inAnchor > 0 ? chunk : pillifyText(chunk);
    })
    .join("");
}
