import { CAPABILITIES } from "../agent/capabilities.js";
import type { CapabilityId } from "../protocol.js";
import type { RoleText } from "./compose.js";
import { markdown, section, text } from "./load.js";

/** App 只组装自己的界面和调用约定，不负责 opencode 的提示词。 */
export function appRolePrompt(shared: string, tools: string, role: Pick<RoleText, "id" | "canWrite" | "canSpawn">): string {
  const app = (key: string) => section("app/instructions", key);
  return [
    shared,
    tools,
    app("materials"),
    ...(role.canSpawn ? [app("lead"), app("annotations")] : []),
    ...(role.canWrite ? [app("write")] : []),
    ...(role.id === "writer" ? [app("writer")] : []),
    markdown("app/status"),
  ].join("\n\n");
}

export function appCapabilityInstructions(id: CapabilityId): string {
  return id === "design" ? section("app/instructions", "design") : "";
}

/** App 能力入口保留按钮发起与主编自行加载两种来源。 */
export function appCapabilityEntry(id: CapabilityId, by: "author" | "lead"): string {
  const label = CAPABILITIES[id].label;
  const head = text("app/messages/session", by === "author" ? "capabilities.message_4" : "capabilities.message_5", { v0: label });
  return [head, CAPABILITIES[id].load(), appCapabilityInstructions(id)].filter(Boolean).join("\n\n");
}
