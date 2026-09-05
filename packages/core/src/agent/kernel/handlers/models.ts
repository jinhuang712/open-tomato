import { LEAD_ID } from "../types.js";
import type { HandlerMap, KernelApi } from "./shared.js";

export function modelHandlers(api: KernelApi): Pick<HandlerMap, "models.list" | "models.select" | "models.setApiKey" | "models.refresh"> {
  return {
    "models.list": async () => api.models.state(),
    "models.select": async ({ provider, id, thinkingLevel }) => {
      const model = await api.models.select(provider, id, thinkingLevel);
      const lead = api.agents.get(LEAD_ID);
      if (lead) {
        await lead.session.setModel(model);
        lead.session.setThinkingLevel(api.models.thinkingLevel);
      }
      const state = api.models.state();
      api.emit({ type: "models.state", state });
      return state;
    },
    "models.setApiKey": async ({ provider, apiKey }) => {
      await api.models.setApiKey(provider, apiKey);
      const state = api.models.state();
      api.emit({ type: "models.state", state });
      return state;
    },
    "models.refresh": async () => {
      await api.models.refresh();
      const state = api.models.state();
      api.emit({ type: "models.state", state });
      return state;
    },
  };
}
