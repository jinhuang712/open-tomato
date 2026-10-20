import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";
import { CAPABILITIES, ROLE_IDS, ROLES, sharedRolePrompt, sharedToolPrompt } from "@opentomato/core/headless";
import { pluginResources, pluginText, rolePrompt, capabilityPrompt } from "../src/text.ts";
import { materialTools } from "../src/tools.ts";

const appOnly = /\b(?:ask_user|spawn_agents|continue_agent|write_doc|edit_doc|web_search|read_marks|list_agents|archive_agent)\b|mode=(?:propose|commit)|fork=true|⟦引用|\[批注|状态行|侧栏/;

describe("插件文本归属", () => {
  test("所有角色包含共用内容和自己的操作约定，无 App 内容或占位符", () => {
    for (const id of ROLE_IDS) {
      const prompt = rolePrompt(id);
      expect(prompt).toContain(sharedRolePrompt(id));
      expect(prompt).toContain(sharedToolPrompt(id));
      expect(prompt).not.toMatch(appOnly);
      expect(prompt).not.toMatch(/{{\w+}}|<!-- (?:section:|endsection)/);
      expect(prompt.includes("background: true")).toBe(ROLES[id].canSpawn);
      expect(prompt.includes("## 文档工具")).toBe(ROLES[id].canWrite);
    }
    const writer = rolePrompt("writer");
    expect(writer).toContain("oldString");
    expect(writer).toContain("newString");
    expect(writer).not.toContain("old / new");
    expect(rolePrompt("director")).toContain("sessionID");
    expect(rolePrompt("director")).toContain("question");
  });

  test("全部能力按需加载，候选操作只来自插件本地文本", () => {
    for (const id of Object.keys(CAPABILITIES) as Array<keyof typeof CAPABILITIES>) {
      const prompt = capabilityPrompt(id);
      expect(prompt).toContain(CAPABILITIES[id].load());
      expect(prompt).not.toMatch(appOnly);
      expect(prompt).not.toMatch(/{{\w+}}/);
    }
    expect(capabilityPrompt("design")).toContain("只出候选，不落盘");
    expect(CAPABILITIES.design.load()).not.toContain("任务书第一行");
  });

  test("插件源码没有依赖 App 文本；自己的消息键均存在", () => {
    let references = 0;
    for (const name of readdirSync(new URL("../src/", import.meta.url)).filter((name) => name.endsWith(".ts"))) {
      const source = readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8");
      expect(source).not.toMatch(/hosts\/app|app\/instructions|hostText|renderHost|\.systemPrompt/);
      for (const [, key] of source.matchAll(/\btextValue\("([^"]+)"/g)) {
        expect(() => pluginText(key!)).not.toThrow();
        references++;
      }
    }
    expect(references).toBeGreaterThan(20);
    expect(() => pluginResources.markdown("../../core/text/app/status")).toThrow("Invalid text resource");
  });

  test("注册的共用工具说明不夹带 App 写入与派单接口", () => {
    for (const tool of materialTools(async () => null as never)) {
      expect(tool.description).not.toMatch(appOnly);
      expect(tool.description).not.toContain("docs.changed");
      expect(JSON.stringify(tool.input)).not.toMatch(appOnly);
    }
  });

  test("删除 App 文本的隔离副本仍能加载全部角色、能力和材料工具", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "opentomato-boundary-"));
    const core = fileURLToPath(new URL("../../core/", import.meta.url));
    const plugin = fileURLToPath(new URL("../", import.meta.url));
    try {
      await cp(path.join(core, "src"), path.join(root, "core/src"), { recursive: true });
      await cp(path.join(core, "text"), path.join(root, "core/text"), {
        recursive: true, filter: (source) => source !== path.join(core, "text/app"),
      });
      await cp(path.join(plugin, "src"), path.join(root, "plugin/src"), { recursive: true });
      await cp(path.join(plugin, "text"), path.join(root, "plugin/text"), { recursive: true });
      await writeFile(path.join(root, "core/package.json"), JSON.stringify({ type: "module", exports: { "./headless": "./src/headless.ts" } }));
      await symlink(path.join(core, "node_modules"), path.join(root, "core/node_modules"), "dir");
      await mkdir(path.join(root, "node_modules/@opentomato"), { recursive: true });
      await symlink(path.join(root, "core"), path.join(root, "node_modules/@opentomato/core"), "dir");
      await writeFile(path.join(root, "probe.ts"), `
        import { ROLE_IDS, CAPABILITY_IDS } from "@opentomato/core/headless";
        import { rolePrompt, capabilityPrompt } from "./plugin/src/text.ts";
        import { materialTools } from "./plugin/src/tools.ts";
        for (const id of ROLE_IDS) if (!rolePrompt(id)) throw Error(id);
        for (const id of CAPABILITY_IDS) if (!capabilityPrompt(id)) throw Error(id);
        if (materialTools(async () => null).length !== 11) throw Error("tools");
        console.log("9 roles, 16 capabilities, 11 tools; no App resources");
      `);
      const result = Bun.spawnSync([process.execPath, path.join(root, "probe.ts")], { cwd: root, stdout: "pipe", stderr: "pipe" });
      expect(result.stderr.toString()).toBe("");
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain("9 roles, 16 capabilities, 11 tools; no App resources");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

});
