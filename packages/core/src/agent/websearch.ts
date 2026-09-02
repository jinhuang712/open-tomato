/**
 * 联网搜索：直连 Exa 的 MCP 端点（和 opencode 同一路子），一次 HTTP POST 完成 tools/call。
 * 不带 key 也能匿名调，只是限额；设了 EXA_API_KEY 就带上。
 */

export interface WebSearchOptions {
  /** 返回条数，默认 5 */
  numResults?: number;
  /** auto 平衡；fast 快；deep 深挖。默认 auto */
  type?: "auto" | "fast" | "deep";
  /** 喂给模型的正文上限（字符），默认 6000 */
  maxChars?: number;
  /** 超时毫秒，默认 25s */
  timeoutMs?: number;
}

export const EXA_MCP_URL = "https://mcp.exa.ai/mcp";

export function exaUrl(env: NodeJS.ProcessEnv = process.env): string {
  const key = env.EXA_API_KEY;
  return key ? `${EXA_MCP_URL}?exaApiKey=${encodeURIComponent(key)}` : EXA_MCP_URL;
}

/** MCP 响应可能是纯 JSON，也可能是 SSE（若干 `data: {...}` 行）；取第一个带 text 的 content */
export function parseMcpText(body: string): string | undefined {
  const tryOne = (payload: string): string | undefined => {
    const t = payload.trim();
    if (!t.startsWith("{")) return undefined;
    try {
      const data = JSON.parse(t) as { result?: { content?: Array<{ type?: string; text?: string }> }; error?: { message?: string } };
      if (data.error?.message) throw new Error(`搜索服务返回错误：${data.error.message}`);
      return data.result?.content?.find((c) => typeof c.text === "string" && c.text)?.text;
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("搜索服务返回错误")) throw e;
      return undefined;
    }
  };
  const direct = tryOne(body);
  if (direct) return direct;
  for (const line of body.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const got = tryOne(line.slice(6));
    if (got) return got;
  }
  return undefined;
}

/**
 * 压掉 Exa 结果里的噪音：Published/Author 为 N/A 的行、「...」分隔出的过短碎片（标题被切成一两个词那种）。
 * 只删不改，URL 和正文片段原样保留。
 */
export function compactResults(raw: string): string {
  const out: string[] = [];
  let prevEllipsis = false;
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (/^(Published|Author):\s*N\/A$/.test(t)) continue;
    if (t === "...") {
      if (!prevEllipsis) out.push("...");
      prevEllipsis = true;
      continue;
    }
    // 只有紧挨着「...」的短碎片才丢，避免误删正文里正常的短句
    if (prevEllipsis && t.length > 0 && t.length < 12 && !/^(Title|URL):/.test(t)) continue;
    out.push(line);
    prevEllipsis = false;
  }
  // 紧跟在分隔线 / 下一条标题前，或整段末尾的孤立「...」没有信息量，去掉
  const cleaned = out.filter((line, i) => {
    if (line !== "...") return true;
    const next = out.slice(i + 1).find((l) => l.trim() !== "");
    return next !== undefined && next.trim() !== "---" && !next.startsWith("Title:");
  });
  return cleaned.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export async function searchWeb(query: string, opts: WebSearchOptions = {}, signal?: AbortSignal): Promise<string> {
  const q = query.trim();
  if (!q) throw new Error("query 不能为空");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error("搜索超时")), opts.timeoutMs ?? 25_000);
  const onOuterAbort = () => ctrl.abort(signal?.reason);
  signal?.addEventListener("abort", onOuterAbort, { once: true });
  try {
    const res = await fetch(exaUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "web_search_exa",
          arguments: {
            query: q,
            type: opts.type ?? "auto",
            numResults: opts.numResults ?? 5,
            livecrawl: "fallback",
            contextMaxCharacters: opts.maxChars ?? 6000,
          },
        },
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`搜索服务 HTTP ${res.status}`);
    const body = await res.text();
    const found = parseMcpText(body);
    return found ? compactResults(found) : "没有搜到结果，换个说法再试。";
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onOuterAbort);
  }
}
