import { describe, expect, test } from "bun:test";
import { normalizeMessage } from "../src/agent/kernel/history.js";
import { formatAnswer, quoteBlock, splitQuotes, userTextParts, type UiPart } from "../src/protocol.js";

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

describe("答案里的引文", () => {
  test("圈了一段再回答：引文留在最前面，前缀只加在作者自己的话上", () => {
    const answer = `${quoteBlock("写法一", "这句留着")}\n\n其他用写法二`;
    expect(formatAnswer(answer)).toBe(`${quoteBlock("写法一", "这句留着")}\n\n作者回答：其他用写法二`);
  });

  test("界面自己组好的句子不再被套一层前缀", () => {
    const answer = `${quoteBlock("主编", "这句")}\n\n作者选了：A、C`;
    expect(formatAnswer(answer)).toBe(answer);
  });

  test("只圈了段落没写话：留下引文，不多出一个空的「作者回答：」", () => {
    expect(formatAnswer(quoteBlock("主编", "这句"))).toBe(quoteBlock("主编", "这句"));
  });

  test("没有引文的答案一字不差", () => {
    expect(formatAnswer("就这样吧")).toBe("作者回答：就这样吧");
    expect(formatAnswer("作者逐条表态：改 1")).toBe("作者逐条表态：改 1");
  });
});
