import { describe, expect, test } from "bun:test";
import { parseFrontmatter, pickSection, splitSections, stringifyFrontmatter } from "../src/project/frontmatter.js";

describe("frontmatter", () => {
  test("拆头和正文", () => {
    const { frontmatter, body } = parseFrontmatter(`---\ntitle: 林尧\nkeywords: [主角, 剑]\n---\n\n## 一句话\n\n他想回家。\n`);
    expect(frontmatter.title).toBe("林尧");
    expect(frontmatter.keywords).toEqual(["主角", "剑"]);
    expect(body.trim()).toBe("## 一句话\n\n他想回家。");
  });

  test("没有头时全是正文", () => {
    const { frontmatter, body } = parseFrontmatter("just text");
    expect(frontmatter).toEqual({});
    expect(body).toBe("just text");
  });

  test("坏 YAML 不炸", () => {
    const { frontmatter } = parseFrontmatter("---\ntitle: [unclosed\n---\nbody");
    expect(frontmatter).toEqual({});
  });

  test("往返", () => {
    const raw = stringifyFrontmatter({ title: "x", keywords: ["a"] }, "## 段\n\n内容");
    const back = parseFrontmatter(raw);
    expect(back.frontmatter).toEqual({ title: "x", keywords: ["a"] });
    expect(back.body.trim()).toBe("## 段\n\n内容");
  });
});

describe("sections", () => {
  const body = `前言\n\n## 语音签名\n\n短句。爱说“成”。\n\n## 关系\n\n待定\n`;

  test("切段", () => {
    const s = splitSections(body);
    expect(s.map((x) => x.heading)).toEqual(["", "语音签名", "关系"]);
    expect(s[1]?.content).toBe("短句。爱说“成”。");
  });

  test("取段", () => {
    expect(pickSection(body, "关系")).toBe("待定");
    expect(pickSection(body, "不存在")).toBeUndefined();
  });
});
