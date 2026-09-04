import { describe, expect, test } from "bun:test";
import { normalizeHistory, takeStatusLine } from "../src/agent/runtime.js";

describe("takeStatusLine", () => {
  test("摘出状态行并去掉紧跟的空行", () => {
    const r = takeStatusLine("» 正在判断合理性\n\n先看盘面。");
    expect(r?.text).toBe("正在判断合理性");
    expect(r?.rest).toBe("先看盘面。");
  });

  test("状态行后多个空行全部吞掉", () => {
    const r = takeStatusLine("» 正在核对简介缺项\n\n\n先看盘面。");
    expect(r?.rest).toBe("先看盘面。");
    expect(takeStatusLine("» 正在核对简介缺项\n\n")?.rest).toBe("");
  });

  test("只有状态行没有正文", () => {
    const r = takeStatusLine("» 正在产出方案");
    expect(r?.text).toBe("正在产出方案");
    expect(r?.rest).toBe("");
  });

  test("不是状态行就返回 null", () => {
    expect(takeStatusLine("你好，先看盘面。")).toBeNull();
    expect(takeStatusLine("正在做别的很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长的事情\n")).toBeNull();
  });
});

describe("normalizeHistory 去状态行", () => {
  test("assistant 正文首段的状态行被剥掉", () => {
    const msgs = normalizeHistory([
      { role: "user", content: "你好" },
      { role: "assistant", content: [{ type: "text", text: "» 正在理清思路\n\n你好，先看盘面。" }] },
    ]);
    expect(msgs[1]?.parts).toEqual([{ type: "text", text: "你好，先看盘面。" }]);
  });

  test("thinking 排在前面时状态行照样剥掉，只剩空白的正文不进消息体", () => {
    const msgs = normalizeHistory([
      { role: "user", content: "你好" },
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "想一想" },
          { type: "text", text: "» 正在核对简介缺项\n\n" },
          { type: "toolCall", id: "t1", name: "read_doc", arguments: { kind: "brief", id: "brief" } },
        ],
      },
    ]);
    const types = msgs[1]?.parts.map((p) => p.type);
    expect(types).toEqual(["thinking", "tool"]);
  });
});
