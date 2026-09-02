import { randomUUID } from "node:crypto";
import path from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  createExtensionRuntime,
  type ResourceLoader,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type {
  AgentInfo,
  AgentStatus,
  AgentStreamEvent,
  CheckIssue,
  KernelEvent,
  RequestMap,
  RequestMethod,
  RoleId,
  UiMessage,
  UiPart,
} from "../protocol.js";
import { STUB_PATTERN, stubPrompt } from "../protocol.js";
import { runCheck } from "../project/check.js";
import { kindInfos } from "../project/kinds.js";
import { SearchIndex } from "../project/search.js";
import { ProjectStore } from "../project/store.js";
import { CAPABILITIES, capabilityInfos, isCapabilityId } from "./capabilities.js";
import { Gate } from "./gate.js";
import { ModelsFacade } from "./models.js";
import { ROLES, STATUS_LINE_PATTERN, STATUS_LINE_RULE, roleInfos } from "./roles.js";
import { createTools, type SpawnMode, type SpawnTask, type ToolContext, toolNames } from "./tools.js";

type AgentSession = Awaited<ReturnType<typeof createAgentSession>>["session"];
type SessionEvent = Parameters<Parameters<AgentSession["subscribe"]>[0]>[0];

const LEAD_ID = "lead";

const PAUSE_PROMPT_LEAD = `【作者按了「暂停」】
请立刻收尾，不要再开新的工具调用，也不要再派子 agent：
1. 用三五句话说清到目前为止做了什么、停在哪一步、还差什么
2. 然后用 ask_user 问作者想怎么调整，选项固定给这三个并允许自由输入：「我有新的想法」「对之前的内容不满意」「换个方向」
3. 拿到回答后按回答处理；作者说继续就接着做`;

const PAUSE_PROMPT_CHILD = `【作者按了「暂停」】
请立刻收尾：不要再开新的工具调用。把到目前为止做了什么、停在哪一步、还差什么，用三五句话作为你的最终回复交回主编，然后结束。已经落盘的不用撤。`;

interface LiveAgent {
  info: AgentInfo;
  session: AgentSession;
  unsubscribe: () => void;
  /** 正在流式输出的 assistant 消息 id */
  streamingMessageId: string | null;
  /** 消息开头暂存的文本，用来截状态行；null 表示状态行已处理完 */
  headBuffer: string | null;
  /** propose 时落盘工具被挡住；主编续派时可以切到 commit */
  mode: SpawnMode;
}

/** 状态行最多攒这么多字符还没换行就当没有，整段放行 */
const HEAD_BUFFER_LIMIT = 48;

/**
 * 内核：一个项目 + 一个主编会话 + 若干子 agent。
 * 对外只有 handle(method, params) 和事件流。
 */
export class Kernel {
  private store: ProjectStore | null = null;
  /** 全文索引，文档一变就置空，下次查询懒重建 */
  private index: SearchIndex | null = null;
  private models!: ModelsFacade;
  private readonly gate: Gate;
  private readonly agents = new Map<string, LiveAgent>();
  private readonly sessionsDir: string;
  private readonly ready: Promise<void>;
  private markReady!: () => void;
  private failReady!: (e: Error) => void;

  constructor(
    private readonly home: string,
    private readonly emit: (event: KernelEvent) => void,
  ) {
    this.sessionsDir = path.join(home, "sessions");
    this.gate = new Gate({
      approvalRequested: (request) => this.emit({ type: "approval.requested", request }),
      approvalClosed: (approvalId, decision) => this.emit({ type: "approval.resolved", approvalId, decision }),
      questionRequested: (request) => this.emit({ type: "question.requested", request }),
      questionClosed: (questionId) => this.emit({ type: "question.resolved", questionId }),
    });
    this.ready = new Promise<void>((resolve, reject) => {
      this.markReady = resolve;
      this.failReady = reject;
    });
  }

  async init(version: string) {
    try {
      this.models = await ModelsFacade.create(this.home);
    } catch (e) {
      this.failReady(e instanceof Error ? e : new Error(String(e)));
      throw e;
    }
    this.markReady();
    this.emit({ type: "kernel.ready", version, home: this.home });
    this.emit({ type: "models.state", state: this.models.state() });
  }

  async dispose() {
    await this.closeProject();
  }

  // ───────────────────────── 请求分发 ─────────────────────────

  async handle<M extends RequestMethod>(method: M, params: RequestMap[M]["params"]): Promise<RequestMap[M]["result"]> {
    await this.ready;
    const p = params as never;
    const handlers: { [K in RequestMethod]: (params: RequestMap[K]["params"]) => Promise<RequestMap[K]["result"]> } = {
      "kernel.reset": async () => {
        await this.closeProject();
        return null;
      },
      "project.create": async ({ root, name }) => {
        await this.closeProject();
        this.store = await ProjectStore.create(root, name);
        await this.afterOpen("new");
        return this.store.info;
      },
      "project.open": async ({ root }) => {
        await this.closeProject();
        this.store = await ProjectStore.open(root);
        await this.afterOpen("continue");
        return this.store.info;
      },
      "project.close": async () => {
        await this.closeProject();
        return null;
      },
      "project.recent": async () => this.models.recentProjects,
      "doc.read": async ({ kind, id }) => this.requireStore().read(kind, id),
      "doc.write": async ({ kind, id, raw }) => {
        const header = await this.requireStore().write(kind, id, raw);
        await this.emitDocsChanged();
        return header;
      },
      "doc.template": async ({ kind }) => this.requireStore().template(kind),
      "search.query": async ({ query, limit }) => (await this.searchIndex()).query(query, limit),
      "models.list": async () => this.models.state(),
      "models.select": async ({ provider, id, thinkingLevel }) => {
        const model = await this.models.select(provider, id, thinkingLevel);
        const lead = this.agents.get(LEAD_ID);
        if (lead) {
          await lead.session.setModel(model);
          lead.session.setThinkingLevel(this.models.thinkingLevel);
        }
        const state = this.models.state();
        this.emit({ type: "models.state", state });
        return state;
      },
      "models.setApiKey": async ({ provider, apiKey }) => {
        await this.models.setApiKey(provider, apiKey);
        const state = this.models.state();
        this.emit({ type: "models.state", state });
        return state;
      },
      "models.refresh": async () => {
        await this.models.refresh();
        const state = this.models.state();
        this.emit({ type: "models.state", state });
        return state;
      },
      "chat.send": async ({ text, agentId }) => {
        this.sendTo(agentId ?? LEAD_ID, text);
        return null;
      },
      "chat.pause": async ({ agentId }) => {
        const id = agentId ?? LEAD_ID;
        const live = this.agents.get(id);
        if (!live) throw new Error("这个 agent 已经不在了");
        if (live.info.status !== "running") return null;
        const text = stubPrompt("暂停", live.info.role === "lead" ? PAUSE_PROMPT_LEAD : PAUSE_PROMPT_CHILD);
        // steer 会插在当前这步工具结束之后，正在写的东西不会被掐断
        live.session.prompt(text, { streamingBehavior: "steer" }).catch(() => {});
        return null;
      },
      "chat.abort": async ({ agentId }) => {
        const targets = agentId ? [this.agents.get(agentId)].filter((a): a is LiveAgent => !!a) : [...this.agents.values()];
        for (const a of targets) await a.session.abort().catch(() => {});
        return null;
      },
      "chat.new": async () => {
        this.requireStore();
        await this.disposeAgents();
        await this.createLead("new");
        return null;
      },
      "capabilities.list": async () => capabilityInfos(),
      "capability.run": async ({ id, params: capParams }) => {
        if (!isCapabilityId(id)) throw new Error(`未知能力：${String(id)}`);
        const cap = CAPABILITIES[id];
        for (const param of cap.params) {
          if (param.required && !(capParams[param.name] ?? "").trim()) throw new Error(`缺参数：${param.label}`);
        }
        this.sendTo(LEAD_ID, stubPrompt(cap.label, cap.render(capParams)));
        return null;
      },
      "roles.list": async () => roleInfos(),
      "approval.reply": async ({ approvalId, decision, reason }) => {
        if (!this.gate.resolveApproval(approvalId, { decision, reason: reason ?? "" })) {
          // 已经不在了（被中止 / 重复点），也让 UI 撤掉
          this.emit({ type: "approval.resolved", approvalId, decision });
        }
        return null;
      },
      "question.reply": async ({ questionId, answer }) => {
        if (!this.gate.resolveQuestion(questionId, answer)) this.emit({ type: "question.resolved", questionId });
        return null;
      },
      "check.run": async () => {
        const issues = await runCheck(this.requireStore());
        this.emit({ type: "check.result", issues });
        return issues;
      },
    };
    const handler = handlers[method];
    if (!handler) throw new Error(`未知方法：${String(method)}`);
    return handler(p);
  }

  // ───────────────────────── 项目生命周期 ─────────────────────────

  private requireStore(): ProjectStore {
    if (!this.store) throw new Error("还没有打开项目");
    return this.store;
  }

  private async afterOpen(mode: "new" | "continue") {
    const store = this.requireStore();
    await this.models.rememberProject(store.info.root);
    this.emit({ type: "project.opened", project: store.info, docs: await store.listAll(), kinds: kindInfos() });
    await this.createLead(mode);
  }

  private async closeProject() {
    if (!this.store) return;
    await this.disposeAgents();
    this.store = null;
    this.index = null;
    this.emit({ type: "project.closed" });
  }

  private async disposeAgents() {
    this.gate.rejectAll("会话已重建");
    for (const a of this.agents.values()) {
      await a.session.abort().catch(() => {});
      a.unsubscribe();
      a.session.dispose();
    }
    this.agents.clear();
  }

  private async emitDocsChanged() {
    if (!this.store) return;
    this.index = null;
    this.emit({ type: "docs.changed", docs: await this.store.listAll() });
  }

  private async searchIndex(): Promise<SearchIndex> {
    const store = this.requireStore();
    if (!this.index) this.index = await SearchIndex.build(store);
    return this.index;
  }

  // ───────────────────────── 会话构建 ─────────────────────────

  private requireModel(): Model<Api> {
    const m = this.models.currentModel();
    if (!m) throw new Error("没有可用模型：先在模型选择器里给某个提供方填 API key");
    return m;
  }

  private loaderFor(systemPrompt: string): ResourceLoader {
    return {
      getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
      getSkills: () => ({ skills: [], diagnostics: [] }),
      getPrompts: () => ({ prompts: [], diagnostics: [] }),
      getThemes: () => ({ themes: [], diagnostics: [] }),
      getAgentsFiles: () => ({ agentsFiles: [] }),
      getSystemPrompt: () => systemPrompt,
      getSystemPromptSource: () => undefined,
      getAppendSystemPrompt: () => [],
      getAppendSystemPromptSources: () => [],
      extendResources: () => {},
      reload: async () => {},
    };
  }

  private toolContext(agentId: string, withSpawn: boolean): ToolContext {
    const store = this.requireStore();
    const ctx: ToolContext = {
      store,
      gate: this.gate,
      agentId,
      runCheck: async () => {
        const issues = await runCheck(store);
        this.emit({ type: "check.result", issues });
        return issues;
      },
      onDocsChanged: () => void this.emitDocsChanged(),
      search: async (query, limit) => (await this.searchIndex()).query(query, limit),
    };
    if (withSpawn) {
      ctx.spawn = (tasks, onProgress, signal) => this.spawn(agentId, tasks, onProgress, signal);
      ctx.continueAgent = (childId, message, mode, onProgress, signal) => this.continueChild(childId, message, mode, onProgress, signal);
    }
    ctx.writeBlocked = () => {
      const live = this.agents.get(agentId);
      if (!live || live.mode === "commit") return null;
      return "这一轮是候选阶段（propose），不能落盘。把候选写在回复里交给主编，作者拍板后主编会让你接着落盘。";
    };
    return ctx;
  }

  private async buildSession(role: RoleId, agentId: string, sessionManager: SessionManager): Promise<AgentSession> {
    const store = this.requireStore();
    const def = ROLES[role];
    const tools = createTools(this.toolContext(agentId, def.canSpawn), {
      canWrite: def.canWrite,
      canSpawn: def.canSpawn,
      canAsk: def.canAsk,
    });
    const { session } = await createAgentSession({
      cwd: store.info.root,
      agentDir: this.home,
      model: this.requireModel(),
      thinkingLevel: this.models.thinkingLevel,
      modelRuntime: this.models.runtime,
      resourceLoader: this.loaderFor(`${def.systemPrompt}\n\n${STATUS_LINE_RULE}`),
      tools: toolNames(tools),
      customTools: tools,
      sessionManager,
      settingsManager: SettingsManager.inMemory({}),
    });
    return session;
  }

  private register(info: AgentInfo, session: AgentSession): LiveAgent {
    const live: LiveAgent = { info, session, unsubscribe: () => {}, streamingMessageId: null, headBuffer: null, mode: "commit" };
    live.unsubscribe = session.subscribe((event) => this.forward(live, event));
    this.agents.set(info.agentId, live);
    this.emit({ type: "agent.spawned", agent: info });
    return live;
  }

  private async createLead(mode: "new" | "continue") {
    const store = this.requireStore();
    const sessionManager =
      mode === "continue"
        ? SessionManager.continueRecent(store.info.root, this.sessionsDir)
        : SessionManager.create(store.info.root, this.sessionsDir);
    const session = await this.buildSession(LEAD_ID, LEAD_ID, sessionManager);
    const live = this.register(
      { agentId: LEAD_ID, parentId: null, role: LEAD_ID, label: ROLES.lead.label, task: "", status: "idle", error: null, statusText: "" },
      session,
    );
    const raws = session.messages as unknown[];
    this.emit({
      type: "agent.event",
      agentId: LEAD_ID,
      event: { type: "history", messages: normalizeHistory(raws), interrupted: wasInterrupted(raws) },
    });
    this.setStatus(live, "idle");
  }

  private sendTo(agentId: string, text: string) {
    const live = this.agents.get(agentId);
    if (!live) throw new Error(agentId === LEAD_ID ? "主编会话不存在，先打开项目" : "这个子 agent 不存在或已随项目关闭回收");
    const run = live.session.isStreaming
      ? live.session.prompt(text, { streamingBehavior: "steer" })
      : live.session.prompt(text);
    run.catch((e: unknown) => {
      this.setStatus(live, "error", e instanceof Error ? e.message : String(e));
    });
  }

  // ───────────────────────── 子 agent ─────────────────────────

  private async spawn(
    parentId: string,
    tasks: SpawnTask[],
    onProgress: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const results = await Promise.all(tasks.map((t) => this.runChild(parentId, t, onProgress, signal)));
    return results.join("\n\n");
  }

  private async runChild(
    parentId: string,
    task: SpawnTask,
    onProgress: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const store = this.requireStore();
    const def = ROLES[task.role];
    const agentId = randomUUID();
    const session = await this.buildSession(task.role, agentId, SessionManager.inMemory(store.info.root));
    const live = this.register(
      { agentId, parentId, role: task.role, label: def.label, task: task.task, status: "running", error: null, statusText: "" },
      session,
    );
    live.mode = task.mode ?? "commit";
    return this.promptChild(live, task.task, onProgress, signal);
  }

  private async continueChild(
    childId: string,
    message: string,
    mode: SpawnMode | undefined,
    onProgress: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const live = this.agents.get(childId);
    if (!live || childId === LEAD_ID) throw new Error(`没有这个子 agent：${childId}。它可能已随项目关闭回收，需要重新 spawn_agents`);
    if (live.info.status === "running") throw new Error(`${live.info.label}（${childId}）还在跑，等它这一轮回来再续`);
    if (mode) live.mode = mode;
    const prefix = mode === "commit" && live.mode === "commit" ? "【主编已切换你到落盘阶段，这一轮可以 write_doc / edit_doc】\n" : "";
    return this.promptChild(live, prefix + message, onProgress, signal);
  }

  /** 给子 agent 发一轮消息，等它跑完，把最后一段文字结论交回主编。会话跑完不退场，留给续接。 */
  private async promptChild(live: LiveAgent, message: string, onProgress: (text: string) => void, signal?: AbortSignal): Promise<string> {
    const { session, info } = live;
    const header = `## ${info.label}（${info.role}，id=${info.agentId}）`;
    const onAbort = () => void session.abort().catch(() => {});
    signal?.addEventListener("abort", onAbort, { once: true });
    onProgress(`${info.label} 开始`);
    try {
      await session.prompt(message);
      if (signal?.aborted) throw new Error("已中止");
      const answer = lastAssistantText(session.messages as unknown[]);
      this.setStatus(live, "done");
      onProgress(`${info.label} 完成`);
      return `${header}\n\n${answer || "（没有文字结论）"}`;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.setStatus(live, "error", msg);
      onProgress(`${info.label} 失败：${msg}`);
      return `${header}\n\n执行失败：${msg}`;
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }
  }

  // ───────────────────────── 事件转发 ─────────────────────────

  private setStatus(live: LiveAgent, status: AgentStatus, error: string | null = null) {
    live.info.status = status;
    live.info.error = error;
    this.emit({ type: "agent.status", agentId: live.info.agentId, status, error });
  }

  private send(live: LiveAgent, event: AgentStreamEvent) {
    if (event.type === "status_text") live.info.statusText = event.text;
    this.emit({ type: "agent.event", agentId: live.info.agentId, event });
  }

  /** 文本流开头先攒一行：是状态行就摘出来单发，不是就原样放行 */
  private forwardText(live: LiveAgent, messageId: string, delta: string) {
    if (live.headBuffer === null) {
      this.send(live, { type: "text_delta", messageId, delta });
      return;
    }
    live.headBuffer += delta;
    const hasNewline = live.headBuffer.includes("\n");
    if (!hasNewline && live.headBuffer.length < HEAD_BUFFER_LIMIT) return;
    const status = takeStatusLine(live.headBuffer);
    const rest = status ? status.rest : live.headBuffer;
    live.headBuffer = null;
    if (status) this.send(live, { type: "status_text", text: status.text });
    if (rest) this.send(live, { type: "text_delta", messageId, delta: rest });
  }

  private forward(live: LiveAgent, event: SessionEvent) {
    const ev = event as { type: string } & Record<string, unknown>;
    switch (ev.type) {
      case "agent_start":
        this.setStatus(live, "running");
        return;
      case "agent_end":
        if (live.info.status !== "error") this.setStatus(live, live.info.agentId === LEAD_ID ? "idle" : "done");
        return;
      case "message_start": {
        const msg = normalizeMessage(ev.message);
        if (!msg) return;
        // user / assistant 都是一对 start / end，用同一个 id 才能在 UI 里合并成一条
        live.streamingMessageId = msg.id;
        live.headBuffer = msg.role === "assistant" ? "" : null;
        this.send(live, { type: "message_start", message: msg });
        return;
      }
      case "message_update": {
        const inner = ev.assistantMessageEvent as { type: string; delta?: string } | undefined;
        const messageId = live.streamingMessageId;
        if (!inner || !messageId) return;
        if (inner.type === "text_delta" && inner.delta) this.forwardText(live, messageId, inner.delta);
        if (inner.type === "thinking_delta" && inner.delta) this.send(live, { type: "thinking_delta", messageId, delta: inner.delta });
        return;
      }
      case "message_end": {
        const msg = normalizeMessage(ev.message, live.streamingMessageId ?? undefined);
        if (!msg) return;
        // 开头攒着还没放行的文本（没换行的短回复）在这里补发
        if (live.headBuffer) {
          const status = takeStatusLine(live.headBuffer);
          if (status) this.send(live, { type: "status_text", text: status.text });
          else this.send(live, { type: "text_delta", messageId: msg.id, delta: live.headBuffer });
        }
        live.headBuffer = null;
        live.streamingMessageId = null;
        this.send(live, { type: "message_end", message: msg });
        const raw = ev.message as RawMessage;
        if (raw.role === "assistant" && raw.stopReason === "error") {
          this.setStatus(live, "error", raw.errorMessage ?? "模型调用失败（没有错误详情）");
        }
        return;
      }
      case "tool_execution_start":
        this.send(live, {
          type: "tool_start",
          messageId: live.streamingMessageId ?? "",
          toolCallId: String(ev.toolCallId),
          name: String(ev.toolName),
          args: ev.args,
        });
        return;
      case "tool_execution_update":
        this.send(live, {
          type: "tool_update",
          toolCallId: String(ev.toolCallId),
          output: contentText(ev.partialResult),
          details: (ev.partialResult as { details?: unknown } | undefined)?.details ?? null,
        });
        return;
      case "tool_execution_end":
        this.send(live, {
          type: "tool_end",
          toolCallId: String(ev.toolCallId),
          output: contentText(ev.result),
          details: (ev.result as { details?: unknown } | undefined)?.details ?? null,
          isError: Boolean(ev.isError),
        });
        return;
      default:
        return;
    }
  }
}

// ───────────────────────── pi 消息 → UI 消息 ─────────────────────────

interface RawMessage {
  role?: string;
  content?: unknown;
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
  timestamp?: number;
  stopReason?: string;
  errorMessage?: string;
}

/** 从文本开头摘状态行；没有就返回 null */
export function takeStatusLine(text: string): { text: string; rest: string } | null {
  const m = STATUS_LINE_PATTERN.exec(text);
  if (!m) return null;
  return { text: m[1]!.trim(), rest: text.slice(m[0].length).replace(/^\r?\n/, "") };
}

/** 工具参数可能是对象，也可能是还没解析的 JSON 字符串（部分 provider / 截断的流） */
function parseArgs(v: unknown): unknown {
  if (v && typeof v === "object") return v;
  if (typeof v === "string" && v.trim()) {
    try {
      return JSON.parse(v);
    } catch {
      return { _raw: v };
    }
  }
  return {};
}

function contentText(result: unknown): string {
  const content = (result as { content?: unknown } | undefined)?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((c: { type?: string; text?: string }) => (c.type === "text" ? c.text ?? "" : c.type === "image" ? "[图片]" : ""))
    .join("");
}

function normalizeMessage(raw: unknown, id?: string): UiMessage | null {
  const m = raw as RawMessage | undefined;
  if (!m || (m.role !== "user" && m.role !== "assistant")) return null;
  const parts: UiPart[] = [];
  if (typeof m.content === "string") {
    const stub = m.role === "user" ? STUB_PATTERN.exec(m.content) : null;
    if (stub) parts.push({ type: "stub", label: stub[1]!.trim() });
    else if (m.content) parts.push({ type: "text", text: m.content });
  } else if (Array.isArray(m.content)) {
    for (const c of m.content as Array<Record<string, unknown>>) {
      switch (c.type) {
        case "text": {
          if (typeof c.text !== "string" || !c.text) break;
          if (m.role === "user" && parts.length === 0) {
            const stub = STUB_PATTERN.exec(c.text);
            if (stub) {
              parts.push({ type: "stub", label: stub[1]!.trim() });
              break;
            }
          }
          // assistant 正文开头的状态行不进消息体，它走 status_text
          const text = m.role === "assistant" && parts.length === 0 ? (takeStatusLine(c.text)?.rest ?? c.text) : c.text;
          if (text) parts.push({ type: "text", text });
          break;
        }
        case "thinking":
          parts.push({ type: "thinking", text: String(c.thinking ?? c.text ?? "") });
          break;
        case "toolCall":
          parts.push({
            type: "tool",
            toolCallId: String(c.id ?? ""),
            name: String(c.name ?? ""),
            args: parseArgs(c.arguments),
            status: "running",
            output: "",
            details: null,
          });
          break;
        case "image":
          parts.push({ type: "text", text: "[图片]" });
          break;
        default:
          break;
      }
    }
  }
  return { id: id ?? randomUUID(), role: m.role, parts, createdAt: m.timestamp ?? Date.now() };
}

/** 历史回放：把 toolResult 消息折进对应 assistant 消息的 tool part */
export function normalizeHistory(raws: unknown[]): UiMessage[] {
  const out: UiMessage[] = [];
  const toolParts = new Map<string, Extract<UiPart, { type: "tool" }>>();
  for (const raw of raws) {
    const m = raw as RawMessage;
    if (m.role === "toolResult" && m.toolCallId) {
      const part = toolParts.get(m.toolCallId);
      if (part) {
        part.status = m.isError ? "error" : "done";
        part.output = contentText(m);
        part.details = (m as { details?: unknown }).details ?? null;
      }
      continue;
    }
    const msg = normalizeMessage(raw);
    if (!msg) continue;
    for (const p of msg.parts) if (p.type === "tool") toolParts.set(p.toolCallId, p);
    out.push(msg);
  }
  return out;
}

/**
 * 上次会话是否没收尾：最后一条是用户的话（没回）、是工具结果（循环跑一半）、
 * 或是带工具调用 / 被中止 / 出错的 assistant 消息。
 */
export function wasInterrupted(raws: unknown[]): boolean {
  const last = raws.at(-1) as RawMessage | undefined;
  if (!last) return false;
  if (last.role === "user" || last.role === "toolResult") return true;
  if (last.role !== "assistant") return false;
  if (last.stopReason === "aborted" || last.stopReason === "error") return true;
  return Array.isArray(last.content) && (last.content as Array<{ type?: string }>).some((c) => c.type === "toolCall");
}

function lastAssistantText(raws: unknown[]): string {
  for (let i = raws.length - 1; i >= 0; i--) {
    const m = raws[i] as RawMessage;
    if (m.role !== "assistant") continue;
    const msg = normalizeMessage(m);
    const txt = msg?.parts
      .filter((p): p is Extract<UiPart, { type: "text" }> => p.type === "text")
      .map((p) => p.text)
      .join("\n")
      .trim();
    if (txt) return txt;
  }
  return "";
}

export type { CheckIssue };
