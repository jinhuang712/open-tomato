import { describe, expect, test } from "bun:test";
import { normalizeMessage } from "../src/agent/kernel/history.js";
import { quoteBlock, splitQuotes, userTextParts, type UiPart } from "../src/protocol.js";

describe("引用围栏", () => {
  test("拼出来再拆回去，多段引用按顺序、正文留在最后", () => {
    const text = [quoteBlock("主编", "三方归一退下来了"), quoteBlock("你", "第一行\n第二行"), "直接删了不好吗？"].join("\n\n");
    expect(splitQuotes(text)).toEqual({
      quotes: [
        { from: "主编", text: "三方归一退下来了" },
        { from: "你", text: "第一行\n第二行" },
      ],
      rest: "直接删了不好吗？",
    });
  });

  test("没有围栏的普通话原样是一段正文", () => {
    expect(userTextParts("就这样吧")).toEqual([{ type: "text", text: "就这样吧" }]);
  });

  test("只有引用没有正文时不多出空的 text part", () => {
    expect(userTextParts(quoteBlock("主编", "这句"))).toEqual([{ type: "quote", from: "主编", text: "这句" }]);
  });

  test("正文里出现的围栏不算引用：只认开头的", () => {
    const text = `先说一句\n\n${quoteBlock("主编", "后面的")}`;
    expect(splitQuotes(text)).toEqual({ quotes: [], rest: text });
  });

  test("history 归一化：用户消息字符串与数组两种形态都拆出 quote part", () => {
    const text = `${quoteBlock("主编", "引的")}\n\n作者说的`;
    const want: UiPart[] = [
      { type: "quote", from: "主编", text: "引的" },
      { type: "text", text: "作者说的" },
    ];
    expect(normalizeMessage({ role: "user", content: text })?.parts).toEqual(want);
    expect(normalizeMessage({ role: "user", content: [{ type: "text", text }] })?.parts).toEqual(want);
    // assistant 的正文不拆，模型自己写出围栏也只是文字
    expect(normalizeMessage({ role: "assistant", content: text })?.parts).toEqual([{ type: "text", text }]);
  });
});
