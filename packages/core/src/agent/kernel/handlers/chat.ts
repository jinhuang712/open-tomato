import { randomUUID } from "node:crypto";
import { STUB_PATTERN, stubPrompt } from "../../../protocol.js";
import { loadPrompt } from "../../prompt-text.js";
import { LEAD_ID, type LiveAgent } from "../types.js";
import type { HandlerMap, KernelApi } from "./shared.js";

const PAUSE_PROMPT_LEAD = loadPrompt("kernel/pause-lead");
const PAUSE_PROMPT_CHILD = loadPrompt("kernel/pause-child");

export function chatHandlers(
  api: KernelApi,
): Pick<HandlerMap, "chat.send" | "chat.insert" | "chat.clearQueue" | "chat.sessionFile" | "chat.pause" | "chat.abort" | "chat.new"> {
  return {
    "chat.send": async ({ text, agentId, deliverAs }) => {
      const live = api.requireLive(agentId ?? LEAD_ID);
      api.authorActed(live);
      const how = deliverAs ?? "steer";
      // 排队的不进 pi 的队列，进我们自己的收件箱：能单条插入、能撤回，轮末一并送
      if (how === "followUp" && live.session.isStreaming) {
        const stub = STUB_PATTERN.exec(text);
        live.inbox.push({ id: randomUUID(), label: stub ? stub[1]!.trim() : "排队", text });
        api.emitQueue(live);
        return null;
      }
      api.sendTo(live.info.agentId, text, how);
      return null;
    },
    "chat.insert": async ({ agentId, id }) => {
      const live = api.requireLive(agentId ?? LEAD_ID);
      const at = live.inbox.findIndex((e) => e.id === id);
      if (at < 0) return null;
      const [entry] = live.inbox.splice(at, 1);
      api.authorActed(live);
      api.sendTo(live.info.agentId, entry!.text, "steer");
      api.emitQueue(live);
      return null;
    },
    "chat.clearQueue": async ({ agentId }) => {
      const live = api.agents.get(agentId ?? LEAD_ID);
      if (!live) return { texts: [] };
      const q = live.session.clearQueue();
      const texts = [...q.steering, ...q.followUp, ...live.inbox.map((e) => e.text)];
      live.inbox = [];
      live.steering = [];
      live.flushRest = false;
      api.emitQueue(live);
      return { texts };
    },
    "chat.sessionFile": async ({ agentId }) => {
      const live = api.agents.get(agentId ?? LEAD_ID);
      return live?.session.sessionFile ?? null;
    },
    "chat.pause": async ({ agentId }) => {
      const id = agentId ?? LEAD_ID;
      const live = api.agents.get(id);
      if (!live) throw new Error("这个 agent 已经不在了");
      if (live.info.status !== "running") return null;
      // 暂停有两层意思：让它收尾这一步，以及这轮结束后别去取收件箱。作者再开口两者都解除
      live.hold = true;
      const text = stubPrompt("暂停", live.info.role === "director" ? PAUSE_PROMPT_LEAD : PAUSE_PROMPT_CHILD);
      // steer 会插在当前这步工具结束之后，正在写的东西不会被掐断
      live.session.prompt(text, { streamingBehavior: "steer" }).catch(() => {});
      return null;
    },
    "chat.abort": async ({ agentId }) => {
      const targets = agentId ? [api.agents.get(agentId)].filter((a): a is LiveAgent => !!a) : [...api.agents.values()];
      for (const a of targets) {
        // 作者按了停止：这轮的 agent_end 不算「没问就停」，也不去取收件箱，作者再开口才动
        a.hold = true;
        await a.session.abort().catch(() => {});
      }
      return null;
    },
    "chat.new": async () => {
      api.requireStore();
      await api.disposeAgents(true);
      await api.createLead("new");
      return null;
    },
  };
}
