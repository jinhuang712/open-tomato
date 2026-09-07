import { randomUUID } from "node:crypto";
import { STUB_PATTERN, stubPrompt, systemStubLabel } from "../../../protocol.js";
import { loadPrompt } from "../../prompt-text.js";
import { LEAD_ID, type LiveAgent } from "../types.js";
import type { HandlerMap, KernelApi } from "./shared.js";

const PAUSE_PROMPT_LEAD = loadPrompt("kernel/pause-lead");
const PAUSE_PROMPT_CHILD = loadPrompt("kernel/pause-child");
/** 作者按「继续」：主编多半已经说过话、停在等作者点头；这句让它别再等、别重述，直接做下一步 */
export const CONTINUE_PROMPT = loadPrompt("kernel/continue");
/** 上次被打断：让主编看最后几条说清断在哪，从那一步接着做 */
export const RESUME_PROMPT = loadPrompt("kernel/resume");

/** 「接着上次」这一句的送法：按钮点的和切模型自动补的是同一条路 */
export async function resumeLead(api: KernelApi) {
  await api.ensureLead();
  const live = api.requireLive(LEAD_ID);
  api.authorActed(live);
  live.nudged = true;
  api.sendTo(LEAD_ID, stubPrompt("接着上次", RESUME_PROMPT), "followUp");
}

export function chatHandlers(
  api: KernelApi,
): Pick<HandlerMap, "chat.send" | "chat.continue" | "chat.resume" | "chat.insert" | "chat.clearQueue" | "chat.sessionFile" | "chat.pause" | "chat.abort" | "chat.new" | "agent.retire"> {
  return {
    "chat.send": async ({ text, agentId, deliverAs }) => {
      if (!agentId) await api.ensureLead();
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
    "chat.continue": async () => {
      await api.ensureLead();
      const live = api.requireLive(LEAD_ID);
      api.authorActed(live);
      // 历史都在会话里，模型知道停在哪；只补一句，不塞现状不塞步骤。这一句已算补过，轮末不再自动补第二句
      live.nudged = true;
      api.sendTo(LEAD_ID, stubPrompt("继续", CONTINUE_PROMPT), "followUp");
      return null;
    },
    "chat.resume": async () => {
      await resumeLead(api);
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
      // 内核合成的桩（暂停 / 继续）只给模型看，不是作者的话，不倒回输入框
      const texts = [...q.steering, ...q.followUp, ...live.inbox.map((e) => e.text)].filter((t) => systemStubLabel(t) === null);
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
        // pi 在一轮结束后会自动续跑它队列里剩下的 steer / followUp（暂停桩就排在那儿），
        // 掐断前先把队列倒空，否则 abort 一落地它就接着下一轮，界面上像没停。
        // 作者自己插的话不丢，退回我们的收件箱，作者再开口时一并送
        const q = a.session.clearQueue();
        const kept = [...q.steering, ...q.followUp]
          .filter((text) => systemStubLabel(text) === null)
          .map((text) => {
            const stub = STUB_PATTERN.exec(text);
            return { id: randomUUID(), label: stub ? stub[1]!.trim() : "排队", text };
          });
        a.inbox.unshift(...kept);
        a.steering = [];
        a.flushRest = false;
        api.emitQueue(a);
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
    "agent.retire": async ({ agentId }) => {
      await api.retireChild(agentId);
      return null;
    },
  };
}
