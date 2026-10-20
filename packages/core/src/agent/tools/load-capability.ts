import { text as textValue } from "../../text/load.js";
import type { HostId } from "../../text/host.js";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "./define.js";
import { Type } from "typebox";
import { CAPABILITY_IDS, capabilityEntry, capabilityRoster, isCapabilityId } from "../capabilities.js";
import { text, type ToolContext } from "./shared.js";

/**
 * 主编自己进场一条能力。作者点按钮走 capability.run，内核以主编身份送进同一份正文；
 * 加载说明不算选定创作方案，也不算获得写入授权。
 */
export function makeLoadCapabilityTool(_ctx: ToolContext, host: HostId = "app"): ToolDefinition {
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
      return text(capabilityEntry(params.id, "lead", host));
    },
  });
}
