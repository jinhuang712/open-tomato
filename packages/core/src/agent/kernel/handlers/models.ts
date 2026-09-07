import { LEAD_ID } from "../types.js";
import { resumeLead } from "./chat.js";
import type { HandlerMap, KernelApi } from "./shared.js";

export function modelHandlers(api: KernelApi): Pick<HandlerMap, "models.list" | "models.select" | "models.setApiKey" | "models.refresh"> {
  return {
    "models.list": async () => api.models.state(),
    "models.select": async ({ provider, id, thinkingLevel }) => {
      const model = await api.models.select(provider, id, thinkingLevel);
      const lead = api.agents.get(LEAD_ID);
      if (lead) {
        const wasBroken = lead.info.status === "error";
        await lead.session.setModel(model);
        lead.session.setThinkingLevel(api.models.thinkingLevel);
        // 上一个模型把这轮跑死了（限流到底 / 404 / 鉴权）：作者换模型就是想接着做，不用再点一次「接着上次」
        if (wasBroken) await resumeLead(api);
      } else {
        // 开项目时没模型，主编欠着；现在有了就补建，建出来的会话直接拿当前模型
        await api.ensureLead();
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
