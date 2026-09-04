import { describe, expect, test } from "bun:test";
import { applyEdits, EditError } from "../src/project/edits.js";

const doc = `---
title: 雨夜
---

雨越来越大。

陈默站在门口。

他没有敲门。
`;

describe("applyEdits", () => {
  test("单处替换", () => {
    const out = applyEdits(doc, [{ old: "雨越来越大。", new: "雨势渐猛。" }]);
    expect(out).toContain("雨势渐猛。");
    expect(out).not.toContain("雨越来越大。");
    expect(out).toContain("陈默站在门口。");
  });

  test("多处按顺序应用", () => {
    const out = applyEdits(doc, [
      { old: "陈默站在门口。", new: "陈默立在门前。" },
      { old: "他没有敲门。\n", new: "" },
    ]);
    expect(out).toContain("陈默立在门前。");
    expect(out).not.toContain("他没有敲门。");
  });

  test("old 为空追加到文末", () => {
    const out = applyEdits(doc, [{ old: "", new: "门开了。\n" }]);
    expect(out.endsWith("他没有敲门。\n门开了。\n")).toBe(true);
  });

  test("找不到原文报错并提示重新读取", () => {
    expect(() => applyEdits(doc, [{ old: "不存在的句子", new: "x" }])).toThrow(/找不到.*重新 read_doc/);
  });

  test("首行匹配但整段不匹配时提示空白差异", () => {
    expect(() => applyEdits(doc, [{ old: "雨越来越大。\n陈默站在门口。", new: "x" }])).toThrow(/换行或空格/);
  });

  test("多处匹配要求补上下文", () => {
    expect(() => applyEdits("a。\nb。\na。\n", [{ old: "a。", new: "c。" }])).toThrow(/出现了 2 次/);
  });

  test("拿 frontmatter 分隔线当锚点：直说不能用、该走哪条路", () => {
    expect(() => applyEdits(doc, [{ old: "---", new: "---\n正文" }])).toThrow(/分隔线.*write_doc/);
    expect(() => applyEdits(doc, [{ old: "---\n", new: "" }])).toThrow(/分隔线/);
  });

  test("old 与 new 相同报错", () => {
    expect(() => applyEdits(doc, [{ old: "雨越来越大。", new: "雨越来越大。" }])).toThrow(EditError);
  });

  test("任一处失败则整体不应用", () => {
    expect(() => applyEdits(doc, [{ old: "雨越来越大。", new: "x" }, { old: "没有的", new: "y" }])).toThrow(/第 2 处/);
  });

  test("new 含 $ 不被当作替换模式", () => {
    const out = applyEdits("价格。\n", [{ old: "价格。", new: "$100 与 $&。" }]);
    expect(out).toBe("$100 与 $&。\n");
  });

  test("edits 为空报错", () => {
    expect(() => applyEdits(doc, [])).toThrow(/为空/);
  });
});
