import {
  CAPABILITIES,
  ROLES,
  sharedRolePrompt,
  sharedToolPrompt,
  createTextLoader,
  type CapabilityId,
  type RoleId,
} from "@opentomato/core/headless";

/** 插件只读取自己包内的宿主资源，不读取 core 的 app/。 */
export const pluginResources = createTextLoader(new URL("../text/", import.meta.url));

export function pluginText(key: string, values?: Record<string, unknown>): string {
  return pluginResources.text("messages", key, values);
}

export function rolePrompt(id: RoleId): string {
  const role = ROLES[id];
  const local = (key: string) => pluginResources.section("instructions", key);
  return [
    local("environment"),
    sharedRolePrompt(id),
    sharedToolPrompt(id),
    local("materials"),
    ...(role.canSpawn ? [local("lead")] : []),
    ...(role.canWrite ? [local("write")] : []),
    ...(id === "writer" ? [local("writer")] : []),
  ].join("\n\n");
}

export function capabilityPrompt(id: CapabilityId): string {
  return [
    pluginText("capability.loaded", { label: CAPABILITIES[id].label }),
    CAPABILITIES[id].load(),
    ...(id === "design" ? [pluginResources.section("instructions", "design")] : []),
  ].join("\n\n");
}
