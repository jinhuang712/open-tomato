import { createStore, produce } from "solid-js/store";
import type {
  AgentInfo,
  AgentStreamEvent,
  ApprovalRequest,
  CapabilityInfo,
  CheckIssue,
  CloudProject,
  CloudProjectRow,
  CloudStatus,
  DocHeader,
  DocKindId,
  DocKindInfo,
  KernelEvent,
  ModelsState,
  ProjectInfo,
  QuestionRequest,
  QueueItem,
  UiMessage,
  UiPart,
} from "@opentomato/core/protocol";
import { bridge } from "./bridge";

export type View = { type: "chat"; agentId: string } | { type: "doc"; kind: DocKindId; id: string; focus?: string };

/** 一段引文是从哪儿圈出来的：悬着的审批，或已落盘的材料。没有 source 的是对话里的话 */
export type QuoteSource = { type: "approval"; approvalId: string; path: string } | { type: "doc"; kind: DocKindId; id: string; path: string };

/**
 * 批注：作者对一段材料说的话。对话里只留一个桩（批注 N），点桩跳回原处看全文。
 * 只活在内存：审批一关、或那段被改掉，就没了。它是批注，不是标签。
 */
export interface Annotation {
  label: string;
  source: QuoteSource;
  quotes: string[];
  text: string;
}

export type SettingsTab = "keymap" | "models" | "storage" | "about";

export interface Toast {
  id: number;
  level: "info" | "error";
  text: string;
}


/** 云端同步的即时状态：内核 cloud.sync 事件归约而来 */
export interface CloudSyncState {
  phase: "uploading" | "idle" | "error";
  message: string | null;
  /** 云端最近一次快照（已知的话） */
  last: CloudProject | null;
  /** 本地是否已在云端：null = 未知 */
  synced: boolean | null;
}

export interface ComposerQuote {
  id: string;
  /** 被圈的是谁说的话；圈的是材料时没有这一项 */
  role?: "user" | "assistant";
  text: string;
  source?: QuoteSource;
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
  /** 每个 agent 还没送到的消息：排队的与已插入的 */
  queues: Record<string, QueueItem[]>;
  /** 作者按过一次「暂停」还没停下来：再按一次就是「停止」 */
  pausePending: Record<string, boolean>;
  approvals: ApprovalRequest[];
  questions: QuestionRequest[];
  issues: CheckIssue[] | null;
  view: View;
  capabilities: CapabilityInfo[];
  recent: string[];
  toasts: Toast[];
  modelPickerOpen: boolean;
  settingsOpen: boolean;
  /** 设置页当前分组 */
  settingsTab: SettingsTab;
  capabilityDialog: CapabilityInfo | null;
  searchOpen: boolean;
  /** 快捷按钮往输入框里预填的文字；Composer 消费后清空 */
  composerDraft: string | null;
  /** 作者在主会话里圈出来准备批注的段落，随下一条消息一起发出 */
  composerQuotes: ComposerQuote[];
  /** 正在弹窗审阅的 approvalId */
  reviewOpen: string | null;
  /** 点桩跳回审批时要标亮的引文；审阅视图消费后清空 */
  reviewFocus: string | null;
  /** 还活着的批注，与桩一一对应 */
  annotations: Annotation[];
  /** 批注编号，整个应用生命周期内递增 */
  annotationSeq: number;
  /** 云端配置状态；null = 还没问过内核 */
  cloud: CloudStatus | null;
  /** 云端项目列表；null = 还没拉过 */
  cloudRows: CloudProjectRow[] | null;
  cloudListing: "idle" | "loading" | "error";
  cloudListError: string | null;
  cloudSync: CloudSyncState;
  cloudSettingsOpen: boolean;
  /** 正在下载的云端项目 slug */
  cloudDownloading: string | null;
  /** 关闭项目前的「同步到云端？」确认 */
  closePromptOpen: boolean;
}

const idleCloudSync: CloudSyncState = { phase: "idle", message: null, last: null, synced: null };

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
  pausePending: {},
  approvals: [],
  questions: [],
  issues: null,
  view: { type: "chat", agentId: "director" },
  capabilities: [],
  recent: [],
  toasts: [],
  modelPickerOpen: false,
  settingsOpen: false,
  settingsTab: "keymap",
  capabilityDialog: null,
  searchOpen: false,
  composerDraft: null,
  composerQuotes: [],
  reviewOpen: null,
  reviewFocus: null,
  annotations: [],
  annotationSeq: 0,
  cloud: null,
  cloudRows: null,
  cloudListing: "idle",
  cloudListError: null,
  cloudSync: idleCloudSync,
  cloudSettingsOpen: false,
  cloudDownloading: null,
  closePromptOpen: false,
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
        // 上个内核的排队消息与待审弹窗已经失效，重开项目时必须清；
        // composerDraft / composerQuotes 刻意保留：内核崩溃后会自动重开同一项目，不能丢用户未发送的文字
        queues: {},
        pausePending: {},
        reviewOpen: null,
        reviewFocus: null,
        annotations: [],
        approvals: [],
        questions: [],
        issues: null,
        view: { type: "chat", agentId: "director" },
        cloudSync: idleCloudSync,
        closePromptOpen: false,
      });
      void bridge.request("project.recent", {}).then((r) => setState("recent", r));
      return;
    case "project.closed":
      setState({ project: null, docs: [], agents: {}, agentOrder: [], transcripts: {}, interruptedAfter: {}, queues: {}, pausePending: {}, composerDraft: null, composerQuotes: [], reviewOpen: null, reviewFocus: null, annotations: [], approvals: [], questions: [], issues: null, cloudSync: idleCloudSync, closePromptOpen: false });
      // 回到欢迎页，云端列表重新拉一遍：刚关掉的项目可能刚同步过
      void actions.refreshCloud();
      return;
    case "cloud.sync":
      setState("cloudSync", (prev) => ({
        phase: ev.phase,
        message: ev.message,
        last: ev.last ?? prev.last,
        synced: ev.synced,
      }));
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
              delete s.pausePending[ev.agentId];
              // agent 停了，它挂着的待答 / 待审不可能再有人接，一并撤掉
              s.questions = s.questions.filter((q) => q.agentId !== ev.agentId);
              s.approvals = s.approvals.filter((x) => x.agentId !== ev.agentId);
              const alive = new Set(s.approvals.map((x) => x.approvalId));
              s.annotations = s.annotations.filter((n) => n.source.type !== "approval" || alive.has(n.source.approvalId));
            }
          }
        }),
      );
      return;
    case "agent.event":
      if (ev.event.type === "retry") {
        // 模型出错但 pi 在自动重试：不算失败，弹个小条，状态行也换成人话
        const text = retryText(ev.event);
        toast(text);
        if (state.agents[ev.agentId]) setState("agents", ev.agentId, "statusText", text);
        return;
      }
      applyAgentEvent(ev.agentId, ev.event);
      return;
    case "approval.requested":
      setState("approvals", (a) => [...a, ev.request]);
      // 没在审别的就直接弹出来
      if (!state.reviewOpen) setState("reviewOpen", ev.request.approvalId);
      return;
    case "approval.resolved": {
      const rest = state.approvals.filter((x) => x.approvalId !== ev.approvalId);
      setState("approvals", rest);
      // 审批一关，挂在它上面的批注随之消失：批注不是标签
      setState("annotations", (ns) => ns.filter((n) => n.source.type !== "approval" || n.source.approvalId !== ev.approvalId));
      // 刚决掉的就是正在看的：有下一条就接着审，没有才关；手动关掉的不碰
      if (state.reviewOpen === ev.approvalId) setState("reviewOpen", rest[0]?.approvalId ?? null);
      return;
    }
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
          s.queues[agentId] = ev.items;
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
  void actions.refreshCloud();
}

/** 去掉 Electron IPC 包的那层「Error invoking remote method 'xxx': Error: 」，只留内核说的那句 */
/** 把模型调用的原始报错归成一句人话；认不出来返回 null，让调用方决定要不要露原文 */
export function modelErrorCause(msg: string): string | null {
  if (/429|rate.?limit|限流/i.test(msg)) return "模型限流";
  if (/\b5\d\d\b|overloaded|unavailable/i.test(msg)) return "模型服务繁忙";
  if (/timeout|timed out|ECONN|fetch failed|network/i.test(msg)) return "网络不稳";
  return null;
}

/** 重试提示：原始报错翻成一句人话，原文不上屏 */
export function retryText(ev: { attempt: number; maxAttempts: number; delayMs: number; errorMessage: string }): string {
  const cause = modelErrorCause(ev.errorMessage) ?? "模型调用出错";
  const secs = Math.max(1, Math.round(ev.delayMs / 1000));
  return `${cause}，${secs} 秒后重试（第 ${ev.attempt}/${ev.maxAttempts} 次）`;
}

/** 红框文案：认得出的模型错给人话，原文留给 title；认不出的照原样露 */
export function agentErrorText(raw: string): { text: string; title: string | undefined } {
  const cause = modelErrorCause(raw);
  return cause ? { text: `${cause}，已重试仍失败。稍等一下再发一次就行。`, title: raw } : { text: raw, title: undefined };
}

export function errText(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  return raw.replace(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/, "");
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
  /**
   * 关闭项目。配了云端且本机有改动未同步时先弹确认；skipCloud 是确认框里选「直接关闭」。
   * synced 还是 null（没比对完）也放行，不为一个未知状态卡住作者。
   */
  async closeProject(opts: { skipCloud?: boolean } = {}) {
    if (!opts.skipCloud && state.cloud?.configured && state.cloudSync.synced === false) {
      setState("closePromptOpen", true);
      return;
    }
    setState("closePromptOpen", false);
    await bridge.request("project.close", {}).catch((e) => toast(errText(e), "error"));
  },
  /**
   * 先弹确认，再把文件夹移到废纸篓并从最近列表摘掉。配了云端就连云端快照一起删：
   * 云端删失败只提示、不拦本地删除（云端那份还在，不算丢数据）。删云端要读项目名，所以放在移到废纸篓之前。
   */
  async deleteProject(root: string) {
    const withCloud = state.cloud?.configured === true;
    try {
      const result = await bridge.trashProject(root, { withCloud });
      if (!result.deleted) return;
      if (result.cloudError !== undefined) toast(`云端快照没删掉：${result.cloudError}`, "error");
      await actions.forgetProject(root);
      if (withCloud) void actions.refreshCloud();
    } catch (e) {
      toast(errText(e), "error");
    }
  },
  async forgetProject(root: string) {
    try {
      await bridge.request("project.forget", { root });
      setState("recent", (list) => list.filter((r) => r !== root));
    } catch (e) {
      toast(errText(e), "error");
    }
  },
  /** 确认框里的默认动作：传完再关；传失败留在框里显示原因 */
  async syncAndClose() {
    if (!state.project || state.cloudSync.phase === "uploading") return;
    try {
      await bridge.request("cloud.upload", {});
    } catch {
      return;
    }
    await actions.closeProject({ skipCloud: true });
  },
  async send(text: string, agentId?: string, deliverAs: "steer" | "followUp" = "steer") {
    const t = text.trim();
    if (!t) return;
    try {
      setState("pausePending", agentId ?? "director", false);
      await bridge.request("chat.send", { text: t, deliverAs, ...(agentId && agentId !== "director" ? { agentId } : {}) });
    } catch (e) {
      toast(errText(e), "error");
    }
  },
  /** 排队里的某一条等不了了，插进当前这轮 */
  async insertQueued(id: string, agentId?: string) {
    try {
      await bridge.request("chat.insert", { id, ...(agentId && agentId !== "director" ? { agentId } : {}) });
    } catch (e) {
      toast(errText(e), "error");
    }
  },
  /** 立刻掐断：模型调用和工具都停，在最后一条消息后画「被打断」分隔线 */
  async stop(agentId?: string) {
    const id = agentId ?? "director";
    try {
      setState("pausePending", id, false);
      await bridge.request("chat.abort", id !== "director" ? { agentId: id } : {});
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
      const q = await bridge.request("chat.clearQueue", agentId && agentId !== "director" ? { agentId } : {});
      setState("queues", agentId ?? "director", []);
      if (q.texts.length > 0) setState("composerDraft", q.texts.join("\n\n"));
    } catch (e) {
      toast(errText(e), "error");
    }
  },
  async pause(agentId?: string) {
    try {
      setState("pausePending", agentId ?? "director", true);
      await bridge.request("chat.pause", agentId && agentId !== "director" ? { agentId } : {});
      toast("已请求暂停，它收尾这一步就停下来问你；再按一次是立刻停止");
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
      setState({ capabilityDialog: null, view: { type: "chat", agentId: "director" } });
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
  async exportSeed() {
    try {
      const { filename, content } = await bridge.request("project.exportSeed", {});
      const saved = await bridge.saveTextFile({ defaultName: filename, content });
      if (saved) toast(`已导出故事种子：${saved}`);
    } catch (e) {
      toast(errText(e), "error");
    }
  },
  async copyTranscriptPath(agentId?: string) {
    const id = agentId ?? (state.view.type === "chat" ? state.view.agentId : "director");
    try {
      const file = await bridge.request("chat.sessionFile", { agentId: id });
      if (!file) {
        toast(id === "director" ? "主编还没写过一条消息，会话记录尚未落盘" : "子 agent 的会话只在内存里，没有落盘文件", "error");
        return;
      }
      await bridge.copyText(file);
      toast(`已复制路径：${file}`);
    } catch (e) {
      toast(errText(e), "error");
    }
  },
  openDoc(kind: DocKindId, id: string, focus?: string) {
    setState("view", focus === undefined ? { type: "doc", kind, id } : { type: "doc", kind, id, focus });
  },
  /** 把输入框里带来源的引文打成一条批注：登记桩，返回给主编看的全文 */
  makeAnnotation(quotes: ComposerQuote[], text: string): { label: string; body: string } | null {
    const sourced = quotes.filter((q): q is ComposerQuote & { source: QuoteSource } => q.source !== undefined);
    const src = sourced[0]?.source;
    if (!src) return null;
    const seq = state.annotationSeq + 1;
    const label = `批注${seq}`;
    setState("annotationSeq", seq);
    setState("annotations", (ns) => [...ns, { label, source: src, quotes: sourced.map((q) => q.text), text }]);
    const blocks = sourced.map((q) => q.text.split("\n").map((l) => `> ${l}`).join("\n")).join("\n\n");
    const where = src.type === "approval" ? `${src.path}（悬着的审批稿）` : src.path;
    return { label, body: `[批注 ${where}]\n${blocks}\n\n${text}`.trim() };
  },
  /** 点桩：跳回批注所在处并标亮。批注已经没了就只提示 */
  jumpToAnnotation(label: string) {
    const n = state.annotations.find((x) => x.label === label);
    if (!n) {
      toast("这条批注已经处理完，原处看不到了");
      return;
    }
    const focus = n.quotes[0] ?? "";
    const src = n.source;
    if (src.type === "approval") {
      if (!state.approvals.some((a) => a.approvalId === src.approvalId)) {
        toast("这次审批已经结束");
        return;
      }
      setState("reviewFocus", focus);
      setState("reviewOpen", src.approvalId);
    } else {
      actions.openDoc(src.kind, src.id, focus);
    }
  },
  dropAnnotation(label: string) {
    setState("annotations", (ns) => ns.filter((n) => n.label !== label));
  },
  openChat(agentId: string) {
    setState("view", { type: "chat", agentId });
  },

  // ───────────── 云端 ─────────────

  /** 问一遍配置状态；配好了就拉云端项目列表 */
  async refreshCloud() {
    let status: CloudStatus;
    try {
      status = await bridge.request("cloud.status", {});
    } catch (e) {
      // 问不到状态别让「云端」一直挂着省略号：按未配置处理，原因留在控制台
      console.warn("[ui] cloud.status 失败", e);
      setState("cloud", { configured: false, url: null, bucket: null });
      return;
    }
    setState("cloud", status);
    if (!status.configured) {
      setState({ cloudRows: null, cloudListing: "idle", cloudListError: null });
      return;
    }
    setState({ cloudListing: "loading", cloudListError: null });
    try {
      const rows = await bridge.request("cloud.list", {});
      setState({ cloudRows: rows, cloudListing: "idle" });
    } catch (e) {
      setState({ cloudListing: "error", cloudListError: errText(e) });
    }
  },
  /** 连接并保存凭据；内核先连一次 Supabase 再落盘，失败原样抛给弹窗显示 */
  async configureCloud(url: string, serviceKey: string) {
    const status = await bridge.request("cloud.configure", { url, serviceKey });
    setState("cloud", status);
    void actions.refreshCloud();
    return status;
  },
  async clearCloud() {
    try {
      const status = await bridge.request("cloud.clear", {});
      setState({ cloud: status, cloudRows: null, cloudListing: "idle", cloudSync: idleCloudSync });
      toast("已断开云端存储，本机凭据已删除");
    } catch (e) {
      toast(errText(e), "error");
    }
  },
  /** 清空云端所有项目快照，凭据保留。原生确认框问过才动手 */
  async wipeCloud() {
    const ok = await bridge.confirm({
      message: "清空云端存储？",
      detail: "云端所有项目的快照（含历史版本）都会删掉，本机文件不受影响。当前打开的项目下次同步时会重新传上去。",
      okLabel: "清空",
    });
    if (!ok) return false;
    try {
      const { removed } = await bridge.request("cloud.wipe", {});
      toast(removed === 0 ? "云端本来就是空的" : `已清空云端，删了 ${removed} 个项目的快照`);
      void actions.refreshCloud();
      return true;
    } catch (e) {
      toast(errText(e), "error");
      return false;
    }
  },
  /**
   * 把云端项目落到本机并打开。本机没有：弹目录选择器选个空目录；本机有但落后：覆盖那份。
   * 覆盖前由界面确认过，这里不再问。
   */
  async downloadCloud(row: CloudProjectRow) {
    let dest: string | null;
    if (row.local) dest = row.local.root;
    else dest = await bridge.pickFolder({ title: `把「${row.name}」下载到哪个空文件夹`, create: true });
    if (!dest) return;
    setState("cloudDownloading", row.slug);
    try {
      await bridge.request("cloud.download", { slug: row.slug, dest, ...(row.local ? { replace: true } : {}) });
    } catch (e) {
      toast(errText(e), "error");
    } finally {
      setState("cloudDownloading", null);
    }
  },
  async uploadCloud(force = false) {
    if (!state.project || state.cloudSync.phase === "uploading") return;
    try {
      await bridge.request("cloud.upload", force ? { force } : {});
    } catch (e) {
      toast(errText(e), "error");
    }
  },
};
