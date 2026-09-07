import { describe, expect, test } from "bun:test";
import { CAPABILITIES, CAPABILITY_IDS, capabilityEntry, capabilityIdsOf, capabilityInfos, capabilityRoster } from "../src/agent/capabilities.js";
import { ROLES } from "../src/agent/roles.js";
import { createTools, type ToolContext } from "../src/agent/tools/index.js";
import type { RoleId } from "../src/protocol.js";

describe("能力正文", () => {
  test("15 条都能加载，无占位符，写的是目标 / 交付物 / 边界而不是步骤", () => {
    expect(CAPABILITY_IDS).toHaveLength(15);
    for (const id of CAPABILITY_IDS) {
      const body = CAPABILITIES[id].load();
      expect(body).not.toMatch(/{{\w+}}/);
      for (const section of ["目标", "交付物", "边界"]) expect(body).toContain(`\n${section}\n`);
      expect(body).not.toMatch(/第[一二三]步|然后问|先 project_overview/);
    }
  });

  test("缺的信息从盘面读：每条正文都说了怎么定范围", () => {
    for (const id of [
      "talk",
      "design",
      "outline",
      "draft",
      "review",
      "recap",
      "deeper-needs",
      "show",
      "fivewhy",
      "logline",
      "but-therefore",
      "hook",
      "cool",
    ] as const) {
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

  test("清单每条带 id、名字和时机；下发前端的元数据带类别、不带正文", () => {
    const roster = capabilityRoster();
    for (const id of CAPABILITY_IDS) expect(roster).toContain(`- ${id}（${CAPABILITIES[id].label}）`);
    expect(roster).toContain("时机：");
    for (const info of capabilityInfos()) {
      expect(Object.keys(info).sort()).toEqual(["description", "id", "kind", "label"]);
      expect(info.kind).toBe(CAPABILITIES[info.id].kind);
    }
  });

  test("清单按类别分两组，组内顺序照登记顺序；两组合起来正好是全部", () => {
    const roster = capabilityRoster();
    const [workflowPart, techniquePart] = roster.split("技法：\n");
    expect(workflowPart).toStartWith("工作流：\n");
    for (const id of capabilityIdsOf("workflow")) expect(workflowPart).toContain(`- ${id}（`);
    for (const id of capabilityIdsOf("technique")) expect(techniquePart).toContain(`- ${id}（`);
    expect([...capabilityIdsOf("workflow"), ...capabilityIdsOf("technique")].sort()).toEqual([...CAPABILITY_IDS].sort());
    expect(capabilityIdsOf("workflow")).toEqual(["interview", "seed", "talk", "design", "outline", "draft", "review", "recap"]);
  });
});

/** 只拿工具，不碰盘：load_capability 不读项目 */
function toolsFor(role: RoleId) {
  const ctx = { store: null, gate: null, agentId: role, runCheck: async () => [], docsChanged: async () => [], search: async () => [] } as unknown as ToolContext;
  const def = ROLES[role];
  return createTools(ctx, { writableKinds: def.writableKinds, canSpawn: def.canSpawn, canAsk: def.canAsk });
}

describe("load_capability 工具", () => {
  test("只有主编有；子 agent 一个都没有", () => {
    expect(toolsFor("director").map((t) => t.name)).toContain("load_capability");
    for (const role of ["designer", "plotter", "writer", "ops", "reader", "copyeditor", "proofreader", "arbiter"] as const) {
      expect(toolsFor(role).map((t) => t.name)).not.toContain("load_capability");
    }
  });

  test("参数说明里就是那份分组清单；进场正文以「你进入」开头，与作者按钮那条路正文相同", async () => {
    const tool = toolsFor("director").find((t) => t.name === "load_capability")!;
    expect(tool.description).toContain(capabilityRoster());
    const out = await tool.execute("t", { id: "hook" } as never, undefined as never, undefined as never, undefined as never);
    const textOut = (out as { content: { type: string; text?: string }[] }).content[0]!.text!;
    expect(textOut).toStartWith("你进入「钩子断章」");
    expect(textOut).toBe(capabilityEntry("hook", "lead"));
  });

  test("未知 id 报错，并列出可选项", async () => {
    const tool = toolsFor("director").find((t) => t.name === "load_capability")!;
    await expect(tool.execute("t", { id: "nope" } as never, undefined as never, undefined as never, undefined as never)).rejects.toThrow(/未知能力：nope，可选 .*interview/);
  });
});
