import { describe, expect, test } from "bun:test";
import { normalizeHistory, takeStatusLine } from "../src/agent/runtime.js";

describe("takeStatusLine", () => {
  test("摘出状态行并去掉紧跟的空行", () => {
    const r = takeStatusLine("» 正在判断合理性\n\n先看盘面。");
    expect(r?.text).toBe("正在判断合理性");
    expect(r?.rest).toBe("先看盘面。");
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
});
