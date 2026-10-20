import { rolePrompt, text as textValue } from "@opentomato/core/headless";
import type { AgentEditor } from "@opencode/plugin/promise/agent";
import { ROLE_IDS, ROLES, type RoleId } from "@opentomato/core/headless";
import { agentIdOf, roleOf } from "./roles.ts";
import { deniedOutright, effectOf, rule, type Rule } from "./rules.ts";
import { TOOL_PERMISSION } from "./tools.ts";

const CHILD_ROLES = ROLE_IDS.filter((role) => !ROLES[role].canSpawn);

export function systemPromptOf(role: RoleId): string {
  return rolePrompt(role, "opencode");
}

/**
 * 能力集就是边界：一个角色拿不到的工具，就是它不该做的事。
 * 叠在 opencode 默认规则（全部 allow）之后，后写的规则优先。作者全局配置里的规则排得更后，
 * 一条 "*": "allow" 就能把这些全盖掉，所以 enforcePermission 在 evaluate 钩子里再按它算一遍。
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

/** 别的 agent：看不见写作工具，也派不了写作角色 */
const OTHERS: readonly Rule[] = [
  rule(`${TOOL_PERMISSION}.*`, "deny"),
  ...CHILD_ROLES.map((child) => rule("subagent", "deny", agentIdOf(child))),
];

const rulesOf = (agent: string): readonly Rule[] => {
  const role = roleOf(agent);
  return role ? permissionsOf(role) : OTHERS;
};

/**
 * 注册主编和八个子角色，一律隐藏：选择器、@ 提及、别的 agent 的派单清单里都没有它们，
 * 唯一的入口是 /open-tomato。默认 agent 不动。别的 agent 看不见写作工具，也派不了写作角色。
 */
export function registerAgents(editor: AgentEditor): void {
  const others = editor
    .list()
    .map((agent) => String(agent.id))
    .filter((id) => roleOf(id) === undefined);
  for (const id of others) {
    editor.update(id, (agent) => {
      agent.permissions.push(...OTHERS);
    });
  }
  for (const role of ROLE_IDS) {
    const def = ROLES[role];
    editor.update(agentIdOf(role), (agent) => {
      // 编辑器把 branded string 映射成了对象类型（DeepMutable 的副作用），运行时就是字符串
      agent.name = def.label as unknown as typeof agent.name;
      agent.description = def.description;
      agent.mode = def.canSpawn ? "primary" : "subagent";
      agent.hidden = true;
      agent.system = systemPromptOf(role);
      agent.permissions.push(...permissionsOf(role));
    });
  }
}

/**
 * 子角色隐藏后，opencode 不会把它们列进主编 subagent 工具的说明，这里补上。
 * 名字和职责取自 core 的角色定义。
 */
export function childRoster(): string {
  return [
    textValue("messages/opencode", "agents.message"),
    ...CHILD_ROLES.map((role) => `- ${agentIdOf(role)}：${ROLES[role].description}`),
  ].join("\n");
}

/**
 * 插件规则管得到的请求，结果以插件为准，压过作者全局配置里排在后面的规则。
 * 管不到的（读文件、查资料这类）照 opencode 原来的结果。
 */
export function enforcePermission(event: {
  readonly agent?: string;
  readonly action: string;
  readonly resources: readonly string[];
  effect: string;
}): void {
  if (event.agent === undefined) return;
  const own = effectOf(rulesOf(event.agent), event.action, event.resources);
  if (own) event.effect = own;
}

/** 工具名对应的权限动作：写作工具是 opentomato.<名字>，write / edit / patch 共用 edit，其余同名 */
const actionOf = (tool: string, own: ReadonlySet<string>): string =>
  own.has(tool)
    ? `${TOOL_PERMISSION}.${tool}`
    : tool === "write" || tool === "edit" || tool === "patch"
      ? "edit"
      : tool;

/**
 * 一律被拒的工具从清单里拿掉，和 opencode 自己隐藏全拒工具的做法一样；
 * 全局配置盖掉了插件规则时，它就不会再替插件隐藏，这里补上。
 */
export function pruneTools(
  agent: string,
  tools: Record<string, unknown>,
  own: ReadonlySet<string>,
): void {
  const rules = rulesOf(agent);
  for (const name of Object.keys(tools)) {
    if (deniedOutright(rules, actionOf(name, own))) delete tools[name];
  }
}
