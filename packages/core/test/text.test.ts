import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CAPABILITIES } from "../src/agent/capabilities.js";
import { ROLE_IDS, ROLES, rolePrompt } from "../src/agent/roles.js";
import { catalog, fill, markdown, parseCatalog, section, text } from "../src/text/load.js";
import { HOST_IDS, renderHost } from "../src/text/host.js";

const ROOT = new URL("../text/", import.meta.url);
const files = (root: URL): URL[] => readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
  const path = new URL(entry.name + (entry.isDirectory() ? "/" : ""), root);
  return entry.isDirectory() ? files(path) : [path];
});

describe("运行文本加载", () => {
  test("所有文本目录都能解析，缺键、缺参数和重复键会报错", () => {
    for (const file of files(ROOT).filter((path) => path.pathname.endsWith(".yaml"))) {
      const name = fileURLToPath(file).slice(fileURLToPath(ROOT).length, -5);
      expect(Object.keys(catalog(name)).length).toBeGreaterThan(0);
    }
    expect(() => text("roles", "missing")).toThrow("Missing text entry");
    expect(() => fill("{{missing}}", {})).toThrow("Missing text parameter");
    expect(() => parseCatalog("key: first\nkey: second")).toThrow("Invalid text catalog");
    expect(() => parseCatalog("key: 42")).toThrow("must be strings");
  });

  test("core 和插件源码中直接引用的文本键都存在", () => {
    const roots = [new URL("../src/", import.meta.url), new URL("../../opencode/src/", import.meta.url)];
    let references = 0;
    for (const root of roots) {
      for (const file of files(root).filter((path) => path.pathname.endsWith(".ts"))) {
        const source = readFileSync(file, "utf8");
        for (const [, name, key] of source.matchAll(/\btextValue\("([^"]+)", "([^"]+)"/g)) {
          expect(() => text(name!, key!)).not.toThrow();
          references++;
        }
      }
    }
    expect(references).toBeGreaterThan(300);
  });

  test("插值只处理模板本身，显式传入的 undefined 保持原模板字符串语义", () => {
    expect(fill("{{value}} / {{other}}", { value: "{{not_a_parameter}}", other: undefined })).toBe("{{not_a_parameter}} / undefined");
    expect(fill("{{value}}", { value: "$&" })).toBe("$&");
  });

  test("资源路径不能越出文本根目录，协作章节必须存在", () => {
    for (const path of ["../roles", "/etc/passwd", "roles//writer", "roles/../../other"]) {
      expect(() => markdown(path)).toThrow("Invalid text resource");
    }
    expect(() => section("collaboration", "missing")).toThrow("Missing or duplicate text section");
  });
});

describe("按宿主直接组装", () => {
  const appOnly = /\b(?:ask_user|spawn_agents|continue_agent|write_doc|edit_doc|web_search|read_marks|list_agents|archive_agent)\b|mode=(?:propose|commit)|fork=true/;

  test("所有角色和能力都能在两种宿主中加载，无残留占位符或内部章节标记", () => {
    for (const host of HOST_IDS) {
      for (const role of ROLE_IDS) {
        const prompt = rolePrompt(role, host);
        expect(prompt).not.toMatch(/{{\w+}}|<!-- (?:section:|endsection)/);
        expect(prompt.split(section("collaboration", "communication"))).toHaveLength(2);
        expect(prompt.split(section("collaboration", "trust-boundary"))).toHaveLength(2);
        if (host === "opencode") expect(prompt).not.toMatch(appOnly);
      }
      for (const capability of Object.values(CAPABILITIES)) {
        const body = capability.load(host);
        expect(body).not.toMatch(/{{\w+}}/);
        if (host === "opencode") expect(body).not.toMatch(appOnly);
      }
    }
  });

  test("只有 App 带状态行；opencode 明确候选任务书和原会话续派", () => {
    for (const role of ROLE_IDS) {
      expect(rolePrompt(role, "app")).toContain("## 状态行");
      expect(rolePrompt(role, "opencode")).not.toContain("## 状态行");
    }
    const lead = rolePrompt("director", "opencode");
    expect(lead).toContain("只出候选，不落盘");
    expect(lead).toContain("sessionID");
    expect(lead).toContain("background: true");
    expect(lead).toContain("question");
    expect(rolePrompt("writer", "opencode")).not.toContain("## 在 opencode 里提问和派单");
    expect(rolePrompt("reader", "opencode")).not.toContain("## 文档工具");
  });

  test("共享章节按角色选择，权限与文档类型仍由代码定义", () => {
    expect(ROLES.writer.writableKinds).toEqual(["manuscript"]);
    expect(ROLES.director.canSpawn).toBe(true);
    for (const role of ROLE_IDS) {
      const prompt = rolePrompt(role, "app");
      expect(prompt.includes("## 给主编的报告")).toBe(role !== "director");
      expect(prompt.includes("## 落盘纪律")).toBe(ROLES[role].canWrite);
      expect(prompt.includes("## 先读章纲")).toBe(ROLES[role].canReview ?? false);
    }
  });

  test("资源打包清单包含编译代码和文本目录", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(pkg.files).toContain("dist");
    expect(pkg.files).toContain("text");
    expect(renderHost("write_doc / edit_doc", "opencode")).toBe("write / edit");
  });
});
