import { stubPrompt } from "../../../protocol.js";
import { CAPABILITIES, capabilityInfos, isCapabilityId } from "../../capabilities.js";
import { roleInfos } from "../../roles.js";
import { LEAD_ID } from "../types.js";
import type { HandlerMap, KernelApi } from "./shared.js";

export function workflowHandlers(api: KernelApi): Pick<HandlerMap, "capabilities.list" | "capability.run" | "roles.list"> {
  return {
    "capabilities.list": async () => capabilityInfos(),
    "capability.run": async ({ id, params: capParams }) => {
      if (!isCapabilityId(id)) throw new Error(`未知能力：${String(id)}`);
      const cap = CAPABILITIES[id];
      for (const param of cap.params) {
        if (param.required && !(capParams[param.name] ?? "").trim()) throw new Error(`缺参数：${param.label}`);
      }
      const text = stubPrompt(cap.label, cap.render(capParams));
      const live = api.requireLive(LEAD_ID);
      api.authorActed(live);
      api.sendTo(LEAD_ID, text);
      return null;
    },
    "roles.list": async () => roleInfos(),
  };
}
