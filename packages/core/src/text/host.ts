import { catalog, fill } from "./load.js";

export const HOST_IDS = ["app", "opencode"] as const;
export type HostId = (typeof HOST_IDS)[number];

export function isHostId(value: unknown): value is HostId {
  return HOST_IDS.some((host) => host === value);
}

/** 只替换已声明的工具标识，不改文件路径、schema 或运行时权限。 */
export function hostText(source: string, host: HostId): string {
  const profile = catalog(`hosts/${host}`);
  return source.replace(/\b(?:ask_user|spawn_agents|continue_agent|write_doc|edit_doc|web_search)\b/g, (tool) => {
    const name = profile[`tool.${tool}`];
    if (typeof name !== "string") throw new Error(`Missing host tool: ${host}:${tool}`);
    return name;
  });
}

export function renderHost(source: string, host: HostId = "app", values: Record<string, unknown> = {}): string {
  return hostText(fill(source, { ...catalog(`hosts/${host}`), ...values }), host);
}
