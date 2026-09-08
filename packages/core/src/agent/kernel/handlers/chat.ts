import { randomUUID } from "node:crypto";
import { queueLabel, stubPrompt, systemStubLabel } from "../../../protocol.js";
import { loadPrompt } from "../../prompt-text.js";
import { LEAD_ID, type LiveAgent } from "../types.js";
import type { HandlerMap, KernelApi } from "./shared.js";

const PAUSE_PROMPT_LEAD = loadPrompt("kernel/pause-lead");
const PAUSE_PROMPT_CHILD = loadPrompt("kernel/pause-child");
/** 继续只恢复对话循环，不替作者作答或指定下一步动作 */
export const CONTINUE_PROMPT = loadPrompt("kernel/continue");
/** 会话恢复从已有上下文接续，与继续采用相同的授权边界 */
export const RESUME_PROMPT = loadPrompt("kernel/resume");

/** 「接着上次」这一句的送法：按钮点的和切模型自动补的是同一条路 */
export async function resumeLead(api: KernelApi) {
  await api.ensureLead();
  const live = api.requireLive(LEAD_ID);
  // 断在等作者答题：问题已经原样挂回门上，作者答了就接着走。这时再送「接着上次」，主编只会把同一个问题重问一遍
  if (api.gate.hasPendingQuestion(LEAD_ID)) return;
  api.authorActed(live);
  api.sendTo(LEAD_ID, stubPrompt("接着上次", RESUME_PROMPT), "followUp");
}

export function chatHandlers(
  api: KernelApi,
): Pick<HandlerMap, "chat.send" | "chat.continue" | "chat.resume" | "chat.insert" | "chat.cancelQueued" | "chat.sessionFile" | "chat.pause" | "chat.abort" | "chat.new" | "agent.archive" | "agent.retire"> {
  return {
    "chat.send": async ({ text, agentId, deliverAs }) => {
      if (!agentId) await api.ensureLead();
      const live = api.requireLive(agentId ?? LEAD_ID);
      api.authorActed(live);
      const how = deliverAs ?? "steer";
      // 排队的不进 pi 的队列，进我们自己的收件箱：能单条打断、能单条取消，轮末一并送
      if (how === "followUp" && live.session.isStreaming) {
        live.inbox.push({ id: randomUUID(), label: queueLabel(text), text });
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
      // 按普通输入恢复循环，保留正常的可见回应兜底；不指定工具或代答。
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
      // 只动作者自己的话：收件箱里还躺着子 agent 交回的报告，那不归他调度
      if (systemStubLabel(live.inbox[at]!.text) !== null) return null;
      const [entry] = live.inbox.splice(at, 1);
      api.authorActed(live);
      api.sendTo(live.info.agentId, entry!.text, "steer");
      api.emitQueue(live);
      return null;
    },
    "chat.cancelQueued": async ({ agentId, id }) => {
      const live = api.agents.get(agentId ?? LEAD_ID);
      if (!live) return null;
      // 只认收件箱里的：已经交给 pi 的撤不回，也没有稳定的 id 可寻址。
      // 子 agent 交回的报告同在这个收件箱，但作者撤不掉它 —— 那是主编还没读的活儿，撤了就凭空没了
      const target = live.inbox.find((e) => e.id === id);
      if (!target || systemStubLabel(target.text) !== null) return null;
      live.inbox = live.inbox.filter((e) => e.id !== id);
      if (live.inbox.length === 0) live.flushRest = false;
      api.emitQueue(live);
      return null;
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
          .map((text) => ({ id: randomUUID(), label: queueLabel(text), text }));
        a.inbox.unshift(...kept);
        a.steering = [];
        a.flushRest = false;
        api.emitQueue(a);
        await a.session.abort().catch(() => {});
        // 掐断的是子 agent：这一轮的报告不会再来了，状态就得说被打断。
        // 留着「在跑」，主编一查 list_agents 读到的是「等它交回」，就会接着等一个死人——
        // 这不是循环停了需要人推，是它手里的事实过期了。
        // 所以不等主编来查，顺手推一条过去：走报告同一条路（跑着就排队，空着就直送）。
        if (a.info.parentId !== null && a.info.status === "running") {
          api.setStatus(a, "interrupted");
          const parent = api.agents.get(a.info.parentId);
          if (parent) {
            const text = stubPrompt(
              `${a.info.handle}被打断`,
              `${a.info.handle}被作者停止，这一轮的报告不会来了。要接着做就重新 spawn_agents，或这条线的活你自己接过来。`,
            );
            if (parent.session.isStreaming || parent.hold) {
              parent.inbox.push({ id: randomUUID(), label: `${a.info.handle}被打断`, text });
              api.emitQueue(parent);
            } else {
              api.sendTo(parent.info.agentId, text);
            }
          }
        }
      }
      return null;
    },
    "chat.new": async () => {
      api.requireStore();
      await api.disposeAgents(true);
      await api.createLead("new");
      return null;
    },
    "agent.archive": async ({ agentId }) => {
      await api.archiveChild(agentId);
      return null;
    },
    "agent.retire": async ({ agentId }) => {
      await api.retireChild(agentId);
      return null;
    },
  };
}
