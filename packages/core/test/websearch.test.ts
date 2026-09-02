import { describe, expect, test } from "bun:test";
import { exaUrl, parseMcpText } from "../src/agent/websearch.js";

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
