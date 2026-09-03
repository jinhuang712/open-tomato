import { createStore, produce } from "solid-js/store";
import type {
  AgentInfo,
  AgentStreamEvent,
  ApprovalRequest,
  CapabilityInfo,
  CheckIssue,
  DocHeader,
  DocKindId,
  DocKindInfo,
  KernelEvent,
  ModelsState,
  ProjectInfo,
  QuestionRequest,
  UiMessage,
  UiPart,
} from "@opentomato/core/protocol";
import { bridge } from "./bridge";

export type View = { type: "chat"; agentId: string } | { type: "doc"; kind: DocKindId; id: string };

export interface Toast {
  id: number;
  level: "info" | "error";
  text: string;
}


export interface ComposerQuote {
  id: string;
  /** 被圈的是谁说的话 */
  role: "user" | "assistant";
  text: string;
}

export interface State {
  ready: boolean;
  home: string;
  kernelError: string | null;
  project: ProjectInfo | null;
  docs: DocHeader[];
  kinds: DocKindInfo[];
  models: ModelsState | null;
  agents: Record<string, AgentInfo>;
  agentOrder: string[];
  transcripts: Record<string, UiMessage[]>;
  /** agentId → 上次被打断时的最后一条消息 id，UI 在它后面画分隔线 */
  interruptedAfter: Record<string, string>;
  /** agentId → 还没送到的消息：插话的和排队的 */
  queues: Record<string, { steering: string[]; followUp: string[] }>;
  approvals: ApprovalRequest[];
  questions: QuestionRequest[];
  issues: CheckIssue[] | null;
  view: View;
  capabilities: CapabilityInfo[];
  recent: string[];
  toasts: Toast[];
  modelPickerOpen: boolean;
  capabilityDialog: CapabilityInfo | null;
  searchOpen: boolean;
  /** 快捷按钮往输入框里预填的文字；Composer 消费后清空 */
  composerDraft: string | null;
  /** 作者在主会话里圈出来准备批注的段落，随下一条消息一起发出 */
  composerQuotes: ComposerQuote[];
  /** 正在弹窗审阅的 approvalId */
  reviewOpen: string | null;
}

const initial: State = {
  ready: false,
  home: "",
  kernelError: null,
  project: null,
  docs: [],
  kinds: [],
  models: null,
  agents: {},
  agentOrder: [],
  transcripts: {},
  interruptedAfter: {},
  queues: {},
  approvals: [],
  questions: [],
  issues: null,
  view: { type: "chat", agentId: "lead" },
  capabilities: [],
  recent: [],
  toasts: [],
  modelPickerOpen: false,
  capabilityDialog: null,
  searchOpen: false,
  composerDraft: null,
  composerQuotes: [],
  reviewOpen: null,
};

export const [state, setState] = createStore<State>(initial);

let toastSeq = 0;
export function toast(text: string, level: Toast["level"] = "info") {
  const id = ++toastSeq;
  setState("toasts", (t) => [...t, { id, level, text }]);
  setTimeout(() => setState("toasts", (t) => t.filter((x) => x.id !== id)), level === "error" ? 6000 : 3000);
}

// ───────────────────────── 事件归约 ─────────────────────────

export function applyEvent(ev: KernelEvent) {
  switch (ev.type) {
    case "kernel.ready":
      console.info(`[ui] kernel ready v${ev.version} home=${ev.home}`);
      setState({ ready: true, home: ev.home, kernelError: null });
      void refreshAfterReady();
      // 内核崩溃重拉后是空的，把界面上还开着的项目重新打开
      if (state.project) void actions.openProject(state.project.root);
      else if (bridge.initialProject) void actions.openProject(bridge.initialProject);
      return;
    case "kernel.error":
      setState("kernelError", ev.message);
      toast(ev.message, "error");
      return;
    case "project.opened":
      setState({
        project: ev.project,
        docs: ev.docs,
        kinds: ev.kinds,
        agents: {},
        agentOrder: [],
        transcripts: {},
        interruptedAfter: {},
        approvals: [],
        questions: [],
        issues: null,
        view: { type: "chat", agentId: "lead" },
      });
      void bridge.request("project.recent", {}).then((r) => setState("recent", r));
      return;
    case "project.closed":
      setState({ project: null, docs: [], agents: {}, agentOrder: [], transcripts: {}, approvals: [], questions: [], issues: null });
      return;
    case "docs.changed":
      setState("docs", ev.docs);
      return;
    case "models.state":
      setState("models", ev.state);
      return;
    case "agent.spawned":
      setState(
        produce((s) => {
          s.agents[ev.agent.agentId] = ev.agent;
          if (!s.agentOrder.includes(ev.agent.agentId)) s.agentOrder.push(ev.agent.agentId);
          if (!s.transcripts[ev.agent.agentId]) s.transcripts[ev.agent.agentId] = [];
        }),
      );
      return;
    case "agent.status":
      setState(
        produce((s) => {
          const a = s.agents[ev.agentId];
          if (a) {
            a.status = ev.status;
            a.error = ev.error;
            if (ev.status !== "running") {
              a.statusText = "";
              // agent 停了，它挂着的待答 / 待审不可能再有人接，一并撤掉
              s.questions = s.questions.filter((q) => q.agentId !== ev.agentId);
              s.approvals = s.approvals.filter((x) => x.agentId !== ev.agentId);
            }
          }
        }),
      );
      return;
    case "agent.event":
      applyAgentEvent(ev.agentId, ev.event);
      return;
    case "approval.requested":
      setState("approvals", (a) => [...a, ev.request]);
      // 没在审别的就直接弹出来
      if (!state.reviewOpen) setState("reviewOpen", ev.request.approvalId);
      return;
    case "approval.resolved":
      setState("approvals", (a) => a.filter((x) => x.approvalId !== ev.approvalId));
      if (state.reviewOpen === ev.approvalId) setState("reviewOpen", null);
      return;
    case "question.requested":
      setState("questions", (q) => [...q, ev.request]);
      return;
    case "question.resolved":
      setState("questions", (q) => q.filter((x) => x.questionId !== ev.questionId));
      return;
    case "check.result":
      setState("issues", ev.issues);
      return;
    default:
      return;
  }
}

const textOf = (m: UiMessage) => m.parts.filter((p) => p.type === "text").map((p) => p.text).join("\n");

function isDuplicateUser(prev: UiMessage | undefined, next: UiMessage): boolean {
  return !!prev && prev.role === "user" && textOf(prev) === textOf(next) && Math.abs(next.createdAt - prev.createdAt) < 5000;
}

function applyAgentEvent(agentId: string, ev: AgentStreamEvent) {
  setState(
    produce((s) => {
      const list = (s.transcripts[agentId] ??= []);
      const findMsg = (id: string) => list.find((m) => m.id === id);
      const lastAssistant = () => [...list].reverse().find((m) => m.role === "assistant");

      switch (ev.type) {
        case "history": {
          s.transcripts[agentId] = ev.messages;
          const last = ev.messages.at(-1);
          if (ev.interrupted && last) s.interruptedAfter[agentId] = last.id;
          else delete s.interruptedAfter[agentId];
          return;
        }
        case "status_text": {
          const a = s.agents[agentId];
          if (a) a.statusText = ev.text;
          return;
        }
        case "queue_update": {
          s.queues[agentId] = { steering: ev.steering, followUp: ev.followUp };
          return;
        }
        case "message_start":
          if (findMsg(ev.message.id)) return;
          // 同一条用户消息可能被上游按不同 id 报两次，按内容 + 时间兜底去重
          if (ev.message.role === "user" && isDuplicateUser(list.at(-1), ev.message)) return;
          list.push(ev.message);
          return;
        case "text_delta":
        case "thinking_delta": {
          const msg = findMsg(ev.messageId) ?? lastAssistant();
          if (!msg) return;
          const want = ev.type === "text_delta" ? "text" : "thinking";
          const last = msg.parts[msg.parts.length - 1];
          if (last && last.type === want) last.text += ev.delta;
          else msg.parts.push({ type: want, text: ev.delta } as UiPart);
          return;
        }
        case "tool_start": {
          const msg = findMsg(ev.messageId) ?? lastAssistant();
          if (!msg) return;
          const existing = msg.parts.find((p) => p.type === "tool" && p.toolCallId === ev.toolCallId);
          if (existing && existing.type === "tool") {
            existing.status = "running";
            existing.args = ev.args;
          } else {
            msg.parts.push({ type: "tool", toolCallId: ev.toolCallId, name: ev.name, args: ev.args, status: "running", output: "", details: null });
          }
          return;
        }
        case "tool_update":
        case "tool_end": {
          for (const m of list) {
            const part = m.parts.find((p) => p.type === "tool" && p.toolCallId === ev.toolCallId);
            if (part && part.type === "tool") {
              part.output = ev.output;
              part.details = ev.details;
              if (ev.type === "tool_end") part.status = ev.isError ? "error" : "done";
              return;
            }
          }
          return;
        }
        case "message_end": {
          const idx = list.findIndex((m) => m.id === ev.message.id);
          if (idx < 0) {
            if (!(ev.message.role === "user" && isDuplicateUser(list.at(-1), ev.message))) list.push(ev.message);
            return;
          }
          const old = list[idx]!;
          const merged: UiMessage = { ...ev.message, parts: ev.message.parts.map((p) => ({ ...p })) };
          for (const p of merged.parts) {
            if (p.type !== "tool") continue;
            const prev = old.parts.find((q) => q.type === "tool" && q.toolCallId === p.toolCallId);
            if (prev && prev.type === "tool") {
              p.status = prev.status;
              p.output = prev.output;
              p.details = prev.details;
              // tool_start 带来的参数比消息体里的可靠（消息体可能是截断的流）
              if (prev.args && typeof prev.args === "object" && Object.keys(prev.args as object).length > 0) p.args = prev.args;
            }
          }
          list[idx] = merged;
          return;
        }
        default:
          return;
      }
    }),
  );
}

// ───────────────────────── 请求封装 ─────────────────────────

async function refreshAfterReady() {
  try {
    const [recent, caps, models] = await Promise.all([
      bridge.request("project.recent", {}),
      bridge.request("capabilities.list", {}),
      bridge.request("models.list", {}),
    ]);
    setState({ recent, capabilities: caps, models });
  } catch (e) {
    toast(errText(e), "error");
  }
}

export function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const actions = {
  async newProject() {
    const root = await bridge.pickFolder({ title: "选择一个空文件夹作为新项目", create: true });
    if (!root) return;
    const name = root.split("/").filter(Boolean).pop() ?? "新书";
    try {
      await bridge.request("project.create", { root, name });
    } catch (e) {
      toast(errText(e), "error");
    }
  },
  async openProject(root?: string) {
    const target = root ?? (await bridge.pickFolder({ title: "打开项目文件夹", create: false }));
    if (!target) return;
    try {
      await bridge.request("project.open", { root: target });
    } catch (e) {
      toast(errText(e), "error");
    }
  },
  async closeProject() {
    await bridge.request("project.close", {}).catch((e) => toast(errText(e), "error"));
  },
  async send(text: string, agentId?: string, deliverAs: "steer" | "followUp" = "steer") {
    const t = text.trim();
    if (!t) return;
    try {
      await bridge.request("chat.send", { text: t, deliverAs, ...(agentId && agentId !== "lead" ? { agentId } : {}) });
    } catch (e) {
      toast(errText(e), "error");
    }
  },
  /** 立刻掐断：模型调用和工具都停，在最后一条消息后画「被打断」分隔线 */
  async stop(agentId?: string) {
    const id = agentId ?? "lead";
    try {
      await bridge.request("chat.abort", id !== "lead" ? { agentId: id } : {});
      const last = state.transcripts[id]?.at(-1);
      if (last) setState("interruptedAfter", id, last.id);
      toast("已停下");
    } catch (e) {
      toast(errText(e), "error");
    }
  },
  /** 撤回排队中的消息，原文拼回输入框 */
  async recallQueue(agentId?: string) {
    try {
      const q = await bridge.request("chat.clearQueue", agentId && agentId !== "lead" ? { agentId } : {});
      const texts = [...q.steering, ...q.followUp];
      setState("queues", agentId ?? "lead", { steering: [], followUp: [] });
      if (texts.length > 0) setState("composerDraft", texts.join("\n\n"));
    } catch (e) {
      toast(errText(e), "error");
    }
  },
  async pause(agentId?: string) {
    try {
      await bridge.request("chat.pause", agentId && agentId !== "lead" ? { agentId } : {});
      toast("已请求暂停，agent 会收尾后停下来问你");
    } catch (e) {
      toast(errText(e), "error");
    }
  },
  async newChat() {
    try {
      await bridge.request("chat.new", {});
      toast("已开始新会话");
    } catch (e) {
      toast(errText(e), "error");
    }
  },
  async runCapability(id: CapabilityInfo["id"], params: Record<string, string>) {
    try {
      await bridge.request("capability.run", { id, params });
      setState({ capabilityDialog: null, view: { type: "chat", agentId: "lead" } });
    } catch (e) {
      toast(errText(e), "error");
    }
  },
  async approve(approvalId: string) {
    await bridge.request("approval.reply", { approvalId, decision: "approve" }).catch((e) => toast(errText(e), "error"));
  },
  async reject(approvalId: string, reason: string) {
    await bridge.request("approval.reply", { approvalId, decision: "reject", reason }).catch((e) => toast(errText(e), "error"));
  },
  async answer(questionId: string, answer: string) {
    await bridge.request("question.reply", { questionId, answer }).catch((e) => toast(errText(e), "error"));
  },
  async runCheck() {
    try {
      await bridge.request("check.run", {});
    } catch (e) {
      toast(errText(e), "error");
    }
  },
  async selectModel(provider: string, id: string, thinkingLevel?: ModelsState["thinkingLevel"]) {
    try {
      await bridge.request("models.select", thinkingLevel ? { provider, id, thinkingLevel } : { provider, id });
    } catch (e) {
      toast(errText(e), "error");
    }
  },
  async setApiKey(provider: string, apiKey: string) {
    try {
      await bridge.request("models.setApiKey", { provider, apiKey });
      toast(`${provider} 的 API key 已保存`);
    } catch (e) {
      toast(errText(e), "error");
    }
  },
  async refreshModels() {
    try {
      await bridge.request("models.refresh", {});
      toast("模型目录已刷新");
    } catch (e) {
      toast(errText(e), "error");
    }
  },
  async exportChat(agentId?: string) {
    const id = agentId ?? (state.view.type === "chat" ? state.view.agentId : "lead");
    const { exportTranscript } = await import("./exportTranscript");
    const { filename, content } = exportTranscript(id);
    try {
      const saved = await bridge.saveTextFile({ defaultName: filename, content });
      if (saved) toast(`已导出：${saved}`);
    } catch (e) {
      toast(errText(e), "error");
    }
  },
  openDoc(kind: DocKindId, id: string) {
    setState("view", { type: "doc", kind, id });
  },
  openChat(agentId: string) {
    setState("view", { type: "chat", agentId });
  },
};
