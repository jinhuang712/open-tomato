import { describe, expect, test } from "bun:test";
import { CAPABILITIES, CAPABILITY_IDS, capabilityEntry, capabilityInfos, capabilityRoster } from "../src/agent/capabilities.js";

describe("能力正文", () => {
  test("8 条都能加载，无占位符，写的是目标 / 交付物 / 边界而不是步骤", () => {
    expect(CAPABILITY_IDS).toHaveLength(8);
    for (const id of CAPABILITY_IDS) {
      const body = CAPABILITIES[id].load();
      expect(body).not.toMatch(/{{\w+}}/);
      for (const section of ["目标", "交付物", "边界"]) expect(body).toContain(`\n${section}\n`);
      expect(body).not.toMatch(/第[一二三]步|然后问|先 project_overview/);
    }
  });

  test("缺的信息从盘面读：每条正文都说了怎么定范围", () => {
    for (const id of ["talk", "design", "outline", "draft", "review", "recap"] as const) {
      expect(CAPABILITIES[id].load()).toMatch(/由盘面/);
    }
  });

  test("进场正文区分谁触发，正文相同", () => {
    const byAuthor = capabilityEntry("draft", "author");
    const byLead = capabilityEntry("draft", "lead");
    expect(byAuthor).toContain("作者点了「章节写作」");
    expect(byLead).toContain("你进入「章节写作」");
    expect(byAuthor.split("\n\n").slice(1).join("\n\n")).toBe(byLead.split("\n\n").slice(1).join("\n\n"));
  });

  test("清单每条带 id、名字和时机；下发前端的元数据不带正文", () => {
    const roster = capabilityRoster();
    for (const id of CAPABILITY_IDS) expect(roster).toContain(`- ${id}（${CAPABILITIES[id].label}）`);
    expect(roster).toContain("时机：");
    for (const info of capabilityInfos()) expect(Object.keys(info).sort()).toEqual(["description", "id", "label"]);
  });
});
