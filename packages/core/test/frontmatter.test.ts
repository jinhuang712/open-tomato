import { describe, expect, test } from "bun:test";
import { frontmatterProblem, parseFrontmatter, patchFrontmatter, pickSection, replaceBody, splitSections, stringifyFrontmatter } from "../src/project/frontmatter.js";

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

/** 作者在界面上手改一张卡：正文和头字段分开改，没碰的部分逐字不动 */
describe("界面手改", () => {
  const RAW = `---\ntitle: 林尧 # 主角\nsummary: '他想回家'\nkeywords: [主角, 剑]\ntier: 主角\n---\n\n## 一句话\n\n他想回家。\n`;

  test("换正文时头的原文一字不改", () => {
    const next = replaceBody(RAW, "## 一句话\n\n他不想回家了。");
    expect(next).toBe(`---\ntitle: 林尧 # 主角\nsummary: '他想回家'\nkeywords: [主角, 剑]\ntier: 主角\n---\n\n## 一句话\n\n他不想回家了。\n`);
  });

  test("正文清空只留头，跟空白模板同形", () => {
    expect(replaceBody(RAW, "  \n\n")).toBe(`---\ntitle: 林尧 # 主角\nsummary: '他想回家'\nkeywords: [主角, 剑]\ntier: 主角\n---\n`);
  });

  test("正文首尾空行不带进文件", () => {
    expect(parseFrontmatter(replaceBody(RAW, "\n\n正文\n\n\n")).body).toBe("\n正文\n");
  });

  test("改一个头字段，别的字段连注释和写法一起留着", () => {
    const next = patchFrontmatter(RAW, { tier: "关键对手" });
    expect(next).toContain("title: 林尧 # 主角");
    expect(next).toContain("summary: '他想回家'");
    expect(next).toContain("keywords: [主角, 剑]");
    expect(next).toContain("tier: 关键对手");
    expect(parseFrontmatter(next).body.trim()).toBe("## 一句话\n\n他想回家。");
  });

  test("原来一行写的列表改完还是一行", () => {
    expect(patchFrontmatter(RAW, { keywords: ["主角", "剑", "少年"] })).toContain("keywords: [主角, 剑, 少年]");
  });

  test("新字段追加、undefined 删字段", () => {
    const next = patchFrontmatter(RAW, { faction: "青云宗", tier: undefined });
    expect(next).toContain("faction: 青云宗");
    expect(next).not.toContain("tier:");
  });

  test("头和正文一起改", () => {
    const next = replaceBody(patchFrontmatter(RAW, { title: "林尧之死" }), "## 一句话\n\n他死了。");
    expect(parseFrontmatter(next).frontmatter.title).toBe("林尧之死");
    expect(parseFrontmatter(next).body.trim()).toBe("## 一句话\n\n他死了。");
    expect(frontmatterProblem(next)).toBeNull();
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

describe("frontmatterProblem", () => {
  test("合法文件返回 null", () => {
    expect(frontmatterProblem("---\ntitle: x\nkeywords: [a, b]\n---\n\n正文\n")).toBeNull();
  });
  test("没有 frontmatter", () => {
    expect(frontmatterProblem("直接正文")).toMatch(/frontmatter/);
  });
  test("YAML 解析失败", () => {
    expect(frontmatterProblem("---\ntitle: [unclosed\n---\nbody")).toMatch(/不是合法 YAML/);
  });
  test("头部不是映射", () => {
    expect(frontmatterProblem("---\n- a\n- b\n---\nbody")).toMatch(/映射/);
  });
});
