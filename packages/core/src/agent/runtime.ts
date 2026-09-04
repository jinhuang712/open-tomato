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
  DocKindId,
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
  UiMessage,
  UiPart,
} from "../protocol.js";
import { STUB_PATTERN, stubPrompt } from "../protocol.js";
import { stubStripExtension } from "./stub-strip.js";
import { cloudConfigPath, clearCloudConfig, normalizeCloudConfig, readCloudConfig, writeCloudConfig, type CloudConfig } from "../cloud/config.js";
import { CloudSync, projectSlug } from "../cloud/sync.js";
import { runCheck } from "../project/check.js";
import { DOC_KIND_IDS, DOC_KINDS, kindInfos, resolveKind } from "../project/kinds.js";
import { contentHash } from "../project/records.js";
import { SearchIndex } from "../project/search.js";
import { buildStorySeed, storySeedFilename } from "../project/seed.js";
import { migrateLegacySessions, ProjectStore } from "../project/store.js";
import { CAPABILITIES, capabilityInfos, isCapabilityId } from "./capabilities.js";
import { Gate } from "./gate.js";
import { ModelsFacade } from "./models.js";
import { ROLES, STATUS_LINE_PATTERN, STATUS_LINE_RULE, roleInfos } from "./roles.js";
import {
  createTools,
  type DispatchProgress,
  type DispatchResult,
  type SpawnMode,
  type SpawnTask,
  type ToolContext,
  toolNames,
  WRITE_TOOL_NAMES,
} from "./tools.js";

type AgentSession = Awaited<ReturnType<typeof createAgentSession>>["session"];
type SessionEvent = Parameters<Parameters<AgentSession["subscribe"]>[0]>[0];

const LEAD_ID = "director";

/** propose 轮发给子 agent 的开场说明：写工具已从会话里拿掉，别去试 */
const PROPOSE_NOTICE = "【候选阶段：这一轮没有 write_doc / edit_doc，不要尝试落盘或写临时稿。把候选直接写在回复里交给主编，作者拍板后主编会让你接着落盘】";

/** 界面 / 外部调用传来的 kind 先过一遍校验，别让 undefined 一路漏到 DOC_KINDS[kind] 上炸出 TypeError */
function kindOf(v: unknown): DocKindId {
  const k = resolveKind(v);
  if (!k) throw new Error(`未知的 kind：${String(v)}，可选 ${DOC_KIND_IDS.map((x) => `${x}（${DOC_KINDS[x].dir}）`).join(" / ")}`);
  return k;
}

const PAUSE_PROMPT_LEAD = `【作者按了「暂停」】
请立刻收尾，不要再开新的工具调用，也不要再派子 agent：
1. 用三五句话说清到目前为止做了什么、停在哪一步、还差什么
2. 然后用 ask_user 问作者想怎么调整，选项固定给这三个并允许自由输入：「我有新的想法」「对之前的内容不满意」「换个方向」
3. 拿到回答后按回答处理；作者说继续就接着做`;

/** 主编没问作者就停了：不是在等拍板，就是漏了 ask_user。补一句让它自己判断 */
const NUDGE_PROMPT = "【你停下了，但没有问作者。要作者回答的用 ask_user 问出去；没有要问的就接着做下一件】";

/**
 * 主编这一轮该不该补一句：没调 ask_user、不是出错或暂停、收件箱里也没有作者的话等着（有就送作者的话，不用补）。
 * 每次作者发言只补一次，补完再停就真停，交给作者。
 */
export function shouldNudge(live: Pick<LiveAgent, "info" | "asked" | "nudged" | "hold" | "inbox">): boolean {
  if (live.info.agentId !== LEAD_ID) return false;
  if (live.info.status === "error") return false;
  if (live.asked || live.nudged || live.hold) return false;
  return live.inbox.length === 0;
}

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
  /** 状态行摘完后正文还没开始：后续先到的空白 delta 直接吞掉，不然会渲染成空段落撑开行距 */
  skipBlank: boolean;
  /** propose 时落盘工具被挡住；主编续派时可以切到 commit */
  mode: SpawnMode;
  /** 这个角色的全部工具名；propose 时用它算出剥掉写工具后的列表，commit 时恢复 */
  tools: string[];
  /** 收件箱：它跑着的时候作者发的话与批注，等这轮结束一并送进去。没人有权打断它手上那一件，除了作者点「插入」 */
  inbox: InboxEntry[];
  /** 已插入、还在 pi 的插话队列里等下一个工具边界的消息，界面上标「已插入」 */
  steering: string[];
  /** 作者按了暂停：这轮结束后收件箱先不送，作者再开口才送 */
  hold: boolean;
  /** 轮末送了收件箱的第一条，其余等这一轮 agent_start 后插进去 */
  flushRest: boolean;
  /** 这一轮里调过 ask_user：主编只有问作者才算合法收尾 */
  asked: boolean;
  /** 这轮是补过的：主编没问就停时内核补一句让它接着干，一次作者发言只补一次，别循环 */
  nudged: boolean;
}

interface InboxEntry {
  id: string;
  label: string;
  text: string;
}

/** 状态行最多攒这么多字符还没换行就当没有，整段放行 */
const HEAD_BUFFER_LIMIT = 48;
/** 定期云端同步间隔：10 分钟 */
const CLOUD_SYNC_INTERVAL_MS = 10 * 60_000;

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
  /** 云端快照凭据；null 表示未配置 */
  private cloudConfig: CloudConfig | null = null;
  private cloudTimer: ReturnType<typeof setInterval> | null = null;
  private cloudBusy = false;
  /** 当前项目本地内容是否已在云端：null = 未知（没配云端 / 还没比对） */
  private cloudSynced: boolean | null = null;
  private markReady!: () => void;
  private failReady!: (e: Error) => void;

  constructor(
    private readonly home: string,
    private readonly emit: (event: KernelEvent) => void,
  ) {
    this.legacySessionsDir = path.join(home, "sessions");
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
    this.cloudConfig = await readCloudConfig(cloudConfigPath(this.home));
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
      // 先把新项目立起来再关旧的：新项目开不了（路径不对、已存在）时，当前项目保持原样
      "project.create": async ({ root, name }) => {
        const store = await ProjectStore.create(root, name);
        await this.closeProject();
        this.store = store;
        await this.afterOpen("new");
        return store.info;
      },
      "project.open": async ({ root }) => {
        const store = await ProjectStore.open(root);
        await this.closeProject();
        this.store = store;
        await this.afterOpen("continue");
        return store.info;
      },
      "project.close": async () => {
        await this.closeProject();
        return null;
      },
      // 磁盘上已经不是项目的（目录被删、被改名）顺手从列表摘掉，首页不留死卡片
      "project.recent": async () => {
        const all = this.models.recentProjects;
        const alive = await Promise.all(all.map((root) => ProjectStore.exists(root)));
        for (const [i, root] of all.entries()) if (!alive[i]) await this.models.forgetProject(root);
        return this.models.recentProjects;
      },
      "project.forget": async ({ root }) => {
        await this.models.forgetProject(root);
        return null;
      },
      "project.exportSeed": async () => {
        const store = this.requireStore();
        const now = new Date();
        return { filename: storySeedFilename(store.info.name, now), content: await buildStorySeed(store, now) };
      },
      "doc.read": async ({ kind, id }) => this.requireStore().read(kindOf(kind), id),
      "doc.write": async ({ kind, id, raw, expectBefore }) => {
        // 作者在阅读界面手改：不走审批门，但改动是全系统最高信号的一条批，patch 随批落盘
        const store = this.requireStore();
        const k = kindOf(kind);
        const preview = await store.previewWrite(k, id, raw);
        const header = await store.write(k, preview.id, preview.after, expectBefore === undefined ? {} : { expectBefore });
        if (preview.before !== preview.after) {
          await store.records.appendMark({
            kind: k,
            id: preview.id,
            type: "edit",
            by: "author",
            before: contentHash(preview.before),
            version: contentHash(preview.after),
            patch: preview.patch,
          });
        }
        await this.emitDocsChanged();
        return header;
      },
      "doc.template": async ({ kind }) => this.requireStore().template(kindOf(kind)),
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
      "chat.send": async ({ text, agentId, deliverAs }) => {
        const live = this.requireLive(agentId ?? LEAD_ID);
        this.authorActed(live);
        const how = deliverAs ?? "steer";
        // 排队的不进 pi 的队列，进我们自己的收件箱：能单条插入、能撤回，轮末一并送
        if (how === "followUp" && live.session.isStreaming) {
          const stub = STUB_PATTERN.exec(text);
          live.inbox.push({ id: randomUUID(), label: stub ? stub[1]!.trim() : "排队", text });
          this.emitQueue(live);
          return null;
        }
        this.sendTo(live.info.agentId, text, how);
        return null;
      },
      "chat.insert": async ({ agentId, id }) => {
        const live = this.requireLive(agentId ?? LEAD_ID);
        const at = live.inbox.findIndex((e) => e.id === id);
        if (at < 0) return null;
        const [entry] = live.inbox.splice(at, 1);
        this.authorActed(live);
        this.sendTo(live.info.agentId, entry!.text, "steer");
        this.emitQueue(live);
        return null;
      },
      "chat.clearQueue": async ({ agentId }) => {
        const live = this.agents.get(agentId ?? LEAD_ID);
        if (!live) return { texts: [] };
        const q = live.session.clearQueue();
        const texts = [...q.steering, ...q.followUp, ...live.inbox.map((e) => e.text)];
        live.inbox = [];
        live.steering = [];
        live.flushRest = false;
        this.emitQueue(live);
        return { texts };
      },
      "chat.sessionFile": async ({ agentId }) => {
        const live = this.agents.get(agentId ?? LEAD_ID);
        return live?.session.sessionFile ?? null;
      },
      "chat.pause": async ({ agentId }) => {
        const id = agentId ?? LEAD_ID;
        const live = this.agents.get(id);
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
        const targets = agentId ? [this.agents.get(agentId)].filter((a): a is LiveAgent => !!a) : [...this.agents.values()];
        for (const a of targets) {
          // 作者按了停止：这轮的 agent_end 不算「没问就停」，也不去取收件箱，作者再开口才动
          a.hold = true;
          await a.session.abort().catch(() => {});
        }
        return null;
      },
      "chat.new": async () => {
        this.requireStore();
        await this.disposeAgents(true);
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
        this.authorActed(this.agents.get(LEAD_ID));
        if (!this.gate.resolveApproval(approvalId, { decision, reason: reason ?? "" })) {
          // 已经不在了（被中止 / 重复点），也让 UI 撤掉
          this.emit({ type: "approval.resolved", approvalId, decision });
        }
        return null;
      },
      "question.reply": async ({ questionId, answer }) => {
        this.authorActed(this.agents.get(LEAD_ID));
        if (!this.gate.resolveQuestion(questionId, answer)) this.emit({ type: "question.resolved", questionId });
        return null;
      },
      "cloud.status": async () => this.cloudStatus(),
      "cloud.configure": async ({ url, serviceKey, bucket }) => {
        const candidate: CloudConfig = { url, serviceKey, bucket: bucket ?? "" };
        const next = normalizeCloudConfig(candidate);
        // 先连一次再落盘：连不上就不留下坏配置，旧配置原样保留
        await new CloudSync(next).verify();
        await writeCloudConfig(cloudConfigPath(this.home), next);
        this.cloudConfig = next;
        this.startCloudTimer();
        return this.cloudStatus();
      },
      "cloud.clear": async () => {
        await clearCloudConfig(cloudConfigPath(this.home));
        this.cloudConfig = null;
        this.stopCloudTimer();
        return this.cloudStatus();
      },
      "cloud.list": async () =>
        this.requireCloud().listWithLocals(this.models.recentProjects, async (root) =>
          (await ProjectStore.exists(root)) ? (await ProjectStore.open(root)).info.name : null,
        ),
      "cloud.check": async () => this.requireCloud().check(this.requireStore().info),
      "cloud.upload": async ({ force }) => this.cloudUpload(force === true),
      "cloud.download": async ({ slug, dest, replace }) => {
        // 覆盖的目标可能正是当前项目：先关掉，agent 不能在被替换的目录上继续写
        if (replace && this.store && path.resolve(this.store.info.root) === path.resolve(dest)) await this.closeProject();
        const { root } = await this.requireCloud().download(slug, dest, { replace: replace === true });
        const store = await ProjectStore.open(root);
        await this.closeProject();
        this.store = store;
        await this.afterOpen("continue");
        return store.info;
      },
      "cloud.remove": async ({ root }) => {
        const cloud = this.requireCloud();
        const { name } = (await ProjectStore.open(root)).info;
        await cloud.removeProject(projectSlug(name));
        if (this.store && this.store.info.name === name) {
          this.cloudSynced = false;
          this.emit({ type: "cloud.sync", phase: "idle", message: null, last: null, synced: false });
        }
        return null;
      },
      "cloud.wipe": async () => {
        const removed = await this.requireCloud().wipe();
        if (this.store) {
          this.cloudSynced = false;
          this.emit({ type: "cloud.sync", phase: "idle", message: null, last: null, synced: false });
        }
        return { removed };
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
    await this.models.bindProject(store.settingsPath);
    this.emit({ type: "models.state", state: this.models.state() });
    this.emit({ type: "project.opened", project: store.info, docs: await store.listAll(), kinds: kindInfos() });
    await this.refreshCheck();
    await this.createLead(mode);
    this.startCloudTimer();
    void this.cloudRecheck();
  }

  private async closeProject() {
    if (!this.store) return;
    this.stopCloudTimer();
    this.cloudSynced = null;
    await this.disposeAgents(false);
    this.store = null;
    this.index = null;
    this.models.unbindProject();
    this.emit({ type: "project.closed" });
    this.emit({ type: "models.state", state: this.models.state() });
  }

  // ───────────────────────── 云端快照 ─────────────────────────

  private cloudStatus() {
    return {
      configured: this.cloudConfig !== null,
      url: this.cloudConfig?.url ?? null,
      bucket: this.cloudConfig?.bucket ?? null,
    };
  }

  private requireCloud(): CloudSync {
    if (!this.cloudConfig) throw new Error("还没有配置云端存储");
    return new CloudSync(this.cloudConfig);
  }

  /** 上传当前项目；同一时刻只跑一份，进度用 cloud.sync 事件广播 */
  private async cloudUpload(force: boolean) {
    const info = this.requireStore().info;
    const cloud = this.requireCloud();
    if (this.cloudBusy) throw new Error("上一次同步还没结束");
    this.cloudBusy = true;
    this.emit({ type: "cloud.sync", phase: "uploading", message: null, last: null, synced: this.cloudSynced });
    try {
      const last = await cloud.upload(info, { force });
      this.cloudSynced = true;
      this.emit({ type: "cloud.sync", phase: "idle", message: null, last, synced: true });
      return last;
    } catch (e) {
      this.emit({ type: "cloud.sync", phase: "error", message: e instanceof Error ? e.message : String(e), last: null, synced: this.cloudSynced });
      throw e;
    } finally {
      this.cloudBusy = false;
    }
  }

  /** 项目打开时和云端比一次，之后靴子落地就靠 markCloudDirty */
  private async cloudRecheck() {
    if (!this.store || !this.cloudConfig) return;
    const store = this.store;
    try {
      const check = await new CloudSync(this.cloudConfig).check(store.info);
      if (this.store !== store) return;
      this.cloudSynced = check.synced;
      this.emit({ type: "cloud.sync", phase: "idle", message: null, last: check.remote, synced: check.synced });
    } catch (e) {
      if (this.store !== store) return;
      this.emit({ type: "cloud.sync", phase: "error", message: e instanceof Error ? e.message : String(e), last: null, synced: null });
    }
  }

  /** 文档落盘 / 会话有新内容：本地肯定比云端新了 */
  private markCloudDirty() {
    if (!this.store || !this.cloudConfig || this.cloudSynced === false) return;
    this.cloudSynced = false;
    this.emit({ type: "cloud.sync", phase: "idle", message: null, last: null, synced: false });
  }

  /** 项目打开且配好云端时，每 CLOUD_SYNC_INTERVAL_MS 静默同步一次；内容没变不会真的上传 */
  private startCloudTimer() {
    this.stopCloudTimer();
    if (!this.store || !this.cloudConfig) return;
    this.cloudTimer = setInterval(() => {
      if (!this.store || this.cloudBusy) return;
      void this.cloudUpload(false).catch(() => {});
    }, CLOUD_SYNC_INTERVAL_MS);
  }

  private stopCloudTimer() {
    if (this.cloudTimer) clearInterval(this.cloudTimer);
    this.cloudTimer = null;
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
    for (const a of lives) this.setStatus(a, a.info.agentId === LEAD_ID ? "idle" : "done");
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
      getExtensions: () => ({ extensions: [stubStripExtension()], errors: [], runtime: createExtensionRuntime() }),
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

  private async buildSession(role: RoleId, agentId: string, sessionManager: SessionManager): Promise<{ session: AgentSession; tools: string[] }> {
    const store = this.requireStore();
    const def = ROLES[role];
    const tools = createTools(this.toolContext(agentId, def.canSpawn), {
      canWrite: def.canWrite,
      canSpawn: def.canSpawn,
      canAsk: def.canAsk,
      ...(def.canReview ? { reviewAs: role } : {}),
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
    return { session, tools: toolNames(tools) };
  }

  private register(info: AgentInfo, session: AgentSession, tools: string[]): LiveAgent {
    const live: LiveAgent = { info, session, tools, unsubscribe: () => {}, streamingMessageId: null, headBuffer: null, skipBlank: false, mode: "commit", inbox: [], steering: [], hold: false, flushRest: false, asked: false, nudged: false };
    live.unsubscribe = session.subscribe((event) => this.forward(live, event));
    this.agents.set(info.agentId, live);
    this.emit({ type: "agent.spawned", agent: info });
    return live;
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
      { agentId: LEAD_ID, parentId: null, role: LEAD_ID, label: ROLES.director.label, task: "", status: "idle", error: null, statusText: "" },
      session,
      tools,
    );
    this.replayHistory(LEAD_ID, session);
    this.setStatus(live, "idle");
    if (mode === "continue") await this.restoreChildren();
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
   * 接回来的都是 done：重启后没有人在跑，主编要续就 continue。接不回的（目录没了）从索引里删。
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
          { agentId: rec.agentId, parentId: rec.parentId, role: rec.role, label: rec.label, task: rec.task, status: "done", error: null, statusText: "" },
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
    if (!live) throw new Error(agentId === LEAD_ID ? "主编会话不存在，先打开项目" : "这个子 agent 不存在或已随项目关闭回收");
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

  private async spawn(parentId: string, tasks: SpawnTask[], onProgress: DispatchProgress, signal?: AbortSignal): Promise<DispatchResult> {
    const slots: DispatchSlot[] = [];
    const roster = this.roster(slots, onProgress);
    const texts = await Promise.all(tasks.map((t) => this.runChild(parentId, t, slots, roster, signal)));
    return { text: texts.join("\n\n"), details: roster.snapshot() };
  }

  private async runChild(
    parentId: string,
    task: SpawnTask,
    slots: DispatchSlot[],
    roster: ReturnType<Kernel["roster"]>,
    signal?: AbortSignal,
  ): Promise<string> {
    const store = this.requireStore();
    const def = ROLES[task.role];
    const agentId = randomUUID();
    // 子 agent 会话和主编一样落在项目里：作者可能在候选悬着时关掉应用去休息，重开后主编还能续派它
    const { session, tools } = await this.buildSession(task.role, agentId, SessionManager.create(store.info.root, store.agentSessionDir(agentId)));
    const live = this.register(
      { agentId, parentId, role: task.role, label: def.label, task: task.task, status: "running", error: null, statusText: "" },
      session,
      tools,
    );
    const mode = task.mode ?? "commit";
    this.setMode(live, mode);
    await store.saveAgentRecord({ agentId, parentId, role: task.role, label: def.label, task: task.task, mode });
    const slot: DispatchSlot = { agentId, role: task.role, label: def.label, task: task.task, status: "running", error: null };
    slots.push(slot);
    const prefix = mode === "propose" ? `${PROPOSE_NOTICE}\n` : "";
    return this.promptChild(live, prefix + task.task, slot, roster, signal);
  }

  private async continueChild(
    childId: string,
    message: string,
    mode: SpawnMode | undefined,
    onProgress: DispatchProgress,
    signal?: AbortSignal,
  ): Promise<DispatchResult> {
    const live = this.agents.get(childId);
    if (!live || childId === LEAD_ID) throw new Error(`没有这个子 agent：${childId}。它可能已随项目关闭回收，需要重新 spawn_agents`);
    if (live.info.status === "running") throw new Error(`${live.info.label}（${childId}）还在跑，等它这一轮回来再续`);
    if (mode && mode !== live.mode) {
      this.setMode(live, mode);
      const store = this.requireStore();
      const rec = (await store.agentRecords()).find((r) => r.agentId === childId);
      if (rec) await store.saveAgentRecord({ ...rec, mode });
    }
    const prefix = mode === "commit" ? "【主编已切换你到落盘阶段，这一轮可以 write_doc / edit_doc】\n" : mode === "propose" ? `${PROPOSE_NOTICE}\n` : "";
    const slot: DispatchSlot = { agentId: childId, role: live.info.role, label: live.info.label, task: message, status: "running", error: null };
    const roster = this.roster([slot], onProgress);
    const text = await this.promptChild(live, prefix + message, slot, roster, signal);
    return { text, details: roster.snapshot() };
  }

  /**
   * 两道闸门：propose 时把写工具从会话里拿掉，模型根本看不到；
   * live.mode 再让 writeBlocked 兜底（万一模型凭记忆调用）。commit 时都放开。
   */
  private setMode(live: LiveAgent, mode: SpawnMode) {
    live.mode = mode;
    const blocked = new Set<string>(WRITE_TOOL_NAMES);
    live.session.setActiveToolsByName(mode === "propose" ? live.tools.filter((t) => !blocked.has(t)) : live.tools);
  }

  /** 给子 agent 发一轮消息，等它跑完，把最后一段文字结论交回主编。会话跑完不退场，留给续接。 */
  private async promptChild(
    live: LiveAgent,
    message: string,
    slot: DispatchSlot,
    roster: ReturnType<Kernel["roster"]>,
    signal?: AbortSignal,
  ): Promise<string> {
    const { session, info } = live;
    const header = `## ${info.label}（${info.role}，id=${info.agentId}）`;
    const onAbort = () => void session.abort().catch(() => {});
    signal?.addEventListener("abort", onAbort, { once: true });
    this.setStatus(live, "running");
    roster.touch(slot, "running");
    try {
      await session.prompt(message);
      if (signal?.aborted) throw new Error("已中止");
      const answer = lastAssistantText(session.messages as unknown[]);
      this.setStatus(live, "done");
      roster.touch(slot, "done");
      return `${header}\n\n${answer || "（没有文字结论）"}`;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.setStatus(live, "error", msg);
      this.gate.rejectAgent(live.info.agentId, msg);
      roster.touch(slot, "error", msg);
      return `${header}\n\n执行失败：${msg}`;
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }
  }

  // ───────────────────────── 事件转发 ─────────────────────────

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
  private forwardText(live: LiveAgent, messageId: string, delta: string) {
    if (live.headBuffer === null) {
      if (live.skipBlank) {
        if (!delta.trim()) return;
        live.skipBlank = false;
        delta = delta.replace(/^\s+/, "");
      }
      this.send(live, { type: "text_delta", messageId, delta });
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
    if (rest) this.send(live, { type: "text_delta", messageId, delta: rest });
  }

  private forward(live: LiveAgent, event: SessionEvent) {
    const ev = event as { type: string } & Record<string, unknown>;
    switch (ev.type) {
      case "agent_start":
        this.setStatus(live, "running");
        live.asked = false;
        // 轮末只直发了收件箱的第一条，这轮跑起来了，其余的插进去
        if (live.flushRest) {
          live.flushRest = false;
          for (const e of live.inbox.splice(0)) live.session.prompt(e.text, { streamingBehavior: "steer" }).catch(() => {});
          this.emitQueue(live);
        }
        return;
      case "agent_end":
        if (live.info.status !== "error") this.setStatus(live, live.info.agentId === LEAD_ID ? "idle" : "done");
        // 会话 jsonl 又长了一截，和云端快照对不上了
        this.markCloudDirty();
        if (shouldNudge(live)) {
          live.nudged = true;
          this.sendTo(LEAD_ID, stubPrompt("继续", NUDGE_PROMPT), "followUp");
          return;
        }
        this.flushInbox(live);
        return;
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
          else this.send(live, { type: "text_delta", messageId: msg.id, delta: live.headBuffer });
        }
        live.headBuffer = null;
        live.skipBlank = false;
        live.streamingMessageId = null;
        this.send(live, { type: "message_end", message: msg });
        const raw = ev.message as RawMessage;
        if (raw.role === "assistant" && raw.stopReason === "error") {
          this.setStatus(live, "error", raw.errorMessage ?? "模型调用失败（没有错误详情）");
        }
        return;
      }
      case "tool_execution_start":
        if (ev.toolName === "ask_user") live.asked = true;
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
  // 状态行和正文之间的空行全吞掉：留一个 "\n" 进消息体，marked 开着 breaks 会渲染成一段空白
  return { text: m[1]!.trim(), rest: text.slice(m[0].length).replace(/^(?:[ \t]*\r?\n)+/, "") };
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
          // assistant 第一段正文开头的状态行不进消息体，它走 status_text。
          // 开着思考时 thinking 排在 text 前面，所以按「第一个 text」判断，不能按 parts 是否为空
          const firstText = !parts.some((p) => p.type === "text");
          const text = m.role === "assistant" && firstText ? (takeStatusLine(c.text)?.rest ?? c.text) : c.text;
          if (text.trim()) parts.push({ type: "text", text });
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
