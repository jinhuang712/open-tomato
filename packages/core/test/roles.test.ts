import { describe, expect, test } from "bun:test";
import { ROLES, reviewGuide } from "../src/agent/roles.js";

describe("评审手册", () => {
  test("三路评审各拼进自己那份手册，读者只有人设", () => {
    expect(ROLES.copyeditor.systemPrompt).toContain(reviewGuide("文编"));
    expect(ROLES.ops.systemPrompt).toContain(reviewGuide("运营"));
    expect(ROLES.proofreader.systemPrompt).toContain(reviewGuide("校对"));
    expect(ROLES.reader.systemPrompt).not.toContain("## 定级");
  });

  test("手册只有现象条目，不带文摘、不带阈值判词", () => {
    for (const name of ["文编", "运营", "校对"] as const) {
      const g = reviewGuide(name);
      expect(g).not.toContain("✗");
      expect(g).not.toContain("✓");
      expect(g).toContain("## 定级");
    }
  });

  test("四路评审都先读章纲再读守则", () => {
    for (const id of ["ops", "reader", "copyeditor", "proofreader"] as const) {
      const p = ROLES[id].systemPrompt;
      expect(p).toContain("## 先读章纲");
      expect(p).toContain("list_docs kind=守则");
    }
  });
});
