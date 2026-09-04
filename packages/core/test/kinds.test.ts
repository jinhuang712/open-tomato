import { describe, expect, test } from "bun:test";
import { parseFrontmatter, splitSections } from "../src/project/frontmatter.js";
import { BRIEF_SEED_BODY, DOC_KINDS, optionalSectionsOf, requiredFieldsOf, requiredSectionsOf, templateNotes } from "../src/project/kinds.js";

const headings = (raw: string) => splitSections(parseFrontmatter(raw).body).map((s) => s.heading);

describe("模板由 schema 渲染", () => {
  test("可选段不出现，必填段是「待填」", () => {
    const t = DOC_KINDS.characters.template;
    expect(headings(t)).toEqual(["一句话", "外在", "内在与欲望"]);
    expect(t).not.toContain("待定");
    expect(t).toContain("## 一句话\n\n待填\n");
  });

  test("可选 frontmatter 字段不出现，必填字段带注释", () => {
    const { frontmatter } = parseFrontmatter(DOC_KINDS.characters.template);
    expect(frontmatter.tier).toBe("待填");
    expect("faction" in frontmatter).toBe(false);
    expect(DOC_KINDS.characters.template).toContain("tier: 待填  # 主角 / 关键对手 / 重要配角 / 一般配角");
  });

  test("枚举字段的注释由 options 拼出", () => {
    expect(DOC_KINDS.threads.template).toContain("type: 待填  # 主线 / 支线 / 主题 / 小故事");
  });

  test("hint 渲染在待填后面", () => {
    expect(DOC_KINDS.chapters.template).toContain("## 场景序列\n\n待填（每个场景：地点 / 在场人物 / 冲突 / 谁选了什么 / 结果。没有选择的场是过场，写出来自己会看见）\n");
  });

  test("没有段的正文只有一个待填", () => {
    expect(parseFrontmatter(DOC_KINDS.manuscript.template).body.trim()).toBe("待填");
  });

  test("简介预置稿不带书名段", () => {
    expect(headings(BRIEF_SEED_BODY)).toEqual(["一句话故事", "题材与平台", "读者画像", "主角优势", "总规模", "人称与视角"]);
    expect(parseFrontmatter(BRIEF_SEED_BODY).frontmatter.title).toBe("简介");
  });

  test("守则只有 frontmatter，段全是可选", () => {
    expect(headings(DOC_KINDS.rules.template)).toEqual([]);
    expect(optionalSectionsOf("rules", {}).map((s) => s.name)).toEqual(["展开", "例子"]);
  });

  test("每个模板都能解析出 frontmatter 映射", () => {
    for (const k of Object.values(DOC_KINDS)) {
      const { frontmatter } = parseFrontmatter(k.template);
      expect(frontmatter.status).toBe("draft");
    }
  });
});

describe("模板附注", () => {
  test("人物卡附注列出可选字段、可选段和 tier 条件", () => {
    const n = templateNotes("characters");
    expect(n).toContain("可选字段（有值再加）：faction（所属势力）");
    expect(n).toContain("可选段（写到了再新增 ## 段，不要预置占位）：语音签名（口头禅、句长、称呼习惯、避讳词）、关系");
    expect(n).toContain("tier 为 主角 / 关键对手 时必填：语音签名");
    expect(n).toContain("open: [项名]");
  });

  test("附注是 HTML 注释，拼在模板后不影响 frontmatter 解析", () => {
    const raw = `${DOC_KINDS.rules.template}\n${templateNotes("rules")}`;
    expect(parseFrontmatter(raw).frontmatter.level).toBe("待填");
    expect(raw).toMatch(/<!-- 可选段.*展开（规则的边界、例外）、例子（这条规则写出来长什么样.*） -->/);
  });
});

describe("条件必选", () => {
  test("主角 / 关键对手 的语音签名必填，配角可选", () => {
    expect(requiredSectionsOf("characters", { tier: "主角" }).map((s) => s.name)).toContain("语音签名");
    expect(requiredSectionsOf("characters", { tier: "关键对手" }).map((s) => s.name)).toContain("语音签名");
    expect(optionalSectionsOf("characters", { tier: "一般配角" }).map((s) => s.name)).toContain("语音签名");
  });

  test("必填字段不含通用四项", () => {
    expect(requiredFieldsOf("rules", {})).toEqual(["level", "scope", "source"]);
    expect(requiredFieldsOf("manuscript", {})).toEqual([]);
  });
});
