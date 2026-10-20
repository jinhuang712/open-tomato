import type { RoleId } from "../protocol.js";
import { markdown, section } from "./load.js";
import { renderHost, type HostId } from "./host.js";

interface RoleText {
  id: RoleId;
  canWrite: boolean;
  canSpawn: boolean;
  canReview?: boolean;
  values: Record<string, unknown>;
}

/** 共同规则按协作关系维护；这里仅决定各角色需要哪些章节。 */
export function composeRolePrompt(role: RoleText, host: HostId): string {
  const raw = markdown(`roles/${role.id}`);
  const split = raw.indexOf("\n\n");
  const identity = split < 0 ? raw : raw.slice(0, split);
  const body = split < 0 ? "" : raw.slice(split + 2);
  const rules = (key: string) => section("collaboration", key);
  const parts = [
    identity,
    "{{ENVIRONMENT}}",
    rules("communication"),
    ...(role.canSpawn ? [rules("author"), rules("authorization"), rules("progression"), rules("dispatch"), rules("materials")] : []),
    rules("project-layout"),
    ...(role.canReview ? [rules("review-intent")] : []),
    body,
    ...(role.canWrite ? [rules("write-discipline")] : []),
    ...(role.canReview ? [rules("review-save")] : []),
    rules("trust-boundary"),
    ...(role.canSpawn ? [] : [rules("report")]),
    ...(role.canWrite ? ["{{DOCUMENTS}}"] : []),
    "{{status}}",
  ];
  return renderHost(parts.filter(Boolean).join("\n\n"), host, role.values).trim();
}
