import { describe, expect, test } from "bun:test";
import type { AgentEditor } from "@opencode/plugin/promise/agent";
import { ROLES, rolePrompt } from "@opentomato/core/headless";
import { childRoster, permissionsOf, registerAgents, systemPromptOf } from "../src/agents.ts";
import { agentIdOf, roleOf } from "../src/roles.ts";

type Rule = { action: string; resource: string; effect: string };

// 照 opencode 的规则求值：通配符可跨「/」，最后一条匹配的生效
const glob = (input: string, pattern: string) =>
  new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`, "s").test(
    input,
  );
const OPENCODE_DEFAULT: Rule[] = [{ action: "*", resource: "*", effect: "allow" }];
const decide = (rules: Rule[], action: string, resource = "*") =>
  [...OPENCODE_DEFAULT, ...rules].findLast(
    (r) => glob(action, r.action) && glob(resource, r.resource),
  )?.effect;

describe("角色 → agent", () => {
  test("agent id 就是角色名，反查得回来；别的 agent 不是写作角色", () => {
    expect(agentIdOf("director")).toBe("主编");
    expect(roleOf("策划")).toBe("designer");
    expect(roleOf("build")).toBeUndefined();
  });

  test("按 opencode 宿主直接组装系统提示；只有主编有派单规则", () => {
    const lead = systemPromptOf("director");
    expect(lead).toBe(rolePrompt("director", "opencode"));
    expect(lead).not.toBe(ROLES.director.systemPrompt);
    expect(lead).not.toMatch(/\b(?:ask_user|spawn_agents|continue_agent|write_doc|edit_doc|web_search|read_marks|list_agents|archive_agent)\b/);
    expect(lead).not.toContain("mode=propose");
    expect(lead).not.toContain("fork=true");
    expect(lead).toContain("## 在 opencode 里\n");
    expect(lead).toContain("## 在 opencode 里提问和派单");
    expect(systemPromptOf("writer")).not.toContain("提问和派单");
  });
});

describe("能力集", () => {
  test("主编能问作者、只能派八个写作角色", () => {
    const rules = permissionsOf("director");
    expect(decide(rules, "question")).toBe("allow");
    expect(decide(rules, "subagent", "策划")).toBe("allow");
    expect(decide(rules, "subagent", "裁决")).toBe("allow");
    expect(decide(rules, "subagent", "general")).toBe("deny");
    expect(decide(rules, "opentomato.load_capability")).toBe("allow");
  });

  test("子角色不问作者、不派单、不加载能力", () => {
    for (const role of ["designer", "writer", "proofreader"] as const) {
      const rules = permissionsOf(role);
      expect(decide(rules, "question")).toBe("deny");
      expect(decide(rules, "subagent", "写手")).toBe("deny");
      expect(decide(rules, "opentomato.load_capability")).toBe("deny");
    }
  });

  test("审稿记录只有四路评审能落，谁都能读", () => {
    for (const role of ["ops", "reader", "copyeditor", "proofreader"] as const) {
      expect(decide(permissionsOf(role), "opentomato.save_review")).toBe("allow");
    }
    for (const role of ["director", "writer", "arbiter"] as const) {
      expect(decide(permissionsOf(role), "opentomato.save_review")).toBe("deny");
      expect(decide(permissionsOf(role), "opentomato.read_review")).toBe("allow");
    }
  });

  test("会写的角色写入要问作者，评审与裁决不能写、不联网、没有模板", () => {
    expect(decide(permissionsOf("writer"), "edit", "正文/0001.md")).toBe("ask");
    expect(decide(permissionsOf("writer"), "websearch")).toBe("allow");
    for (const role of ["ops", "reader", "copyeditor", "proofreader", "arbiter"] as const) {
      const rules = permissionsOf(role);
      expect(decide(rules, "edit", "正文/0001.md")).toBe("deny");
      expect(decide(rules, "websearch")).toBe("deny");
      expect(decide(rules, "opentomato.doc_template")).toBe("deny");
      expect(decide(rules, "opentomato.read_doc")).toBe("allow");
    }
  });

  test("所有写作角色都没有 shell 和别处的 skill", () => {
    for (const role of ["director", "plotter", "reader"] as const) {
      expect(decide(permissionsOf(role), "shell")).toBe("deny");
      expect(decide(permissionsOf(role), "skill", "OpenTomato")).toBe("deny");
    }
  });
});

describe("registerAgents", () => {
  const fakeEditor = () => {
    const agents = new Map<string, Record<string, any>>([
      ["build", { id: "build", permissions: [...OPENCODE_DEFAULT] }],
    ]);
    let fallback: string | undefined;
    const editor = {
      list: () => [...agents.values()],
      get: (id: string) => agents.get(id),
      default: (id: string | undefined) => {
        fallback = id;
      },
      update: (id: string, fn: (agent: Record<string, any>) => void) => {
        const agent = agents.get(id) ?? { id, permissions: [...OPENCODE_DEFAULT] };
        agents.set(id, agent);
        fn(agent);
      },
      remove: (id: string) => agents.delete(id),
    } as unknown as AgentEditor;
    return { agents, editor, fallback: () => fallback };
  };

  test("注册主编和八个子角色，一律隐藏，默认 agent 不动", () => {
    const { agents, editor, fallback } = fakeEditor();
    registerAgents(editor);
    expect(fallback()).toBeUndefined();
    expect(agents.get("主编")?.mode).toBe("primary");
    for (const id of ["主编", "策划", "编剧", "写手", "运营", "读者", "文编", "校对", "裁决"]) {
      expect(agents.get(id)?.hidden).toBe(true);
      expect(agents.get(id)?.system).toContain("## 在 opencode 里");
    }
    for (const id of ["策划", "编剧", "写手", "运营", "读者", "文编", "校对", "裁决"]) {
      expect(agents.get(id)?.mode).toBe("subagent");
    }
  });

  test("隐藏后主编的派单清单由插件补：八个角色和职责都在", () => {
    const roster = childRoster();
    for (const id of ["策划", "编剧", "写手", "运营", "读者", "文编", "校对", "裁决"]) {
      expect(roster).toContain(`- ${id}：`);
    }
    expect(roster).not.toContain("主编");
  });

  test("别的 agent 看不见写作工具，也派不了写作角色", () => {
    const { agents, editor } = fakeEditor();
    registerAgents(editor);
    const build = agents.get("build")?.permissions as Rule[];
    expect(decide(build, "opentomato.read_doc")).toBe("deny");
    expect(decide(build, "subagent", "写手")).toBe("deny");
    expect(decide(build, "subagent", "general")).toBe("allow");
    expect(decide(build, "edit", "src/index.ts")).toBe("allow");
  });
});
