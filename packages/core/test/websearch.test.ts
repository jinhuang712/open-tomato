import { describe, expect, test } from "bun:test";
import { compactResults, exaUrl, parseMcpText } from "../src/agent/websearch.js";

describe("parseMcpText", () => {
  test("纯 JSON", () => {
    const body = JSON.stringify({ result: { content: [{ type: "text", text: "hello" }] } });
    expect(parseMcpText(body)).toBe("hello");
  });
  test("SSE 多行，跳过无 text 的块", () => {
    const body = ["event: message", 'data: {"result":{"content":[]}}', "", "event: message", 'data: {"result":{"content":[{"type":"text","text":"Title: x\\nURL: y"}]}}', ""].join("\n");
    expect(parseMcpText(body)).toBe("Title: x\nURL: y");
  });
  test("非 JSON 返回 undefined", () => {
    expect(parseMcpText("<html>oops</html>")).toBeUndefined();
    expect(parseMcpText("")).toBeUndefined();
  });
  test("JSON-RPC error 抛出", () => {
    expect(() => parseMcpText('{"error":{"message":"rate limited"}}')).toThrow(/rate limited/);
  });
});

describe("exaUrl", () => {
  test("无 key 用裸地址", () => expect(exaUrl({})).toBe("https://mcp.exa.ai/mcp"));
  test("有 key 带 query", () => expect(exaUrl({ EXA_API_KEY: "a b" })).toBe("https://mcp.exa.ai/mcp?exaApiKey=a%20b"));
});

describe("compactResults", () => {
  test("去掉 N/A 元数据行和「...」夹着的短碎片，保留 URL 与正文", () => {
    const raw = [
      "Title: 中国团购走完一个轮回",
      "URL: https://example.com/a",
      "Published: N/A",
      "Author: N/A",
      "Highlights:",
      "到2010年12月底，全国团购网站数量已经达到1726家。",
      "...",
      "购网站的疯狂",
      "...",
      "，消费者在",
      "...",
      "2011年上半年，团购行业整体成交额仅为34亿元。",
      "",
      "---",
      "",
      "Title: 第二篇",
      "URL: https://example.com/b",
      "Published: 2010-08-11T00:00:00.000Z",
      "Author: N/A",
      "Highlights:",
      "正文一句。",
      "...",
    ].join("\n");
    const out = compactResults(raw);
    expect(out).not.toContain("N/A");
    expect(out).not.toContain("购网站的疯狂");
    expect(out).not.toContain("，消费者在");
    expect(out).toContain("URL: https://example.com/a");
    expect(out).toContain("1726家");
    expect(out).toContain("34亿元");
    expect(out).toContain("Published: 2010-08-11");
    expect(out.endsWith("正文一句。")).toBe(true);
    // 相邻碎片合并后只剩一个「...」
    expect(out.match(/^\.\.\.$/gm)?.length).toBe(1);
  });
});
