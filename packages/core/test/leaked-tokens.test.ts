import { describe, expect, test } from "bun:test";
import { normalizeMessage } from "../src/agent/kernel/history.js";
import { stripLeakedFromMessages, stripLeakedTokens } from "../src/agent/leaked-tokens.js";

describe("stripLeakedTokens", () => {
  test("deepseek 的 DSML 闭标签拖在正文末尾：剥掉", () => {
    const s = "我倾向拆法一，编剧等你准话就全量接着落。</｜｜DSML｜｜parameter>";
    expect(stripLeakedTokens(s)).toBe("我倾向拆法一，编剧等你准话就全量接着落。");
  });

  test("DSML 开标签、单竖线与 ASCII 竖线写法都认", () => {
    expect(stripLeakedTokens("<｜DSML｜tool_call>x<|DSML|invoke name=\"say\">y</|DSML|invoke>")).toBe("xy");
  });

  test("豆包 seed 的原生工具调用外壳整块剥掉，没闭壳就到末尾", () => {
    const s = '先说结论。\n<seed:tool_call><function name="say"><parameter name="text" string="true">新编剧已经派出去了。\n';
    expect(stripLeakedTokens(s)).toBe("先说结论。\n");
    const closed = 'A<seed:tool_call><function name="say"><parameter name="text">B</parameter></function></seed:tool_call>C';
    expect(stripLeakedTokens(closed)).toBe("AC");
  });

  test("落单的外壳标签也剥；正文里普通的 function 一词不动", () => {
    expect(stripLeakedTokens('好</parameter></function>了<parameter name="x">')).toBe("好了");
    expect(stripLeakedTokens("他写了一个 <function> 函数")).toBe("他写了一个 <function> 函数");
  });

  test("<|im_end|> 一类特殊 token 剥掉，Markdown 与普通尖括号不动", () => {
    expect(stripLeakedTokens("完<|im_end|>了<｜end▁of▁sentence｜>")).toBe("完了");
    expect(stripLeakedTokens("a < b 且 b > c，<b>粗体</b>")).toBe("a < b 且 b > c，<b>粗体</b>");
  });

  test("没泄漏原样返回同一个字符串", () => {
    const s = "普通一句话";
    expect(stripLeakedTokens(s)).toBe(s);
  });
});

describe("normalizeMessage 剥泄漏记号", () => {
  test("text 与 thinking 块都干净", () => {
    const msg = normalizeMessage({
      role: "assistant",
      content: [
        { type: "thinking", thinking: '<seed:tool_call><function name="say"><parameter name="text" string="true">派出去了\n' },
        { type: "text", text: "» 正在收口\n结论在此。</｜｜DSML｜｜parameter>" },
      ],
      timestamp: 0,
    });
    expect(msg?.parts).toEqual([
      { type: "thinking", text: "" },
      { type: "text", text: "结论在此。" },
    ]);
  });
});

describe("stripLeakedFromMessages", () => {
  const assistant = (content: unknown[]) => ({ role: "assistant", content, stopReason: "stop", usage: {}, timestamp: 0 }) as never;

  test("发给模型前，历史里 assistant 的泄漏记号剥掉；user / toolResult 不动", () => {
    const user = { role: "user", content: "继续", timestamp: 0 } as never;
    const msgs = [user, assistant([{ type: "text", text: "好。</｜｜DSML｜｜parameter>" }, { type: "toolCall", id: "t", name: "say", arguments: {} }])];
    const out = stripLeakedFromMessages(msgs) as unknown as { content: unknown }[];
    expect(out[0]).toBe(user);
    expect(out[1]!.content).toEqual([{ type: "text", text: "好。" }, { type: "toolCall", id: "t", name: "say", arguments: {} }]);
  });

  test("没泄漏时返回原数组", () => {
    const msgs = [assistant([{ type: "text", text: "干净" }])];
    expect(stripLeakedFromMessages(msgs)).toBe(msgs);
  });
});
