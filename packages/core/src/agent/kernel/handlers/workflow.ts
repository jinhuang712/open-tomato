import { stubPrompt } from "../../../protocol.js";
import { CAPABILITIES, capabilityEntry, capabilityInfos, isCapabilityId } from "../../capabilities.js";
import { roleInfos } from "../../roles.js";
import { LEAD_ID } from "../types.js";
import type { HandlerMap, KernelApi } from "./shared.js";

export function workflowHandlers(api: KernelApi): Pick<HandlerMap, "capabilities.list" | "capability.run" | "roles.list"> {
  return {
    "capabilities.list": async () => capabilityInfos(),
    "capability.run": async ({ id }) => {
      if (!isCapabilityId(id)) throw new Error(`未知能力：${String(id)}`);
      const text = stubPrompt(CAPABILITIES[id].label, capabilityEntry(id, "author"));
      await api.ensureLead();
      const live = api.requireLive(LEAD_ID);
      api.authorActed(live);
      api.sendTo(LEAD_ID, text);
      return null;
    },
    "roles.list": async () => roleInfos(),
  };
}
