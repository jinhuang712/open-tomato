import type { RoleId } from "../protocol.js";
import { fill, markdown, section } from "./load.js";

export interface RoleText {
  id: RoleId;
  canWrite: boolean;
  canSpawn: boolean;
  canReview?: boolean;
  values: Record<string, unknown>;
}

/** 只组装写作与协作规则；这里不能读取宿主资源或工具说明。 */
export function composeRolePrompt(role: RoleText): string {
  const rules = (key: string) => section("shared/collaboration", key);
  return fill([
    markdown(`shared/roles/${role.id}`),
    rules("communication"),
    ...(role.canSpawn ? [rules("author"), rules("authorization"), rules("dispatch"), rules("materials")] : []),
    rules("project-layout"),
    ...(role.canReview ? [rules("review-intent"), rules("review-save")] : []),
    ...(role.canWrite ? [rules("write-discipline")] : []),
    rules("trust-boundary"),
    ...(role.canSpawn ? [] : [rules("report")]),
  ].join("\n\n"), role.values);
}

/** 两端确实复用的工具接口，按代码中的角色权限选择。 */
export function composeToolPrompt(role: RoleText): string {
  const tools = (key: string) => section("tools/instructions", key);
  return fill([
    tools("materials"),
    ...(role.canSpawn ? [tools("lead")] : []),
    ...(role.canWrite ? [tools("write")] : []),
    ...(role.canReview ? [tools("review")] : []),
    ...(["writer", "plotter", "proofreader"].includes(role.id) ? [tools(role.id)] : []),
  ].join("\n\n"), role.values);
}
