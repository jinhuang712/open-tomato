import { describe, expect, test } from "bun:test";
import { ROLES, reviewGuide } from "../src/agent/roles.js";
import { CAPABILITIES } from "../src/agent/capabilities.js";
import { loadPrompt } from "../src/agent/prompt-text.js";

describe("提示词口径", () => {
  test("所有角色恰好注入一次共享信任边界，无未填占位符", () => {
    const boundary = loadPrompt("shared/trust-boundary");
    for (const role of Object.values(ROLES)) {
      expect(role.systemPrompt.split(boundary)).toHaveLength(2);
      expect(role.systemPrompt).not.toMatch(/\{\{\w+\}\}/);
    }
  });
  test("主编与审稿能力均按需选择评审", () => {
    for (const p of [ROLES.director.systemPrompt, CAPABILITIES.review.render({ chapter: "12" })]) {
      expect(p).toContain("选择需要的角色和数量");
      expect(p).toContain("不固定四路");
    }
  });

  test("写手限制扩读故事材料，保留工具例外", () => {
    const p = ROLES.writer.systemPrompt;
    expect(p).not.toContain("不读别的");
    expect(p).toContain("以下不受上述清单限制");
    expect(p).toContain("project_overview 查看项目概况");
    expect(p).toContain("web_search 查证本章涉及的现实知识");
    expect(p).toContain("返修时 read_review");
  });

  test("暂停收尾明确允许一次提问", () => {
    expect(loadPrompt("kernel/pause-lead")).toContain("只允许最后用一次 ask_user");
  });
});

describe("评审手册", () => {
  test("三路评审各拼进自己那份手册，读者只有人设", () => {
    expect(ROLES.copyeditor.systemPrompt).toContain(reviewGuide("文编"));
    expect(ROLES.ops.systemPrompt).toContain(reviewGuide("运营"));
    expect(ROLES.proofreader.systemPrompt).toContain(reviewGuide("校对"));
    expect(ROLES.reader.systemPrompt).not.toMatch(/^1\. \*\*.+\*\*：/m);
  });

  test("手册是编号职责清单，一条一个职责，不带文摘", () => {
    for (const name of ["文编", "运营", "校对"] as const) {
      const g = reviewGuide(name);
      expect(g).not.toContain("✗");
      expect(g).not.toContain("✓");
      expect(g).toMatch(/^1\. \*\*.+\*\*：/m);
      // 分级句只写手册独有的那半句；章纲承诺没做到记 must 在 REVIEW_INTENT 里统一说
      expect(g).toMatch(/记 (must|suggest)/);
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
