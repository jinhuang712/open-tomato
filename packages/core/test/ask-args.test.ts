import { describe, expect, test } from "bun:test";
import { repairAskArgs } from "../src/agent/tools/index.js";

describe("repairAskArgs", () => {
  test("完好的实参原样过", () => {
    const args = { say: "人物卡骨架已经立了，就差名字。", question: "主角叫什么？", options: ["李强", "陈默"], allowFreeText: false };
    expect(repairAskArgs(args)).toEqual(args);
  });

  test("字面的反斜杠 n 还原成换行，问句和候选都还原", () => {
    const out = repairAskArgs({
      question: "简介定了，摘要如下：\\n\\n《书名》……\\n\\n下一步先设哪批卡？",
      options: ["先聊聊主角", { label: "留白版", text: "第一段\\n第二段" }],
    });
    expect(out.question).toBe("简介定了，摘要如下：\n\n《书名》……\n\n下一步先设哪批卡？");
    expect(out.options).toEqual(["先聊聊主角", { label: "留白版", text: "第一段\n第二段" }]);
  });

  test("question 丢失时用兜底问句撑起来", () => {
    const out = repairAskArgs({ options: ["A 方向", "B 方向"] });
    expect(out.question).toBe("这些候选里，你更想要哪个方向？");
    expect(out.options).toEqual(["A 方向", "B 方向"]);
  });

  test("键名漏进 options 会被摘掉", () => {
    const out = repairAskArgs({ options: ["身份太戏剧", "名字太文艺", "question"] });
    expect(out.options).toEqual(["身份太戏剧", "名字太文艺"]);
  });

  test("损坏实参末尾粘的数组闭合符号被剥掉", () => {
    const out = repairAskArgs({ options: ['重出几个"朴素档"的给我挑"]', "question"] });
    expect(out.options).toEqual(['重出几个"朴素档"的给我挑']);
  });

  test("完好实参里以引号结尾的候选不动", () => {
    const out = repairAskArgs({ question: "挑一个", options: ['他说"我不干了"'] });
    expect(out.options).toEqual(['他说"我不干了"']);
  });

  test("{label, text} 候选保留，残缺对象丢弃", () => {
    const out = repairAskArgs({
      question: "两版小传挑一版",
      options: [{ label: "留白版", text: "正文一" }, { label: "只有 label" }],
    });
    expect(out.options).toEqual([{ label: "留白版", text: "正文一" }]);
  });

  test("options 不是数组时整个省掉", () => {
    expect(repairAskArgs({ question: "在吗", options: null })).toEqual({ say: "", question: "在吗" });
  });

  test("空对象也能给出可用提问", () => {
    expect(repairAskArgs({})).toEqual({ say: "", question: "这些候选里，你更想要哪个方向？" });
  });
});
