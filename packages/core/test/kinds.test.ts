import { describe, expect, test } from "bun:test";
import { parseFrontmatter, splitSections } from "../src/project/frontmatter.js";
import { BRIEF_SEED_BODY, DOC_KINDS, optionalSectionsOf, requiredFieldsOf, requiredSectionsOf, templateNotes } from "../src/project/kinds.js";

const headings = (raw: string) => splitSections(parseFrontmatter(raw).body).map((s) => s.heading);

describe("模板由 schema 渲染，文档里不留桩", () => {
  test("模板不预置任何段，也没有「待填」「待定」", () => {
    for (const k of Object.values(DOC_KINDS)) {
      expect(headings(k.template)).toEqual([]);
      expect(k.template).not.toContain("待填");
      expect(k.template).not.toContain("待定");
    }
  });

  test("没有默认值的字段不出现，必填与否由附注说", () => {
    const { frontmatter } = parseFrontmatter(DOC_KINDS.characters.template);
    expect("tier" in frontmatter).toBe(false);
    expect("faction" in frontmatter).toBe(false);
    expect("title" in frontmatter).toBe(false);
    expect(frontmatter.status).toBe("draft");
    expect(frontmatter.keywords).toEqual([]);
  });

  test("有默认值的字段带着值出现", () => {
    const { frontmatter } = parseFrontmatter(DOC_KINDS.chapters.template);
    expect(frontmatter.words).toBe(3000);
    expect(frontmatter.characters).toEqual([]);
  });

  test("简介预置稿只有 frontmatter，段等访谈聊到再加", () => {
    expect(headings(BRIEF_SEED_BODY)).toEqual([]);
    expect(parseFrontmatter(BRIEF_SEED_BODY).frontmatter.title).toBe("简介");
    expect(parseFrontmatter(BRIEF_SEED_BODY).body.trim()).toBe("");
  });

  test("每个模板都能解析出 frontmatter 映射", () => {
    for (const k of Object.values(DOC_KINDS)) {
      const { frontmatter } = parseFrontmatter(k.template);
      expect(frontmatter.status).toBe("draft");
    }
  });
});

describe("模板附注", () => {
  test("人物卡附注列出必填字段、必填段、可选项和 tier 条件", () => {
    const n = templateNotes("characters");
    expect(n).toContain("必填字段（写进 frontmatter，缺了机检报）：title、summary、tier（主角 / 关键对手 / 重要配角 / 一般配角）");
    expect(n).toContain("可选字段（有值再加）：faction（所属势力）");
    expect(n).toContain("必填段（写到了再新增 ## 段，不要预置占位，缺了机检报）：一句话、外在、内在与欲望");
    expect(n).toContain("可选段（写到了再新增 ## 段，不要预置占位）：语音签名（口头禅、句长、称呼习惯、避讳词）、关系");
    expect(n).toContain("tier 为 主角 / 关键对手 时必填：语音签名");
    expect(n).toContain("open: [项名]");
  });

  test("枚举字段的说明由 options 拼出", () => {
    expect(templateNotes("threads")).toContain("type（主线 / 支线 / 主题 / 小故事）");
  });

  test("章纲附注带 hint", () => {
    expect(templateNotes("chapters")).toContain("场景序列（每个场景：地点 / 在场人物 / 冲突 / 谁选了什么 / 结果。没有选择的场是过场，写出来自己会看见）");
  });

  test("附注是 HTML 注释，拼在模板后不影响 frontmatter 解析", () => {
    const raw = `${DOC_KINDS.rules.template}\n${templateNotes("rules")}`;
    expect(parseFrontmatter(raw).frontmatter.status).toBe("draft");
    expect(raw).toMatch(/<!-- 必填字段.*level（必须 \/ 尽量）、scope（.*）、source（作者原话或来源） -->/);
    expect(raw).toMatch(/<!-- 可选段.*例子（这条规则写出来长什么样.*） -->/);
    expect(raw).toMatch(/<!-- 必填段.*展开（规则管到哪、不管哪.*） -->/);
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
