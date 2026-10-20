import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CAPABILITIES } from "../src/agent/capabilities.js";
import { ROLE_IDS, ROLES, rolePrompt, sharedRolePrompt, sharedToolPrompt } from "../src/agent/roles.js";
import { catalog, fill, markdown, parseCatalog, section, text } from "../src/text/load.js";
import { createTools } from "../src/agent/tools/index.js";

const ROOT = new URL("../text/", import.meta.url);
const files = (root: URL): URL[] => readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
  const path = new URL(entry.name + (entry.isDirectory() ? "/" : ""), root);
  return entry.isDirectory() ? files(path) : [path];
});

describe("运行文本加载", () => {
  test("所有目录都能解析，缺键、缺参数、重复键和非字符串会报错", () => {
    for (const file of files(ROOT).filter((path) => path.pathname.endsWith(".yaml"))) {
      const name = fileURLToPath(file).slice(fileURLToPath(ROOT).length, -5);
      expect(Object.keys(catalog(name)).length).toBeGreaterThan(0);
    }
    expect(() => text("shared/roles", "missing")).toThrow("Missing text entry");
    expect(() => fill("{{missing}}", {})).toThrow("Missing text parameter");
    expect(() => parseCatalog("key: first\nkey: second")).toThrow("Invalid text catalog");
    expect(() => parseCatalog("key: 42")).toThrow("must be strings");
  });

  test("core 源码直接引用的文本键均存在", () => {
    let references = 0;
    for (const file of files(new URL("../src/", import.meta.url)).filter((path) => path.pathname.endsWith(".ts"))) {
      const source = readFileSync(file, "utf8");
      for (const [, name, key] of source.matchAll(/\btextValue\("([^"]+)", "([^"]+)"/g)) {
        expect(() => text(name!, key!)).not.toThrow();
        references++;
      }
    }
    expect(references).toBeGreaterThan(300);
  });

  test("插值不重复解析，显式 undefined 保持原模板语义", () => {
    expect(fill("{{value}} / {{other}}", { value: "{{not_a_parameter}}", other: undefined })).toBe("{{not_a_parameter}} / undefined");
    expect(fill("{{value}}", { value: "$&" })).toBe("$&");
  });

  test("资源路径不能越界，章节必须存在", () => {
    for (const path of ["../roles", "/etc/passwd", "roles//writer", "roles/../../other"]) expect(() => markdown(path)).toThrow("Invalid text resource");
    expect(() => section("shared/collaboration", "missing")).toThrow("Missing or duplicate text section");
  });
});

describe("纯文本与工具接口的边界", () => {
  test("全部共用纯文本不含已注册工具名、宿主机制或接口参数", () => {
    const tools = createTools({ store: null, agentId: "audit", history: () => [], spawn: () => {}, continueAgent: () => {}, archiveAgent: () => {}, listAgents: () => [] } as never,
      { writableKinds: ["manuscript"], canSpawn: true, canAsk: true, reviewAs: "copyeditor" });
    const toolNames = new RegExp(`\\b(?:${tools.map((t) => t.name).join("|")})\\b`);
    const mechanics = /\b(?:question|subagent|write|edit|websearch|oldString|newString|frontmatter|sessionID)\b|mode=(?:propose|commit)|fork=true|⟦引用|\[批注/;
    for (const file of files(new URL("shared/", ROOT))) {
      const content = file.pathname.endsWith(".yaml") ? Object.values(parseCatalog(readFileSync(file, "utf8"))).join("\n") : readFileSync(file, "utf8");
      expect(content).not.toMatch(toolNames);
      expect(content.replace(/<!-- (?:section:[\w-]+|endsection) -->/g, "")).not.toMatch(mechanics);
      expect(content).not.toMatch(/{{(?:MARKS|DOCUMENTS|QUESTION_\w+|DISPATCH|LIFECYCLE|status|ENVIRONMENT|CANDIDATE_PHASE)}}/);
    }
  });

  test("全部角色共用规则、App 提示词和能力均可组装", () => {
    for (const id of ROLE_IDS) {
      const pure = sharedRolePrompt(id);
      const app = rolePrompt(id);
      expect(app).toContain(pure);
      expect(app).toContain(sharedToolPrompt(id));
      expect(app).not.toMatch(/{{\w+}}|<!-- (?:section:|endsection)/);
      for (const key of ["communication", "trust-boundary"]) expect(pure.split(section("shared/collaboration", key))).toHaveLength(2);
      expect(app.includes("## 给主编的报告")).toBe(id !== "director");
      expect(app.includes("## 落盘纪律")).toBe(ROLES[id].canWrite);
      expect(app).toContain("## 状态行");
      expect(app).not.toMatch(/\b(?:question|subagent|oldString|newString|websearch)\b/);
    }
    for (const c of Object.values(CAPABILITIES)) expect(c.load()).not.toMatch(/{{\w+}}/);
    expect(ROLES.writer.writableKinds).toEqual(["manuscript"]);
    expect(ROLES.director.canSpawn).toBe(true);
  });

  test("操作说明按权限选择，评审不会收到写入、模板或联网调用", () => {
    expect(sharedToolPrompt("copyeditor")).toContain("save_review");
    for (const id of ["reader", "copyeditor", "proofreader", "ops", "arbiter"] as const) {
      const tools = sharedToolPrompt(id);
      expect(tools).not.toMatch(/\b(?:doc_template|write_doc|edit_doc|web_search)\b/);
      expect(tools.includes("save_review")).toBe(ROLES[id].canReview ?? false);
    }
    expect(rolePrompt("director")).toContain("⟦引用");
    expect(rolePrompt("writer")).toContain("old / new");
    expect(rolePrompt("writer")).toContain("read_marks");
  });

  test("资源包包含编译代码和文本目录", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(pkg.files).toContain("dist");
    expect(pkg.files).toContain("text");
  });
});
