import { describe, expect, test } from "bun:test";
import { hasLongOptions, optionLabel, optionText } from "../src/protocol.js";

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
