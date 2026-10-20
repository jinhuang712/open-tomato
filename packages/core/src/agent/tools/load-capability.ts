import { text as textValue } from "../../text/load.js";
import type { CapabilityId } from "../../protocol.js";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "./define.js";
import { Type } from "typebox";
import { CAPABILITY_IDS, capabilityRoster, isCapabilityId } from "../capabilities.js";
import { text, type ToolContext } from "./shared.js";

/**
 * 共用能力工具；调用方必须提供自己的宿主入口，不默认选择 App 或 opencode。
 * 加载说明不算选定创作方案，也不算获得写入授权。
 */
export function makeLoadCapabilityTool(_ctx: ToolContext, entry: (id: CapabilityId) => string): ToolDefinition {
  return defineTool({
    name: "load_capability",
    label: textValue("tools/conversation", "load_capability.label"),
    description:
      textValue("tools/conversation", "load_capability.description", { capabilities: capabilityRoster() }),
    parameters: Type.Object({
      id: Type.String({ description: textValue("tools/conversation", "load_capability.parameters.id.description", { v0: CAPABILITY_IDS.join(" / ") }) }),
    }),
    execute: async (_id, params) => {
      if (!isCapabilityId(params.id)) throw new Error(textValue("messages/session", "load_capability.execute", { v0: params.id, v1: CAPABILITY_IDS.join(" / ") }));
      return text(entry(params.id));
    },
  });
}
