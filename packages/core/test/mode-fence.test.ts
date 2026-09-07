import { describe, expect, test } from "bun:test";
import { normalizeMessage } from "../src/agent/kernel/history.js";
import { modePrompt } from "../src/protocol.js";

describe("mode fence → UI parts", () => {
  test("围栏 + 提示词折成 mode part，正文照常", () => {
    const msg = normalizeMessage({ role: "user", content: modePrompt("propose", "【候选阶段：别落盘】", "重摆坐标"), timestamp: 0 });
    expect(msg!.parts).toEqual([{ type: "mode", mode: "propose" }, { type: "text", text: "重摆坐标" }]);
  });
  test("数组内容第一段同样处理", () => {
    const msg = normalizeMessage({ role: "user", content: [{ type: "text", text: modePrompt("commit", "【落盘阶段】", "落盘") }], timestamp: 0 });
    expect(msg!.parts).toEqual([{ type: "mode", mode: "commit" }, { type: "text", text: "落盘" }]);
  });
  test("普通用户消息不受影响", () => {
    const msg = normalizeMessage({ role: "user", content: "你好", timestamp: 0 });
    expect(msg!.parts).toEqual([{ type: "text", text: "你好" }]);
  });
});
