import { describe, expect, test } from "bun:test";
import { ROLES, ROLE_IDS, reviewGuide } from "../src/agent/roles.js";
import type { RoleId } from "../src/protocol.js";
import { CAPABILITIES, capabilityIdsOf } from "../src/agent/capabilities.js";
import { checkedBy, producedBy, STANDARD_IDS, STANDARDS, type Standard } from "../src/agent/standards.js";

const all = (): [string, Standard][] => STANDARD_IDS.map((id) => [id, STANDARDS[id]]);
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe("标准表", () => {
  test("名字不重复，每条都写了计划在哪", () => {
    const labels = all().map(([, s]) => s.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const [, s] of all()) expect(s.planned.trim()).not.toBe("");
  });

  test("只有故事内核没有评审核对：它由派单门把守", () => {
    expect(all().filter(([, s]) => !s.check).map(([id]) => id)).toEqual(["story"]);
  });

  test("核对的一路必须是评审角色", () => {
    for (const [, s] of all()) if (s.check) expect(ROLES[s.check.role].canReview).toBe(true);
  });
});

describe("产出句只进产出它的角色", () => {
  test("每条产出句在归它的角色提示里恰好一次，别的角色都没有", () => {
    for (const [, s] of all()) {
      for (const [role, sentence] of Object.entries(s.produce)) {
        for (const other of ROLE_IDS) {
          expect(occurrences(ROLES[other].systemPrompt, sentence)).toBe(other === role ? 1 : 0);
        }
      }
    }
  });

  test("产出方都能落盘，且不是主编：主编产出的简介几段由能力承担，不在角色提示里再写一遍", () => {
    for (const [, s] of all()) {
      for (const role of Object.keys(s.produce) as RoleId[]) {
        expect(role).not.toBe("director");
        expect(ROLES[role].canWrite).toBe(true);
      }
    }
  });

  test("压放这条，编剧排章纲时就要标，写手不管", () => {
    expect(producedBy("plotter")).toContain("beat");
    expect(producedBy("writer")).not.toContain("beat");
  });
});

describe("技法挂在标准上", () => {
  test("每条技法都写了修哪条标准，主编的能力清单里看得见", () => {
    for (const id of capabilityIdsOf("technique")) {
      const standard = CAPABILITIES[id].standard;
      expect(standard).toBeDefined();
      if (standard)
        expect(ROLES.director.systemPrompt).toContain(`对应标准：${STANDARDS[standard].label}`);
    }
  });
});

describe("检查句只进核对它的那一路", () => {
  test("每条检查句在归它的评审提示里恰好一次，别的角色都没有", () => {
    for (const [, s] of all()) {
      if (!s.check) continue;
      for (const role of ROLE_IDS) {
        expect(occurrences(ROLES[role].systemPrompt, s.check.text)).toBe(role === s.check.role ? 1 : 0);
      }
    }
  });

  test("四路评审各有归自己核对的标准", () => {
    for (const role of ["ops", "reader", "copyeditor", "proofreader"] as const) {
      expect(checkedBy(role).length).toBeGreaterThan(0);
    }
  });

  test("搬进标准表的条目，手册里不再各写一遍", () => {
    const copyeditor = ROLES.copyeditor.systemPrompt;
    expect(copyeditor).not.toContain("**钩子**");
    expect(copyeditor).not.toContain("**节奏**");
    expect(copyeditor).not.toContain("**对话**");
    expect(ROLES.ops.systemPrompt).not.toContain("**推进**");
    // 运营没有联网工具，手册不再让它 web_search
    expect(reviewGuide("运营")).not.toContain("web_search");
    expect(ROLES.proofreader.systemPrompt.match(/线索推进/g)).toHaveLength(1);
  });
});
