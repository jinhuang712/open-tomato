import { describe, expect, test } from "bun:test";
import { formatAnswer, formatChecklistAnswer, hasLongOptions, optionLabel, optionText } from "../src/protocol.js";

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

  test("逃生口的追加指令接在末尾", () => {
    expect(formatChecklistAnswer(opts, ["yes", null, null], "没表态的你替我定，说清为什么。")).toEndWith("。没表态的你替我定，说清为什么。");
  });
});
