import { describe, expect, test } from "bun:test";
import { stubStripExtension } from "../src/agent/stub-strip.js";
import { stubPrompt } from "../src/protocol.js";

const run = async (messages: unknown[]) => {
  const handler = stubStripExtension().handlers.get("context")![0]!;
  const out = (await handler({ type: "context", messages }, {})) as { messages: Array<{ role: string; content: unknown }> };
  return out.messages;
};

describe("stub-strip", () => {
  test("字符串内容剥掉前缀，只留正文", async () => {
    const [m] = await run([{ role: "user", content: stubPrompt("立项访谈", "请做立项访谈"), timestamp: 0 }]);
    expect(m!.content).toBe("请做立项访谈");
  });
  test("数组内容只剥第一段文字的前缀", async () => {
    const [m] = await run([{ role: "user", content: [{ type: "text", text: stubPrompt("批注", "改这句") }, { type: "text", text: "⟦stub:x⟧不动" }], timestamp: 0 }]);
    expect(m!.content).toEqual([{ type: "text", text: "改这句" }, { type: "text", text: "⟦stub:x⟧不动" }]);
  });
  test("没前缀的和 assistant 消息原样返回", async () => {
    const input = [{ role: "user", content: "你好", timestamp: 0 }, { role: "assistant", content: [{ type: "text", text: "⟦stub:a⟧" }], timestamp: 0 }];
    expect(await run(input)).toEqual(input);
  });
});
