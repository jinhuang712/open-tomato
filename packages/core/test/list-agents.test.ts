import { describe, expect, test } from "bun:test";
import { Gate } from "../src/agent/gate.js";
import { createTools, type ToolContext } from "../src/agent/tools/index.js";
import type { AgentInfo, AgentStatus } from "../src/protocol.js";

function agent(handle: string, status: AgentStatus, task = "建三张线索卡", error: string | null = null): AgentInfo {
  return { agentId: `id-${handle}`, parentId: "director", role: "designer", label: "策划", handle, task, status, error, statusText: "", mode: "commit" };
}

function listAgents(agents: AgentInfo[]) {
  const ctx: ToolContext = {
    store: {} as never,
    gate: new Gate({ approvalRequested: () => {}, approvalClosed: () => {}, questionRequested: () => {}, questionClosed: () => {} }),
    agentId: "director",
    runCheck: async () => [],
    docsChanged: async () => [],
    search: async () => [],
    listAgents: () => agents,
  };
  const tool = createTools(ctx, { writableKinds: [], canSpawn: true, canAsk: true }).find((t) => t.name === "list_agents");
  if (!tool) throw new Error("没有 list_agents");
  return async () => {
    const r = await tool.execute("t", {}, undefined as never, undefined as never, undefined as never);
    return (r.content[0] as { text: string }).text;
  };
}

describe("list_agents", () => {
  test("没派过人就直说，不编一份空名单", async () => {
    expect(await listAgents([])()).toBe("你还没派过人。");
  });

  test("被打断的那位点名说报告不会来了，别再等", async () => {
    const out = await listAgents([agent("策划3", "interrupted", "建三张地图线卡")])();
    expect(out).toContain("策划3");
    expect(out).toContain("被打断");
    expect(out).toContain("报告不会来了");
    expect(out).toContain("建三张地图线卡");
  });

  test("在跑的不催：报告会自己送到", async () => {
    const out = await listAgents([agent("策划1", "running")])();
    expect(out).toContain("在跑");
    expect(out).not.toContain("报告不会来了");
  });

  test("出错的把原因带上，主编不用再去翻", async () => {
    expect(await listAgents([agent("编剧1", "error", "排章纲", "模型超时")])()).toContain("模型超时");
  });

  test("封存的排在后面，且不算在场", async () => {
    const out = await listAgents([agent("策划9", "archived"), agent("策划1", "done")])();
    expect(out).toContain("1 位在场，1 位已封存");
    expect(out.indexOf("策划1")).toBeLessThan(out.indexOf("策划9"));
  });

  test("uuid 不进上下文：名单上只出现主编叫得出的名字", async () => {
    const out = await listAgents([agent("策划1", "done")])();
    expect(out).not.toContain("id-策划1");
  });

  test("不能派单的角色没有这个工具", () => {
    const ctx: ToolContext = {
      store: {} as never,
      gate: new Gate({ approvalRequested: () => {}, approvalClosed: () => {}, questionRequested: () => {}, questionClosed: () => {} }),
      agentId: "child",
      runCheck: async () => [],
      docsChanged: async () => [],
      search: async () => [],
    };
    expect(createTools(ctx, { writableKinds: [], canSpawn: false, canAsk: false }).some((t) => t.name === "list_agents")).toBe(false);
  });
});
