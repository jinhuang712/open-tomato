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
  DispatchDetails,
  DispatchSlot,
  KernelEvent,
  RequestMap,
  RequestMethod,
  RoleId,
} from "../protocol.js";
import { formatAnswer, modePrompt, stubPrompt } from "../protocol.js";
import { crossModelThinkingExtension } from "./cross-model-thinking.js";
import { stubStripExtension } from "./stub-strip.js";
import { runCheck } from "../project/check.js";
import { kindInfos } from "../project/kinds.js";
import { SearchIndex } from "../project/search.js";
import { migrateLegacySessions, ProjectStore } from "../project/store.js";
import { Gate } from "./gate.js";
import { ModelsFacade } from "./models.js";
import { ROLES, STATUS_LINE_RULE } from "./roles.js";
import {
  createTools,
  type DispatchProgress,
  type DispatchResult,
  type SpawnMode,
  type SpawnTask,
  type ToolContext,
  toolNames,
  WRITE_TOOL_NAMES,
} from "./tools/index.js";
import { CloudManager } from "./kernel/cloud-manager.js";
import { contentText, lastAssistantText, normalizeHistory, normalizeMessage, orphanedQuestion, takeStatusLine, wasInterrupted, type RawMessage } from "./kernel/history.js";
import { repairAskArgs, type AskArgs } from "./tools/ask-args.js";
import { NUDGE_PROMPT, shouldNudge } from "./kernel/lead-rules.js";
import { LEAD_ID, type AgentSession, type LiveAgent, type SessionEvent, type SessionFactory, type SessionFactoryArgs } from "./kernel/types.js";
import { loadPrompt } from "./prompt-text.js";
import type { HandlerMap, KernelApi } from "./kernel/handlers/shared.js";
import { approvalHandlers } from "./kernel/handlers/approvals.js";
import { chatHandlers } from "./kernel/handlers/chat.js";
import { cloudHandlers } from "./kernel/handlers/cloud.js";
import { docHandlers } from "./kernel/handlers/docs.js";
import { modelHandlers } from "./kernel/handlers/models.js";
import { systemHandlers } from "./kernel/handlers/system.js";
import { workflowHandlers } from "./kernel/handlers/workflow.js";

/** 发给模型的控制消息统一收拢在 prompts/kernel/ 下，这里只留加载，用法点不动 */
const PROPOSE_NOTICE = loadPrompt("kernel/propose-notice");
const COMMIT_NOTICE = loadPrompt("kernel/commit-notice");
const CHILD_REPORT_NOTICE = loadPrompt("shared/child-report-notice");
const DISPATCHED_NOTICE = loadPrompt("kernel/dispatched-notice");

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
  /** 早期版本把所有项目的会话混放在这个全局目录；现在只用来迁移 */
  private readonly legacySessionsDir: string;
  private readonly ready: Promise<void>;
  /** 云端快照状态机（配置/定时/上传/比对全在里面，不碰 Kernel 私有状态） */
  private readonly clouds: CloudManager;
  private markReady!: () => void;
  private failReady!: (e: Error) => void;
  private readonly sessionFactory: SessionFactory;
  /** 打开项目时模型没就位，主编欠着没建；记下该以哪种方式建，模型一到位就补 */
  private pendingLead: "new" | "continue" | null = null;

  constructor(
    private readonly home: string,
    private readonly emit: (event: KernelEvent) => void,
    opts: { sessionFactory?: SessionFactory } = {},
  ) {
    this.sessionFactory = opts.sessionFactory ?? {
      ready: () => this.models.currentModel() !== undefined,
      create: (args) => this.createPiSession(args),
    };
    this.legacySessionsDir = path.join(home, "sessions");
    this.clouds = new CloudManager(home, emit);
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
    await this.clouds.load();
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
    const api: KernelApi = {
      getStore: () => this.store,
      setStore: (s) => {
        this.store = s;
      },
      requireStore: () => this.requireStore(),
      closeProject: () => this.closeProject(),
      afterOpen: (mode) => this.afterOpen(mode),
      disposeAgents: (retire) => this.disposeAgents(retire),
      archiveChild: (agentId) => this.archiveChild(agentId),
      retireChild: (agentId) => this.retireChild(agentId),
      createLead: (mode) => this.createLead(mode),
      ensureLead: () => this.ensureLead(),
      sendTo: (agentId, text, deliverAs = "steer") => this.sendTo(agentId, text, deliverAs),
      requireLive: (agentId) => this.requireLive(agentId),
      authorActed: (live) => this.authorActed(live),
      emitQueue: (live) => this.emitQueue(live),
      searchIndex: () => this.searchIndex(),
      emitDocsChanged: () => this.emitDocsChanged(),
      models: this.models,
      gate: this.gate,
      clouds: this.clouds,
      agents: this.agents,
      emit: (e) => this.emit(e),
    };
    const handlers: HandlerMap = {
      ...systemHandlers(api),
      ...docHandlers(api),
      ...modelHandlers(api),
      ...chatHandlers(api),
      ...workflowHandlers(api),
      ...approvalHandlers(api),
      ...cloudHandlers(api),
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
    await this.models.bindProject(store.settingsPath);
    this.emit({ type: "models.state", state: this.models.state() });
    this.emit({ type: "project.opened", project: store.info, docs: await store.listAll(), kinds: kindInfos() });
    await this.refreshCheck();
    await this.ensureLead(mode);
    this.clouds.start(() => this.store?.info ?? null);
    if (this.store) {
      const store = this.store;
      void this.clouds.recheck(store.info, () => this.store === store);
    }
  }

  private async closeProject() {
    if (!this.store) return;
    this.clouds.stop();
    this.clouds.reset();
    await this.disposeAgents(false);
    this.store = null;
    this.index = null;
    this.pendingLead = null;
    this.models.unbindProject();
    this.emit({ type: "project.closed" });
    this.emit({ type: "models.state", state: this.models.state() });
  }

  // ───────────────────────── 云端快照（状态机在 kernel/cloud-manager.ts） ─────────────────────────

  /** 文档落盘 / 会话有新内容：本地肯定比云端新了（没开项目时跳过） */
  private markCloudDirty() {
    if (!this.store) return;
    this.clouds.markDirty();
  }

  /**
   * 释放内存里的全部会话。retire=true 是主编开新会话：子 agent 一并退役，索引和会话目录删掉；
   * retire=false 是关项目 / 退出应用：只释放，索引留着，下次打开按索引接回。
   */
  private async disposeAgents(retire: boolean) {
    this.gate.rejectAll("会话已重建");
    const lives = [...this.agents.values()];
    if (retire && this.store) {
      for (const a of lives) if (a.info.agentId !== LEAD_ID) await this.store.dropAgentRecord(a.info.agentId);
    }
    // 先发终态（渲染层据此撤掉这个 agent 的问答/待审 dock），再摘表：
    // abort 会让旧 run 报错，滞后回调因认不出旧 live 全被吞，不会污染新会话
    for (const a of lives) this.setStatus(a, a.info.agentId === LEAD_ID ? "idle" : a.info.status === "archived" ? "archived" : "done");
    for (const a of lives) a.unsubscribe();
    this.agents.clear();
    for (const a of lives) {
      await a.session.abort().catch(() => {});
      a.session.dispose();
    }
  }

  /** 文档一变就重新机检：机械对账是代码的活，作者和模型都不该记着去点 */
  private async emitDocsChanged(): Promise<CheckIssue[]> {
    if (!this.store) return [];
    this.index = null;
    this.markCloudDirty();
    this.emit({ type: "docs.changed", docs: await this.store.listAll() });
    return this.refreshCheck();
  }

  private async refreshCheck(): Promise<CheckIssue[]> {
    if (!this.store) return [];
    const issues = await runCheck(this.store);
    this.emit({ type: "check.result", issues });
    return issues;
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
      getExtensions: () => ({
        extensions: [stubStripExtension(), crossModelThinkingExtension()],
        errors: [],
        runtime: createExtensionRuntime(),
      }),
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
      runCheck: () => this.refreshCheck(),
      docsChanged: () => this.emitDocsChanged(),
      search: async (query, limit) => (await this.searchIndex()).query(query, limit),
    };
    if (withSpawn) {
      ctx.spawn = (tasks, onProgress) => this.spawn(agentId, tasks, onProgress);
      ctx.continueAgent = (childId, message, mode, onProgress) => this.continueChild(childId, message, mode, onProgress);
      ctx.archiveAgent = (childId) => this.archiveChild(childId);
    }
    ctx.unrelayedReports = () => this.agents.get(agentId)?.unrelayed ?? [];
    ctx.acknowledgeReports = (ids) => {
      const live = this.agents.get(agentId);
      if (live) live.unrelayed = live.unrelayed.filter((id) => !ids.includes(id));
    };
    ctx.writeBlocked = () => {
      const live = this.agents.get(agentId);
      if (!live || live.mode === "commit") return null;
      return PROPOSE_NOTICE;
    };
    return ctx;
  }

  private async buildSession(role: RoleId, agentId: string, sessionManager: SessionManager): Promise<{ session: AgentSession; tools: string[] }> {
    const store = this.requireStore();
    const def = ROLES[role];
    const tools = createTools(this.toolContext(agentId, def.canSpawn), {
      writableKinds: def.writableKinds,
      canSpawn: def.canSpawn,
      canAsk: def.canAsk,
      ...(def.canReview ? { reviewAs: role } : {}),
    });
    const session = await this.sessionFactory.create({
      cwd: store.info.root,
      agentDir: this.home,
      systemPrompt: `${def.systemPrompt}\n\n${STATUS_LINE_RULE}`,
      tools,
      sessionManager,
    });
    return { session, tools: toolNames(tools) };
  }

  /** 默认工厂：挂真模型，没配模型这里才报错 */
  private async createPiSession(args: SessionFactoryArgs): Promise<AgentSession> {
    const { session } = await createAgentSession({
      cwd: args.cwd,
      agentDir: args.agentDir,
      model: this.requireModel(),
      thinkingLevel: this.models.thinkingLevel,
      modelRuntime: this.models.runtime,
      resourceLoader: this.loaderFor(args.systemPrompt),
      tools: toolNames(args.tools),
      customTools: args.tools,
      sessionManager: args.sessionManager,
      settingsManager: SettingsManager.inMemory({}),
    });
    return session;
  }

  private register(info: AgentInfo, session: AgentSession, tools: string[]): LiveAgent {
    const live: LiveAgent = { info, session, tools, unsubscribe: () => {}, streamingMessageId: null, headBuffer: null, skipBlank: false, mode: "commit", inbox: [], steering: [], hold: false, flushRest: false, asked: false, unrelayed: [], nudged: false, pendingError: null };
    live.unsubscribe = session.subscribe((event) => this.forward(live, event));
    this.agents.set(info.agentId, live);
    this.emit({ type: "agent.spawned", agent: info });
    return live;
  }

  /**
   * 没配模型也能打开项目：看材料、改材料都不需要主编。主编欠着，等模型到位（选了模型 / 作者首次开口）再补建。
   * 返回现在有没有主编。
   */
  private async ensureLead(mode?: "new" | "continue"): Promise<boolean> {
    if (mode) this.pendingLead = mode;
    if (this.agents.has(LEAD_ID)) return true;
    if (!this.store || !this.pendingLead || !this.sessionFactory.ready()) return false;
    const m = this.pendingLead;
    this.pendingLead = null;
    await this.createLead(m);
    return true;
  }

  private async createLead(mode: "new" | "continue") {
    const store = this.requireStore();
    await migrateLegacySessions(this.legacySessionsDir, store.info.root);
    const sessionManager =
      mode === "continue"
        ? SessionManager.continueRecent(store.info.root, store.leadSessionsDir)
        : SessionManager.create(store.info.root, store.leadSessionsDir);
    const { session, tools } = await this.buildSession(LEAD_ID, LEAD_ID, sessionManager);
    const live = this.register(
      { agentId: LEAD_ID, parentId: null, role: LEAD_ID, label: ROLES.director.label, task: "", status: "idle", error: null, statusText: "", mode: "commit" },
      session,
      tools,
    );
    this.replayHistory(LEAD_ID, session);
    this.setStatus(live, "idle");
    if (mode === "continue") {
      await this.restoreChildren();
      this.reviveQuestion(live);
    }
  }

  /**
   * 上次退出 / 重启时主编正在等作者答题：问题重新挂回门上，作者答了就当一条新话送进会话。
   * 不经过模型：问题实参就在会话里，让模型再问一遍既费一轮又可能换措辞。
   * 必须在 setStatus(idle) 之后：渲染层收到非 running 的状态会把这个 agent 的待答撤掉。
   */
  private reviveQuestion(live: LiveAgent) {
    const raw = orphanedQuestion(live.session.messages as unknown[]);
    if (!raw) return;
    let args: AskArgs;
    try {
      args = repairAskArgs(raw);
    } catch {
      return;
    }
    if (!args.question) return;
    this.gate
      .requestQuestion({ agentId: LEAD_ID, text: args.question, kind: args.kind, options: args.options ?? [], allowFreeText: args.allowFreeText ?? true })
      .then((answer) => {
        if (this.agents.get(LEAD_ID) !== live) return;
        this.authorActed(live);
        this.sendTo(LEAD_ID, formatAnswer(answer));
      })
      .catch(() => {});
  }

  /** 会话里已有的消息回放给渲染层 */
  private replayHistory(agentId: string, session: AgentSession) {
    const raws = session.messages as unknown[];
    this.emit({
      type: "agent.event",
      agentId,
      event: { type: "history", messages: normalizeHistory(raws), interrupted: wasInterrupted(raws) },
    });
  }

  /**
   * 按索引把上次留下的子 agent 接回来：同一个 agentId、同一份会话文件、同一个派单方式。
   * 接回来的是 done（封存过的是 archived）：重启后没有人在跑，主编要续就 continue。接不回的（目录没了）从索引里删。
   */
  private async restoreChildren() {
    const store = this.requireStore();
    for (const rec of await store.agentRecords()) {
      if (!(rec.role in ROLES) || rec.role === LEAD_ID) {
        await store.dropAgentRecord(rec.agentId);
        continue;
      }
      try {
        const { session, tools } = await this.buildSession(rec.role, rec.agentId, SessionManager.continueRecent(store.info.root, store.agentSessionDir(rec.agentId)));
        const live = this.register(
          { agentId: rec.agentId, parentId: rec.parentId, role: rec.role, label: rec.label, task: rec.task, status: rec.archived ? "archived" : "done", error: null, statusText: "", mode: rec.mode },
          session,
          tools,
        );
        this.setMode(live, rec.mode);
        this.replayHistory(rec.agentId, session);
      } catch {
        await store.dropAgentRecord(rec.agentId);
      }
    }
  }

  private requireLive(agentId: string): LiveAgent {
    const live = this.agents.get(agentId);
    if (!live) throw new Error(agentId === LEAD_ID ? "主编还没就位：先打开项目，并在模型选择器里选一个模型" : "这个子 agent 不存在或已随项目关闭回收");
    return live;
  }

  /** 作者说话、批稿、答题、插入都算开口：暂停解除，这轮结束后收件箱照常送 */
  private authorActed(live: LiveAgent | undefined) {
    if (!live) return;
    live.hold = false;
    live.nudged = false;
  }

  /** 收件箱与已插入的一起给界面：作者要看到自己的话在哪儿等着 */
  private emitQueue(live: LiveAgent) {
    this.send(live, {
      type: "queue_update",
      items: [
        ...live.steering.map((t, i) => ({ id: `steer-${i}`, label: "已插入", text: t, inserted: true })),
        ...live.inbox.map((e) => ({ ...e, inserted: false })),
      ],
    });
  }

  /**
   * 轮末取件：收件箱非空且没被暂停，就把第一条送进去开新一轮，其余等 agent_start 后插进去。
   * 分两步是因为 pi 一次只接一条直发，其余得等它跑起来再 steer。
   * agent_end 发出时 run 可能还没完全收尾，等一拍再送；sendTo 看 isStreaming 自己决定直发还是排到 pi 的队列。
   */
  private flushInbox(live: LiveAgent) {
    if (live.hold || live.inbox.length === 0) return;
    setTimeout(() => {
      if (this.agents.get(live.info.agentId) !== live || live.hold) return;
      const first = live.inbox.shift();
      if (!first) return;
      live.flushRest = live.inbox.length > 0;
      this.markUnrelayed(live, first.report);
      this.sendTo(live.info.agentId, first.text, "followUp");
      this.emitQueue(live);
    }, 0);
  }

  private sendTo(agentId: string, text: string, deliverAs: "steer" | "followUp" = "steer") {
    const live = this.requireLive(agentId);
    const run = live.session.isStreaming ? live.session.prompt(text, { streamingBehavior: deliverAs }) : live.session.prompt(text);
    run.catch((e: unknown) => {
      // 旧 run 在退场后才报错（dispose 时的 abort）：新会话的门不归它管，直接吞掉
      if (this.agents.get(agentId) !== live) return;
      const msg = e instanceof Error ? e.message : String(e);
      this.setStatus(live, "error", msg);
      // run 死了，它挂着的问答/待审再也没人能答，一并拒掉，别留幽灵 pending
      this.gate.rejectAgent(agentId, msg);
    });
  }

  // ───────────────────────── 子 agent ─────────────────────────

  /**
   * 派单名册：一次 spawn 里所有人共用一份，谁变了就整份回传。
   * 多人并行时进度不会互相覆盖，渲染层也能拿到每个人的 agentId 去跳会话。
   */
  private roster(slots: DispatchSlot[], onProgress: DispatchProgress) {
    const snapshot = (): DispatchDetails => ({ slots: slots.map((x) => ({ ...x })) });
    const line = (x: DispatchSlot) =>
      x.status === "running" ? `${x.label} 开始` : x.status === "done" ? `${x.label} 完成` : x.status === "error" ? `${x.label} 失败：${x.error ?? ""}` : x.label;
    return {
      snapshot,
      touch(slot: DispatchSlot, status: DispatchSlot["status"], error: string | null = null) {
        slot.status = status;
        slot.error = error;
        onProgress(slots.map(line).join("\n"), snapshot());
      },
    };
  }

  /**
   * 派单不阻塞主编：子 agent 各自后台跑，主编立刻拿到名册接着干别的；
   * 谁跑完了，报告就作为一条新消息送进主编收件箱（见 deliverReport）。
   * 工具已经返回后名册进度没人收了，onProgress 只在返回前有效。
   */
  private async spawn(parentId: string, tasks: SpawnTask[], onProgress: DispatchProgress): Promise<DispatchResult> {
    const slots: DispatchSlot[] = [];
    let returned = false;
    const roster = this.roster(slots, (t, d) => {
      if (!returned) onProgress(t, d);
    });
    for (const task of tasks) {
      // runChild 在第一个 await 之前就把 slot 推进名册，所以下面的 snapshot 拿得到全员
      void this.runChild(parentId, task, slots, roster).then((report) => this.deliverReport(parentId, task.role, report));
    }
    returned = true;
    const lines = slots.map((x) => `- ${x.label}（${x.role}，id=${x.agentId}）`).join("\n");
    return { text: `${DISPATCHED_NOTICE}\n${lines}`, details: roster.snapshot() };
  }

  /**
   * 子 agent 交回的报告送给派它的人：它在跑就进收件箱等轮末，暂停中也进收件箱等作者开口，空着就直接送。
   * 和作者的排队消息走同一条路，主编按「作者的话排最前」的顺序自己取。
   */
  private deliverReport(parentId: string, role: RoleId, report: string) {
    const live = this.agents.get(parentId);
    if (!live) return;
    const label = `${ROLES[role].label}交回`;
    const reportId = `${ROLES[role].label}:${randomUUID()}`;
    const text = stubPrompt(label, `报告编号：${reportId}\n\n${report}`);
    if (live.session.isStreaming || live.hold) {
      live.inbox.push({ id: randomUUID(), label, text, report: reportId });
      this.emitQueue(live);
      return;
    }
    this.markUnrelayed(live, reportId);
    this.sendTo(parentId, text);
  }

  /** 报告送到模型面前时登记唯一编号，由对话工具显式确认解释完成 */
  private markUnrelayed(live: LiveAgent, roleLabel: string | undefined) {
    if (roleLabel && !live.unrelayed.includes(roleLabel)) live.unrelayed.push(roleLabel);
  }

  /**
   * 派一个子 agent 并等它这一轮跑完。任何一步失败都不往外抛：
   * spawn 是 Promise.all，一个抛出会让主编只看到错误、同批其他人的结论被丢掉，
   * 而已经 register 的 live 会永远停在 running（界面上就是「在跑」却没有输出的幽灵）。
   */
  private async runChild(
    parentId: string,
    task: SpawnTask,
    slots: DispatchSlot[],
    roster: ReturnType<Kernel["roster"]>,
  ): Promise<string> {
    const def = ROLES[task.role];
    const agentId = randomUUID();
    const slot: DispatchSlot = { agentId, role: task.role, label: def.label, task: task.task, status: "running", error: null };
    slots.push(slot);
    let live: LiveAgent | null = null;
    try {
      const store = this.requireStore();
      // 子 agent 会话和主编一样落在项目里：作者可能在候选悬着时关掉应用去休息，重开后主编还能续派它
      const { session, tools } = await this.buildSession(task.role, agentId, SessionManager.create(store.info.root, store.agentSessionDir(agentId)));
      const mode = task.mode ?? "commit";
      live = this.register(
        { agentId, parentId, role: task.role, label: def.label, task: task.task, status: "running", error: null, statusText: "", mode },
        session,
        tools,
      );
      this.setMode(live, mode);
      await store.saveAgentRecord({ agentId, parentId, role: task.role, label: def.label, task: task.task, mode });
      return await this.promptChild(live, mode === "propose" ? modePrompt(mode, PROPOSE_NOTICE, task.task) : task.task, slot, roster);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (live) this.setStatus(live, "error", msg);
      roster.touch(slot, "error", msg);
      return `## ${def.label}（${task.role}，id=${agentId}）\n\n派单失败：${msg}`;
    }
  }

  private async continueChild(childId: string, message: string, mode: SpawnMode | undefined, onProgress: DispatchProgress): Promise<DispatchResult> {
    const live = this.agents.get(childId);
    if (!live || childId === LEAD_ID) throw new Error(`没有这个子 agent：${childId}。它可能已随项目关闭回收，需要重新 spawn_agents`);
    if (live.info.status === "running") throw new Error(`${live.info.label}（${childId}）还在跑，等它这一轮回来再续`);
    if (live.info.status === "archived") throw new Error(`${live.info.label}（${childId}）已封存，不能再续派；这条线要接着做就重新 spawn_agents`);
    if (mode && mode !== live.mode) {
      this.setMode(live, mode);
      const store = this.requireStore();
      const rec = (await store.agentRecords()).find((r) => r.agentId === childId);
      if (rec) await store.saveAgentRecord({ ...rec, mode });
    }
    const prompt = mode === "commit" ? modePrompt(mode, COMMIT_NOTICE, message) : mode === "propose" ? modePrompt(mode, PROPOSE_NOTICE, message) : message;
    const slot: DispatchSlot = { agentId: childId, role: live.info.role, label: live.info.label, task: message, status: "running", error: null };
    let returned = false;
    const roster = this.roster([slot], (t, d) => {
      if (!returned) onProgress(t, d);
    });
    const parentId = live.info.parentId ?? LEAD_ID;
    void this.promptChild(live, prompt, slot, roster).then((report) => this.deliverReport(parentId, live.info.role, report));
    returned = true;
    return { text: `${DISPATCHED_NOTICE}\n- ${live.info.label}（${live.info.role}，id=${childId}）`, details: roster.snapshot() };
  }

  /**
   * 子 agent 封存：状态变 archived、索引记一笔，会话原样留着能回看，主编不能再续派。
   * 主编判断这条线干完了调 archive_agent，作者也能在历史面板里点。在跑的不能封：它这轮的结论还没交回。
   * 封存不删东西（第五条：上下文是资产），删是作者在界面上另一步做的事。
   */
  private async archiveChild(childId: string): Promise<void> {
    if (childId === LEAD_ID) throw new Error("主编不能封存");
    const live = this.agents.get(childId);
    if (!live) throw new Error(`没有这个子 agent：${childId}`);
    if (live.info.status === "running") throw new Error(`${live.info.label}（${childId}）还在跑，等它这一轮回来再封`);
    if (live.info.status === "archived") throw new Error(`${live.info.label}（${childId}）已经封存了`);
    this.setStatus(live, "archived");
    const store = this.requireStore();
    const rec = (await store.agentRecords()).find((r) => r.agentId === childId);
    if (rec) await store.saveAgentRecord({ ...rec, archived: true });
  }

  /**
   * 子 agent 删除：摘表、释放会话、删索引和会话目录。只有作者能做（界面上的「删除」），主编只能封存。
   * 在跑的不能删：它这轮的结论还没交回，掐了主编那边的 spawn / continue 会悬着。
   * 删是不可逆的，所以只做判断后的执行，不做自动清理。
   */
  private async retireChild(childId: string): Promise<void> {
    if (childId === LEAD_ID) throw new Error("主编不能删除");
    const live = this.agents.get(childId);
    if (!live) throw new Error(`没有这个子 agent：${childId}`);
    if (live.info.status === "running") throw new Error(`${live.info.label}（${childId}）还在跑，等它这一轮回来再删`);
    this.agents.delete(childId);
    live.unsubscribe();
    live.session.dispose();
    await this.requireStore().dropAgentRecord(childId);
    this.emit({ type: "agent.retired", agentId: childId });
  }

  /**
   * 两道闸门：propose 时把写工具从会话里拿掉，模型根本看不到；
   * live.mode 再让 writeBlocked 兜底（万一模型凭记忆调用）。commit 时都放开。
   */
  private setMode(live: LiveAgent, mode: SpawnMode) {
    live.mode = mode;
    if (live.info.mode !== mode) {
      live.info.mode = mode;
      this.emit({ type: "agent.mode", agentId: live.info.agentId, mode });
    }
    const blocked = new Set<string>(WRITE_TOOL_NAMES);
    live.session.setActiveToolsByName(mode === "propose" ? live.tools.filter((t) => !blocked.has(t)) : live.tools);
  }

  /** 给子 agent 发一轮消息，等它跑完，把最后一段文字结论交回主编。会话跑完不退场，留给续接。 */
  private async promptChild(
    live: LiveAgent,
    message: string,
    slot: DispatchSlot,
    roster: ReturnType<Kernel["roster"]>,
  ): Promise<string> {
    const { session, info } = live;
    const header = `## ${info.label}（${info.role}，id=${info.agentId}）`;
    this.setStatus(live, "running");
    roster.touch(slot, "running");
    try {
      await session.prompt(message);
      const answer = lastAssistantText(session.messages as unknown[]);
      this.setStatus(live, "done");
      roster.touch(slot, "done");
      return `${header}\n\n${CHILD_REPORT_NOTICE}\n\n${answer || "（没有文字结论）"}`;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.setStatus(live, "error", msg);
      this.gate.rejectAgent(live.info.agentId, msg);
      roster.touch(slot, "error", msg);
      return `${header}\n\n执行失败：${msg}`;
    }
  }

  // ───────────────────────── 事件转发 ─────────────────────────

  /** 有派出去的人还在跑：主编停下等报告是合法的，不算「没问就停」 */
  private hasRunningChildren(parentId: string): boolean {
    for (const a of this.agents.values()) if (a.info.parentId === parentId && a.info.status === "running") return true;
    return false;
  }

  private setStatus(live: LiveAgent, status: AgentStatus, error: string | null = null) {
    // 只认对象不认 id：已退场（摘表 / 被同 id 新会话替换）的旧 live 发不出事件，防幽灵状态
    if (this.agents.get(live.info.agentId) !== live) return;
    if (live.info.status === status && live.info.error === error) return;
    live.info.status = status;
    live.info.error = error;
    this.emit({ type: "agent.status", agentId: live.info.agentId, status, error });
  }

  private send(live: LiveAgent, event: AgentStreamEvent) {
    if (event.type === "status_text") live.info.statusText = event.text;
    this.emit({ type: "agent.event", agentId: live.info.agentId, event });
  }

  /** 文本流开头先攒一行：是状态行就摘出来单发，不是就原样放行 */
  /** 给作者看的正文出去了：子 agent 结论就算解释过了 */
  private sendText(live: LiveAgent, messageId: string, delta: string) {
    this.send(live, { type: "text_delta", messageId, delta });
  }

  private forwardText(live: LiveAgent, messageId: string, delta: string) {
    if (live.headBuffer === null) {
      if (live.skipBlank) {
        if (!delta.trim()) return;
        live.skipBlank = false;
        delta = delta.replace(/^\s+/, "");
      }
      this.sendText(live, messageId, delta);
      return;
    }
    live.headBuffer += delta;
    const hasNewline = live.headBuffer.includes("\n");
    if (!hasNewline && live.headBuffer.length < HEAD_BUFFER_LIMIT) return;
    const status = takeStatusLine(live.headBuffer);
    const rest = status ? status.rest : live.headBuffer;
    live.headBuffer = null;
    live.skipBlank = Boolean(status) && !rest;
    if (status) this.send(live, { type: "status_text", text: status.text });
    if (rest) this.sendText(live, messageId, rest);
  }

  private forward(live: LiveAgent, event: SessionEvent) {
    const ev = event as { type: string } & Record<string, unknown>;
    switch (ev.type) {
      case "agent_start":
        this.setStatus(live, "running");
        live.asked = false;
        live.spoke = false;
        // 轮末只直发了收件箱的第一条，这轮跑起来了，其余的插进去
        if (live.flushRest) {
          live.flushRest = false;
          for (const e of live.inbox.splice(0)) {
            this.markUnrelayed(live, e.report);
            live.session.prompt(e.text, { streamingBehavior: "steer" }).catch(() => {});
          }
          this.emitQueue(live);
        }
        return;
      case "agent_end": {
        // 这轮模型报过错：pi 说要重试就先不报，让 auto_retry_start 走轻提示；不重试了才标 error
        const pending = live.pendingError;
        live.pendingError = null;
        if (pending && !ev.willRetry) this.setStatus(live, "error", pending);
        if (pending && ev.willRetry) return;
        if (live.info.status !== "error") this.setStatus(live, live.info.agentId === LEAD_ID ? "idle" : "done");
        // 会话 jsonl 又长了一截，和云端快照对不上了
        this.markCloudDirty();
        if (shouldNudge(live, this.hasRunningChildren(live.info.agentId))) {
          live.nudged = true;
          this.sendTo(LEAD_ID, stubPrompt("继续", NUDGE_PROMPT), "followUp");
          return;
        }
        this.flushInbox(live);
        return;
      }
      case "queue_update":
        live.steering = [...((ev.steering as readonly string[] | undefined) ?? [])];
        this.emitQueue(live);
        return;
      case "message_start": {
        const msg = normalizeMessage(ev.message);
        if (!msg) return;
        // user / assistant 都是一对 start / end，用同一个 id 才能在 UI 里合并成一条
        live.streamingMessageId = msg.id;
        live.headBuffer = msg.role === "assistant" ? "" : null;
        live.skipBlank = false;
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
          else this.sendText(live, msg.id, live.headBuffer);
        }
        live.headBuffer = null;
        live.skipBlank = false;
        live.streamingMessageId = null;
        this.send(live, { type: "message_end", message: msg });
        const raw = ev.message as RawMessage;
        if (raw.role === "assistant" && raw.stopReason === "error") {
          // 不马上标 error：pi 可能自动重试，等 agent_end 的 willRetry 再定
          live.pendingError = raw.errorMessage ?? "模型调用失败（没有错误详情）";
        }
        return;
      }
      case "auto_retry_start":
        this.send(live, {
          type: "retry",
          attempt: Number(ev.attempt),
          maxAttempts: Number(ev.maxAttempts),
          delayMs: Number(ev.delayMs),
          errorMessage: String(ev.errorMessage ?? ""),
        });
        return;
      case "tool_execution_start":
        if (ev.toolName === "ask_user") live.asked = true;
        // 可见表达允许自然收尾，但不代表任何报告已经解释。
        if (ev.toolName === "say" || ev.toolName === "ask_user") {
          const args = ev.args as { text?: unknown; say?: unknown } | undefined;
          const speech = ev.toolName === "say" ? args?.text : args?.say;
          if (typeof speech === "string" && speech.trim()) {
            live.spoke = true;
          }
        }
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
        // ask_user 被打回（参数不合法）不算问过：不然主编解释完就停，轮末以为已问过而不补，作者面前没有问题卡
        if (ev.toolName === "ask_user" && ev.isError) live.asked = false;
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

export type { CheckIssue };
