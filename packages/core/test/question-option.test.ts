import { describe, expect, test } from "bun:test";
import { formatAnswer, formatChecklistAnswer, hasLongOptions, optionLabel, optionText, parseChecklistAnswer, summarizeChecklistMarks } from "../src/protocol.js";

describe("QuestionOption", () => {
  test("纯字串的 label 和正文都是它自己", () => {
    expect(optionLabel("红尘")).toBe("红尘");
    expect(optionText("红尘")).toBe("红尘");
  });

  test("带 label 的候选分别取 label 和 text", () => {
    const o = { label: "主角是 A", text: "A 站在渡口……" };
    expect(optionLabel(o)).toBe("主角是 A");
    expect(optionText(o)).toBe("A 站在渡口……");
  });

  test("短字串不算长候选", () => {
    expect(hasLongOptions(["红尘", "长夜", "渡口"])).toBe(false);
    expect(hasLongOptions([])).toBe(false);
  });

  test("带 label、含换行、超过 40 字任一即算长候选", () => {
    expect(hasLongOptions(["红尘", { label: "A", text: "x" }])).toBe(true);
    expect(hasLongOptions(["第一行\n第二行"])).toBe(true);
    expect(hasLongOptions(["一".repeat(41)])).toBe(true);
    expect(hasLongOptions(["一".repeat(40)])).toBe(false);
  });
});

describe("formatAnswer", () => {
  test("普通回答补「作者回答：」", () => {
    expect(formatAnswer("红尘")).toBe("作者回答：红尘");
  });

  test("界面已按形态组好句的原样转交", () => {
    expect(formatAnswer("作者选了：A、C")).toBe("作者选了：A、C");
    expect(formatAnswer("作者逐条表态。改：第 1 条（开头太慢）；不改：无；没表态：第 2 条（结尾仓促）")).toStartWith("作者逐条表态");
  });
});

describe("formatChecklistAnswer", () => {
  const opts = ["开头太慢", "人名太文艺", "结尾仓促"];

  test("三组都报，用序号加短名引用", () => {
    expect(formatChecklistAnswer(opts, ["yes", "no", null])).toBe(
      "作者逐条表态。改：第 1 条（开头太慢）；不改：第 2 条（人名太文艺）；没表态：第 3 条（结尾仓促）",
    );
  });

  test("空组写「无」，没标记的当没表态", () => {
    expect(formatChecklistAnswer(opts, ["yes", "yes"])).toBe(
      "作者逐条表态。改：第 1 条（开头太慢）、第 2 条（人名太文艺）；不改：无；没表态：第 3 条（结尾仓促）",
    );
  });

  test("逃生口的追加指令换行另起", () => {
    const a = formatChecklistAnswer(opts, ["yes", null, null], "没表态的你替我定，说清为什么。");
    expect(a).toBe("作者逐条表态。改：第 1 条（开头太慢）；不改：无；没表态：第 2 条（人名太文艺）、第 3 条（结尾仓促）\n没表态的你替我定，说清为什么。");
  });
});

describe("parseChecklistAnswer", () => {
  const opts = ["开头太慢", "人名太文艺", "结尾仓促"];

  test("组出来的答案能拆回三组序号", () => {
    const p = parseChecklistAnswer(formatChecklistAnswer(opts, ["yes", "no", null]));
    expect(p).toEqual({ yes: [0], no: [1], undecided: [2], tail: null });
  });

  test("补充说明从第一处换行切出来", () => {
    const p = parseChecklistAnswer(formatChecklistAnswer(opts, ["yes", null, null], "第二条你定。理由写清楚。"));
    expect(p?.tail).toBe("第二条你定。理由写清楚。");
    expect(p?.yes).toEqual([0]);
    expect(p?.undecided).toEqual([1, 2]);
  });

  test("旧格式逃生口追加句兼容", () => {
    const p = parseChecklistAnswer("作者逐条表态。改：第 1 条（开头太慢）；不改：无；没表态：第 2 条（人名太文艺）。没表态的你替我定，说清为什么。");
    expect(p?.tail).toBe("没表态的你替我定，说清为什么。");
    expect(p?.undecided).toEqual([1]);
  });

  test("候选正文含嵌套括号和「第 N 条」字样不误认", () => {
    const tricky = ["四条切法按推荐定（不剥削的账/不烧钱怎么赢）", "第 1 条很好，但太长", "守沪期多多不融资"];
    const p = parseChecklistAnswer(formatChecklistAnswer(tricky, ["yes", "no", null]));
    expect(p).toEqual({ yes: [0], no: [1], undecided: [2], tail: null });
  });

  test("非 checklist 答案返回 null", () => {
    expect(parseChecklistAnswer("作者回答：随便")).toBeNull();
    expect(parseChecklistAnswer("作者选了：A、B")).toBeNull();
  });

  test("手写的野句式组头对不上就返回 null", () => {
    expect(parseChecklistAnswer("作者逐条表态，都挺好的")).toBeNull();
  });
});

describe("summarizeChecklistMarks", () => {
  test("只报序号不贴正文", () => {
    expect(summarizeChecklistMarks([0, 1], [], [2])).toBe("改：第 1 条、第 2 条；不改：无；没表态：第 3 条");
  });
});
