import { ROLE_IDS, ROLES, type RoleId } from "@opentomato/core/headless";

/** agent id 就是角色名：主编派单写「策划」，opencode 的 subagent 工具也认这个 */
export const agentIdOf = (role: RoleId): string => ROLES[role].label;

const ROLE_BY_AGENT = new Map(ROLE_IDS.map((role) => [agentIdOf(role), role]));

/** opencode 里的 agent 是哪个 OpenTomato 角色；不是写作角色返回 undefined */
export const roleOf = (agent: string | undefined): RoleId | undefined =>
  agent === undefined ? undefined : ROLE_BY_AGENT.get(agent);
