import { describe, expect, test } from "bun:test";
import { dropForeignThinking } from "../src/agent/cross-model-thinking.js";

const doubao = { provider: "ark-doubao", api: "openai-completions", id: "doubao-seed-2-1-turbo-260628" };

function assistant(model: { provider: string; api: string; id: string }, content: unknown[]) {
  return {
    role: "assistant",
    provider: model.provider,
    api: model.api,
    model: model.id,
    content,
    stopReason: "toolUse",
    usage: {},
    timestamp: 0,
  } as never;
}

describe("dropForeignThinking", () => {
  test("别的模型产出的 thinking 块被丢掉，text 与 toolCall 保留", () => {
    const glm = { provider: "opencode-go", api: "openai-completions", id: "glm-5.3-flash" };
    const msgs = [
      assistant(glm, [
        { type: "thinking", thinking: "The author pressed 继续...", thinkingSignature: "reasoning_content" },
        { type: "text", text: "» 正在派活" },
        { type: "toolCall", id: "t1", name: "spawn", arguments: {} },
      ]),
    ];
    const out = dropForeignThinking(msgs, doubao) as unknown as { content: { type: string }[] }[];
    expect(out[0].content.map((b) => b.type)).toEqual(["text", "toolCall"]);
  });

  test("当前模型自己的 thinking 块原样保留", () => {
    const msgs = [assistant(doubao, [{ type: "thinking", thinking: "先看盘面", thinkingSignature: "reasoning_content" }])];
    const out = dropForeignThinking(msgs, doubao);
    expect(out).toBe(msgs);
  });

  test("user 与 toolResult 消息不动", () => {
    const msgs = [
      { role: "user", content: "继续", timestamp: 0 } as never,
      { role: "toolResult", toolCallId: "t1", toolName: "spawn", content: [{ type: "text", text: "ok" }], isError: false, timestamp: 0 } as never,
    ];
    expect(dropForeignThinking(msgs, doubao)).toBe(msgs);
  });

  test("没有当前模型时不做任何改动", () => {
    const glm = { provider: "opencode-go", api: "openai-completions", id: "glm-5.3-flash" };
    const msgs = [assistant(glm, [{ type: "thinking", thinking: "x" }])];
    expect(dropForeignThinking(msgs, undefined)).toBe(msgs);
  });
});
