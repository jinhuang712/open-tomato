import { describe, expect, test } from "bun:test";
import { repairAskArgs } from "../src/agent/tools/index.js";
import { resolveQuestionKind } from "../src/agent/tools/ask-args.js";

describe("repairAskArgs", () => {
  test("完好的实参原样过", () => {
    const args = { say: "人物卡骨架已经立了，就差名字。", question: "主角叫什么？", kind: "single", options: ["李强", "陈默"], allowFreeText: false };
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
    expect(repairAskArgs({ question: "在吗", options: null })).toEqual({ say: "", question: "在吗", kind: "open" });
  });

  test("空对象也能给出可用提问", () => {
    expect(repairAskArgs({})).toEqual({ say: "", question: "这些候选里，你更想要哪个方向？", kind: "open" });
  });

  test("kind 漏进 options 也会被摘掉", () => {
    expect(repairAskArgs({ question: "挑", options: ["kind", "A", "B"] }).options).toEqual(["A", "B"]);
  });
});

describe("resolveQuestionKind", () => {
  test("没候选一律 open，模型说什么都不算", () => {
    expect(resolveQuestionKind("single", [])).toBe("open");
    expect(resolveQuestionKind(undefined, [])).toBe("open");
  });

  test("{label, text} 或长字串一律 compare，覆盖模型给的 single", () => {
    expect(resolveQuestionKind("single", ["短", { label: "A", text: "x" }])).toBe("compare");
    expect(resolveQuestionKind("multi", ["一".repeat(41), "短"])).toBe("compare");
    expect(resolveQuestionKind(undefined, ["第一行\n第二行"])).toBe("compare");
  });

  test("短候选按模型给的合法 kind", () => {
    expect(resolveQuestionKind("multi", ["A", "B"])).toBe("multi");
    expect(resolveQuestionKind("checklist", ["A", "B"])).toBe("checklist");
  });

  test("短候选配 open / compare / 非法值都退回 single", () => {
    expect(resolveQuestionKind("open", ["A", "B"])).toBe("single");
    expect(resolveQuestionKind("compare", ["A", "B"])).toBe("single");
    expect(resolveQuestionKind("banana", ["A", "B"])).toBe("single");
    expect(resolveQuestionKind(undefined, ["A", "B"])).toBe("single");
  });

  test("repairAskArgs 把 kind 补齐进结果", () => {
    expect(repairAskArgs({ question: "返修哪几条", kind: "checklist", options: ["开头太慢", "结尾仓促"] }).kind).toBe("checklist");
    expect(repairAskArgs({ question: "挑一版", options: [{ label: "A", text: "x" }] }).kind).toBe("compare");
  });
});

describe("say 的 prepareArguments", () => {
  test("字面的反斜杠 n 还原成换行", async () => {
    const { makeSayTool } = await import("../src/agent/tools/say.js");
    const tool = makeSayTool({} as never) as unknown as { prepareArguments: (a: unknown) => { text: string } };
    expect(tool.prepareArguments({ text: "第一行\\n\\n第二行" })).toEqual({ text: "第一行\n\n第二行" });
  });
});
