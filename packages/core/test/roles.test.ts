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
    for (const p of [ROLES.director.systemPrompt, CAPABILITIES.review.load()]) {
      expect(p).toContain("选择需要的角色和数量");
      expect(p).toContain("不固定四路");
    }
  });

  /**
   * e0da920 那次改口把整节「问作者」删掉了，没人拦住：主编随后连着几十轮拿 open 问
   * 本该摆候选的问题，作者只能手打「给我选择题」。这几条是那节的骨头，钉在这里防再删。
   */
  test("主编的提问口径：默认摆候选、按形态选 kind、一次一问、没感觉换差异更大的、下一步先看搁置清单", () => {
    const p = ROLES.director.systemPrompt;
    expect(p).toContain("默认摆候选让作者点，不默认开放问答");
    expect(p).toContain("按形态选 kind");
    expect(p).toContain("一次只问一件事");
    expect(p).toContain("换一批差异更大的");
    expect(p).toContain("先 list_open");
  });

  test("主编的系统提示带能力清单与授权边界", () => {
    const p = ROLES.director.systemPrompt;
    expect(p).toContain("## 能力");
    expect(p).toContain("- interview（立项访谈）");
    expect(p).toContain("load_capability");
    expect(p).toContain("加载说明不意味着作者批准");
  });

  test("写手可以补读相关材料，不能将未确认设定当事实", () => {
    const p = ROLES.writer.systemPrompt;
    expect(p).not.toContain("不读别的");
    expect(p).toContain("按需补读相关故事材料");
    expect(p).toContain("不把未经确认的设定当作既定事实");
    expect(p).toContain("project_overview 查看项目概况");
    expect(p).toContain("web_search 查证本章涉及的现实知识");
    expect(p).toContain("返修时 read_review");
  });

  test("暂停停止推进并等待输入，不强制开启问卷", () => {
    const pause = loadPrompt("kernel/pause-lead");
    expect(pause).toContain("不再派单或写入");
    expect(pause).toContain("等待作者输入");
    expect(pause).not.toContain("ask_user");
  });

  test("所有角色共用一份交流原则，报告规则不限制主编正文", () => {
    const communication = loadPrompt("shared/communication");
    const report = loadPrompt("shared/child-report");
    for (const role of Object.values(ROLES)) {
      expect(role.systemPrompt.split(communication)).toHaveLength(2);
      expect(role.systemPrompt.split(report)).toHaveLength(role.id === "director" ? 1 : 2);
    }
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

describe("角色可写范围", () => {
  test("写手只写正文；策划只写三类卡；编剧写三层大纲并可回写线索卡；主编写简介、守则和骨架卡，不写正文不排纲", () => {
    expect([...ROLES.writer.writableKinds]).toEqual(["manuscript"]);
    expect([...ROLES.designer.writableKinds].sort()).toEqual(["characters", "threads", "world"]);
    expect([...ROLES.plotter.writableKinds].sort()).toEqual(["chapters", "milestones", "threads", "volumes"]);
    expect(ROLES.director.writableKinds).not.toContain("manuscript");
    expect(ROLES.director.writableKinds).not.toContain("chapters");
    expect(ROLES.director.writableKinds).toContain("brief");
    expect(ROLES.director.writableKinds).toContain("rules");
  });

  test("canWrite 由可写范围推导：评审与裁决为空即只读", () => {
    for (const id of ["ops", "reader", "copyeditor", "proofreader", "arbiter"] as const) {
      expect(ROLES[id].writableKinds).toEqual([]);
      expect(ROLES[id].canWrite).toBe(false);
    }
    expect(ROLES.writer.canWrite).toBe(true);
  });
});
