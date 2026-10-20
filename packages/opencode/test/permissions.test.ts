import { describe, expect, test } from "bun:test";
import { enforcePermission, pruneTools } from "../src/agents.ts";
import { deniedOutright, effectOf, rule } from "../src/rules.ts";

/** opencode 按作者全局配置 "*": "allow" 算出来的结果都是 allow，看插件能不能把它拧回来 */
const decide = (agent: string, action: string, resources: string[] = ["*"]) => {
  const event = { agent, action, resources, effect: "allow" };
  enforcePermission(event);
  return event.effect;
};

const OWN = new Set(["read_doc", "save_review", "load_capability", "doc_template"]);
const TOOLS = [
  "shell",
  "skill",
  "question",
  "subagent",
  "write",
  "edit",
  "read",
  "websearch",
  "browser_navigate",
  ...OWN,
];
const visible = (agent: string) => {
  const tools: Record<string, unknown> = Object.fromEntries(TOOLS.map((name) => [name, {}]));
  pruneTools(agent, tools, OWN);
  return Object.keys(tools).toSorted();
};

describe("规则匹配", () => {
  test("通配符匹配任意字符，点号按字面算", () => {
    const rules = [rule("browser_*", "deny"), rule("opentomato.*", "deny")];
    expect(effectOf(rules, "browser_navigate", [""])).toBe("deny");
    expect(effectOf(rules, "opentomato.read_doc", [""])).toBe("deny");
    expect(effectOf(rules, "opentomatoXread_doc", [""])).toBeUndefined();
  });

  test("后写的规则优先；多个 resource 取最严的；规则管不到就不表态", () => {
    const rules = [rule("subagent", "deny"), rule("subagent", "allow", "策划")];
    expect(effectOf(rules, "subagent", ["策划"])).toBe("allow");
    expect(effectOf(rules, "subagent", ["策划", "build"])).toBe("deny");
    expect(effectOf(rules, "read", ["a.md"])).toBeUndefined();
  });

  test("一律被拒才算拒：还放行了某个 resource 的不算", () => {
    expect(deniedOutright([rule("shell", "deny")], "shell")).toBe(true);
    expect(
      deniedOutright([rule("subagent", "deny"), rule("subagent", "allow", "策划")], "subagent"),
    ).toBe(false);
    expect(deniedOutright([rule("shell", "deny"), rule("shell", "allow")], "shell")).toBe(false);
    expect(deniedOutright([], "shell")).toBe(false);
  });
});

describe('插件规则压过全局 "*": "allow"', () => {
  test("写作角色落盘照样问作者，评审照样不能写", () => {
    expect(decide("写手", "edit", ["正文/0001.md"])).toBe("ask");
    expect(decide("主编", "edit", ["人物/林尧.md"])).toBe("ask");
    expect(decide("文编", "edit", ["正文/0001.md"])).toBe("deny");
  });

  test("写作角色的禁用照样生效：不跑命令、子角色不问作者不派单", () => {
    expect(decide("写手", "shell")).toBe("deny");
    expect(decide("写手", "skill")).toBe("deny");
    expect(decide("写手", "question")).toBe("deny");
    expect(decide("编剧", "subagent", ["写手"])).toBe("deny");
    expect(decide("主编", "subagent", ["策划"])).toBe("allow");
    expect(decide("主编", "subagent", ["build"])).toBe("deny");
  });

  test("插件规则管不到的照旧，比如读文件", () => {
    expect(decide("写手", "read", ["正文/0001.md"])).toBe("allow");
  });

  test("别的 agent 用不了写作工具、派不了写作角色，别的派单不管", () => {
    expect(decide("build", "opentomato.read_doc")).toBe("deny");
    expect(decide("build", "subagent", ["写手"])).toBe("deny");
    expect(decide("build", "subagent", ["general"])).toBe("allow");
  });
});

describe("工具清单按插件规则删", () => {
  test("写手：没有命令、提问、派单、加载能力、落审稿记录", () => {
    expect(visible("写手")).toEqual(
      ["doc_template", "edit", "read", "read_doc", "websearch", "write"].toSorted(),
    );
  });

  test("主编：能问作者、能派单，不能落审稿记录", () => {
    expect(visible("主编")).toEqual(
      [
        "doc_template",
        "edit",
        "load_capability",
        "question",
        "read",
        "read_doc",
        "subagent",
        "websearch",
        "write",
      ].toSorted(),
    );
  });

  test("评审：不能写、不联网、不拿模板，能落审稿记录", () => {
    expect(visible("文编")).toEqual(["read", "read_doc", "save_review"].toSorted());
  });

  test("别的 agent：写作工具一个都看不见，自己的工具不动", () => {
    expect(visible("build")).toEqual(
      [
        "browser_navigate",
        "edit",
        "question",
        "read",
        "shell",
        "skill",
        "subagent",
        "websearch",
        "write",
      ].toSorted(),
    );
  });
});
