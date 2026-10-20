import { readFileSync } from "node:fs";
import type { AgentEditor } from "@opencode/plugin/promise/agent";
import { ROLE_IDS, ROLES, type RoleId } from "@opentomato/core/headless";
import { agentIdOf, roleOf } from "./roles.ts";
import { TOOL_PERMISSION } from "./tools.ts";

const CHILD_ROLES = ROLE_IDS.filter((role) => !ROLES[role].canSpawn);

const loadHostPrompt = (name: string) =>
  readFileSync(new URL(`../prompts/${name}.md`, import.meta.url), "utf8").trim();

/** core 的角色提示词原样用；opencode 和 App 不同的地方只在这两段里说，不改 core 的正文 */
const HOST = loadHostPrompt("host");
const HOST_LEAD = loadHostPrompt("host-lead");

export function systemPromptOf(role: RoleId): string {
  const def = ROLES[role];
  return [def.systemPrompt, HOST, ...(def.canSpawn ? [HOST_LEAD] : [])].join("\n\n");
}

type Rule = { action: string; resource: string; effect: "allow" | "deny" | "ask" };
const rule = (action: string, effect: Rule["effect"], resource = "*"): Rule => ({
  action,
  resource,
  effect,
});

/**
 * 能力集就是边界：一个角色拿不到的工具，就是它不该做的事。
 * 叠在 opencode 默认规则（全部 allow）之后，后写的规则优先。
 */
export function permissionsOf(role: RoleId): Rule[] {
  const def = ROLES[role];
  const writes = def.writableKinds.length > 0;
  const rules: Rule[] = [
    // 写作角色不跑命令、不打补丁、不进浏览器、不拿别处的 skill：落盘只走 write / edit，能力只走 load_capability
    rule("shell", "deny"),
    rule("skill", "deny"),
    rule("browser_*", "deny"),
    rule("opencode_worktree_*", "deny"),
    // 写入一律先问作者；只动记账字段的那种由写入钩子放行
    rule("edit", writes ? "ask" : "deny"),
  ];
  if (!writes) {
    // 联网查证与模板是动笔的活，评审与裁决对照章纲和正文下判断
    rules.push(
      rule("websearch", "deny"),
      rule("webfetch", "deny"),
      rule(`${TOOL_PERMISSION}.doc_template`, "deny"),
    );
  }
  if (def.canSpawn) {
    rules.push(
      rule("question", "allow"),
      rule("subagent", "deny"),
      ...CHILD_ROLES.map((child) => rule("subagent", "allow", agentIdOf(child))),
    );
  } else {
    // 子 agent 面向主编交付，不向作者提问，也不再往下派
    rules.push(
      rule("question", "deny"),
      rule("subagent", "deny"),
      rule(`${TOOL_PERMISSION}.load_capability`, "deny"),
    );
  }
  // 审稿记录只由评审自己落，结论不经主编转述
  if (!def.canReview) rules.push(rule(`${TOOL_PERMISSION}.save_review`, "deny"));
  return rules;
}

/** 注册主编和八个子角色，主编设为这个目录的默认 agent；别的 agent 看不见写作工具和写作角色 */
export function registerAgents(editor: AgentEditor): void {
  const others = editor
    .list()
    .map((agent) => String(agent.id))
    .filter((id) => roleOf(id) === undefined);
  for (const id of others) {
    editor.update(id, (agent) => {
      agent.permissions.push(
        rule(`${TOOL_PERMISSION}.*`, "deny"),
        ...CHILD_ROLES.map((child) => rule("subagent", "deny", agentIdOf(child))),
      );
    });
  }
  for (const role of ROLE_IDS) {
    const def = ROLES[role];
    editor.update(agentIdOf(role), (agent) => {
      // 编辑器把 branded string 映射成了对象类型（DeepMutable 的副作用），运行时就是字符串
      agent.name = def.label as unknown as typeof agent.name;
      agent.description = def.description;
      agent.mode = def.canSpawn ? "primary" : "subagent";
      agent.system = systemPromptOf(role);
      agent.permissions.push(...permissionsOf(role));
    });
  }
  editor.default(agentIdOf("director"));
}
