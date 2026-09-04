/**
 * 内核 ⇄ 渲染层的线协议。渲染层只依赖这一个文件。
 */

// ───────────────────────── 领域 ─────────────────────────

export type DocKindId =
  | "world"
  | "characters"
  | "threads"
  | "milestones"
  | "volumes"
  | "chapters"
  | "manuscript"
  | "brief"
  | "rules";

export interface DocKindInfo {
  id: DocKindId;
  label: string;
  /** 存放目录；单例文档为 ""（文件直接放项目根） */
  dir: string;
  description: string;
  /** 全书只有一份、路径即名字（如 简介.md），侧栏不展开 */
  singleton?: boolean;
}

export interface DocHeader {
  kind: DocKindId;
  id: string;
  /** 相对项目根的路径 */
  path: string;
  title: string;
  summary: string;
  keywords: string[];
  status: string;
  /** 非通用字段原样透传 */
  extra: Record<string, unknown>;
}

export interface DocContent extends DocHeader {
  /** 完整文件文本（frontmatter + 正文） */
  raw: string;
  body: string;
  sections: string[];
}

export interface ProjectInfo {
  root: string;
  name: string;
  createdAt: string;
}

export interface SearchHit {
  kind: DocKindId;
  id: string;
  title: string;
  summary: string;
  score: number;
  /** 命中所在的段名，空串表示在开头 / 只命中头信息 */
  section: string;
  /** 命中处前后各 40 字 */
  snippet: string;
}

export type IssueLevel = "error" | "warning";

/** 机检等级给作者看的叫法：error/warning 是内部字眼，界面和工具返回一律用这两个词 */
export const ISSUE_LEVEL_LABEL: Record<IssueLevel, string> = { error: "必须修", warning: "建议改" };

export interface CheckIssue {
  level: IssueLevel;
  kind: DocKindId | null;
  id: string | null;
  path: string | null;
  message: string;
  /** 一句能直接发给 lead 的修补请求；界面预填进输入框，作者确认后再发。没有就只展示，不给按钮 */
  fix?: string;
}

// ───────────────────────── 模型 ─────────────────────────

export interface ProviderInfo {
  id: string;
  name: string;
  configured: boolean;
  modelCount: number;
}

export interface ModelInfo {
  provider: string;
  id: string;
  name: string;
  reasoning: boolean;
  contextWindow: number;
  available: boolean;
}

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface ModelsState {
  providers: ProviderInfo[];
  models: ModelInfo[];
  current: { provider: string; id: string } | null;
  thinkingLevel: ThinkingLevel;
}

// ───────────────────────── 云端快照 ─────────────────────────

/** 云端配置状态；service key 永远不回给渲染层 */
export interface CloudStatus {
  configured: boolean;
  url: string | null;
  bucket: string | null;
}

export interface CloudProject {
  /** bucket 内目录名，由项目名 hash 得来 */
  slug: string;
  name: string;
  uploadedAt: string;
  /** 快照 tar.gz 字节数 */
  size: number;
  /** 上传机器的主机名 */
  host: string;
  fingerprint: string;
}

/** 云端项目 + 它和本机最近项目的关系：local 为 null 表示本机没有同名项目 */
export interface CloudProjectRow extends CloudProject {
  local: { root: string; synced: boolean } | null;
}

export interface CloudCheck {
  slug: string;
  localFingerprint: string;
  /** 云端没有该项目时为 null */
  remote: CloudProject | null;
  /** 本地内容与云端最新快照完全一致 */
  synced: boolean;
}

// ───────────────────────── 角色 / 能力 ─────────────────────────

export type RoleId =
  | "lead"
  | "architect"
  | "planner"
  | "writer"
  | "critic_market"
  | "critic_reader"
  | "critic_voice"
  | "continuity"
  | "arbiter";

export interface RoleInfo {
  id: RoleId;
  label: string;
  description: string;
  canWrite: boolean;
}

export type CapabilityId = "interview" | "talk" | "design" | "outline" | "draft" | "review";

export interface CapabilityParam {
  name: string;
  label: string;
  placeholder: string;
  required: boolean;
}

export interface CapabilityInfo {
  id: CapabilityId;
  label: string;
  description: string;
  params: CapabilityParam[];
}

// ───────────────────────── 对话消息 ─────────────────────────

/**
 * 界面按钮 / 内核代用户发出的指令，不是用户亲手打的字。
 * 消息体前面挂这个标记，UI 只显示一个小标签，不露内部 prompt。
 */
export const STUB_PREFIX = "⟦stub:";
export const STUB_SUFFIX = "⟧";
export const STUB_PATTERN = /^⟦stub:([^⟧\n]{1,40})⟧\r?\n?/;

export function stubPrompt(label: string, text: string): string {
  return `${STUB_PREFIX}${label}${STUB_SUFFIX}\n${text}`;
}

export type UiPart =
  | { type: "text"; text: string }
  /** 内部指令的占位：只显示 label */
  | { type: "stub"; label: string }
  | { type: "thinking"; text: string }
  | {
      type: "tool";
      toolCallId: string;
      name: string;
      args: unknown;
      status: "running" | "done" | "error";
      output: string;
      details: unknown;
    };

export interface UiMessage {
  id: string;
  role: "user" | "assistant" | "system";
  parts: UiPart[];
  createdAt: number;
}

export type AgentStatus = "idle" | "running" | "done" | "error";

export interface AgentInfo {
  agentId: string;
  parentId: string | null;
  role: RoleId;
  label: string;
  task: string;
  status: AgentStatus;
  error: string | null;
  /** 模型每轮开头自报的一句「正在……」，运行中滚动显示 */
  statusText: string;
}

/** spawn_agents / continue_agent 工具的 details：这张派单上每个人是谁、干到哪。渲染层靠它跳会话、显示进度 */
export interface DispatchSlot {
  agentId: string;
  role: RoleId;
  label: string;
  task: string;
  status: AgentStatus;
  error: string | null;
}

export interface DispatchDetails {
  slots: DispatchSlot[];
}

export type AgentStreamEvent =
  | { type: "message_start"; message: UiMessage }
  | { type: "text_delta"; messageId: string; delta: string }
  | { type: "thinking_delta"; messageId: string; delta: string }
  | { type: "tool_start"; messageId: string; toolCallId: string; name: string; args: unknown }
  | { type: "tool_update"; toolCallId: string; output: string; details: unknown }
  | { type: "tool_end"; toolCallId: string; output: string; details: unknown; isError: boolean }
  | { type: "message_end"; message: UiMessage }
  | { type: "status_text"; text: string }
  /** 排队中的消息：steering 会在当前这步工具结束后插进去，followUp 等整轮跑完再发 */
  | { type: "queue_update"; steering: string[]; followUp: string[] }
  /** interrupted：上次会话没有正常收尾（发了话没回 / 工具跑一半 / 被中止），UI 在末尾画一条分隔线 */
  | { type: "history"; messages: UiMessage[]; interrupted: boolean };

// ───────────────────────── 审批 / 提问 ─────────────────────────

export interface ApprovalRequest {
  approvalId: string;
  agentId: string;
  toolCallId: string;
  kind: DocKindId;
  docId: string;
  path: string;
  title: string;
  isNew: boolean;
  before: string;
  after: string;
  /** 标准 unified diff */
  patch: string;
}

export type ApprovalDecision = "approve" | "reject";

/**
 * 一个候选：短的直接给字串；长的（一段正文、一种写法）给 label + text，
 * label 是作者一眼能认出的短名字，text 是完整候选正文（支持 Markdown）。
 */
export type QuestionOption = string | { label: string; text: string };

export interface QuestionRequest {
  questionId: string;
  agentId: string;
  text: string;
  options: QuestionOption[];
  allowFreeText: boolean;
}

/** 候选的短名字：带 label 的用 label，纯字串就是它自己 */
export function optionLabel(o: QuestionOption): string {
  return typeof o === "string" ? o : o.label;
}

/** 候选的完整正文 */
export function optionText(o: QuestionOption): string {
  return typeof o === "string" ? o : o.text;
}

/** 有没有候选长到不适合用 chip 排：带 label 的、含换行的、超过 40 字的 */
export function hasLongOptions(options: QuestionOption[]): boolean {
  return options.some((o) => typeof o !== "string" || o.includes("\n") || o.length > 40);
}

// ───────────────────────── 事件（内核 → 渲染层） ─────────────────────────

export type KernelEvent =
  | { type: "kernel.ready"; version: string; home: string }
  | { type: "kernel.error"; message: string }
  | { type: "project.opened"; project: ProjectInfo; docs: DocHeader[]; kinds: DocKindInfo[] }
  | { type: "project.closed" }
  | { type: "docs.changed"; docs: DocHeader[] }
  | { type: "models.state"; state: ModelsState }
  | { type: "agent.spawned"; agent: AgentInfo }
  | { type: "agent.status"; agentId: string; status: AgentStatus; error: string | null }
  | { type: "agent.event"; agentId: string; event: AgentStreamEvent }
  | { type: "approval.requested"; request: ApprovalRequest }
  | { type: "approval.resolved"; approvalId: string; decision: ApprovalDecision }
  | { type: "question.requested"; request: QuestionRequest }
  | { type: "question.resolved"; questionId: string }
  | { type: "check.result"; issues: CheckIssue[] }
  /** 云端同步进度：定时同步与手动上传都发；idle 表示这轮结束 */
  | {
      type: "cloud.sync";
      phase: "uploading" | "idle" | "error";
      message: string | null;
      last: CloudProject | null;
      /** 当前项目本地内容是否已在云端；没配云端 / 没开项目 / 还没比对时为 null */
      synced: boolean | null;
    };

// ───────────────────────── 请求（渲染层 → 内核） ─────────────────────────

export interface RequestMap {
  /** 渲染层重载后调用：停掉所有 agent、撤掉悬着的审批 / 提问、关闭项目，让内核回到和空白界面一致的状态 */
  "kernel.reset": { params: Record<string, never>; result: null };
  "project.create": { params: { root: string; name: string }; result: ProjectInfo };
  "project.open": { params: { root: string }; result: ProjectInfo };
  "project.close": { params: Record<string, never>; result: null };
  /** 返回前会剔掉磁盘上已不存在的项目并落盘 */
  "project.recent": { params: Record<string, never>; result: string[] };
  /** 只从最近列表摘掉，不碰磁盘上的文件 */
  "project.forget": { params: { root: string }; result: null };
  /** 把项目全部文档拼成一份「故事种子」markdown（剥 frontmatter、不含设置），供日后「导入项目」由主编拆回最新结构 */
  "project.exportSeed": { params: Record<string, never>; result: { filename: string; content: string } };
  "doc.read": { params: { kind: DocKindId; id: string }; result: DocContent | null };
  /** expectBefore 给了就要求磁盘还是这份内容，否则报 StaleWriteError：防作者手改和 agent 落盘互相盖 */
  "doc.write": { params: { kind: DocKindId; id: string; raw: string; expectBefore?: string }; result: DocHeader };
  "doc.template": { params: { kind: DocKindId }; result: string };
  "search.query": { params: { query: string; limit?: number }; result: SearchHit[] };
  "models.list": { params: Record<string, never>; result: ModelsState };
  "models.select": {
    params: { provider: string; id: string; thinkingLevel?: ThinkingLevel };
    result: ModelsState;
  };
  "models.setApiKey": { params: { provider: string; apiKey: string }; result: ModelsState };
  "models.refresh": { params: Record<string, never>; result: ModelsState };
  /**
   * agentId 省略 = 主编。agent 跑着的时候按 deliverAs 决定怎么送：
   * steer（默认）插话，在当前这步工具结束后就送到；followUp 排队，等这一轮完全跑完再送。空闲时两者都是直接发。
   */
  "chat.send": { params: { text: string; agentId?: string; deliverAs?: "steer" | "followUp" }; result: null };
  /** 把还没送到的排队消息全部撤回，原文交还给输入框 */
  "chat.clearQueue": { params: { agentId?: string }; result: { steering: string[]; followUp: string[] } };
  /** 这个 agent 的会话记录 jsonl 落盘路径；子 agent 只在内存、或主编还没写过第一条时返回 null */
  "chat.sessionFile": { params: { agentId?: string }; result: string | null };
  /** 立刻中止：掐断正在跑的模型调用和工具，agent 回到空闲。输入框的「停」按钮和内核关项目 / 新会话 / reset 都走这条 */
  "chat.abort": { params: { agentId?: string }; result: null };
  /** 优雅暂停：让 agent 不再开新工具，收尾总结；主编会接着用 ask_user 问作者想怎么调整 */
  "chat.pause": { params: { agentId?: string }; result: null };
  "chat.new": { params: Record<string, never>; result: null };
  "capabilities.list": { params: Record<string, never>; result: CapabilityInfo[] };
  "capability.run": {
    params: { id: CapabilityId; params: Record<string, string> };
    result: null;
  };
  "roles.list": { params: Record<string, never>; result: RoleInfo[] };
  "approval.reply": {
    params: { approvalId: string; decision: ApprovalDecision; reason?: string };
    result: null;
  };
  "question.reply": { params: { questionId: string; answer: string }; result: null };
  "cloud.status": { params: Record<string, never>; result: CloudStatus };
  /** 保存凭据前先连一次 Supabase 校验；bucket 省略用默认 */
  "cloud.configure": { params: { url: string; serviceKey: string; bucket?: string }; result: CloudStatus };
  "cloud.clear": { params: Record<string, never>; result: CloudStatus };
  /** 云端所有项目，并按项目名对上本机最近打开的项目 */
  "cloud.list": { params: Record<string, never>; result: CloudProjectRow[] };
  /** 当前项目与云端比对 */
  "cloud.check": { params: Record<string, never>; result: CloudCheck };
  /** 上传当前项目；内容未变时不重传 */
  "cloud.upload": { params: { force?: boolean }; result: CloudProject };
  /** 下载到 dest 并打开。dest 须为空目录或不存在；replace 为 true 时允许覆盖一个已有项目目录（.git 保留） */
  "cloud.download": { params: { slug: string; dest: string; replace?: boolean }; result: ProjectInfo };
}

export type RequestMethod = keyof RequestMap;

export type RequestEnvelope<M extends RequestMethod = RequestMethod> = {
  kind: "request";
  id: string;
  method: M;
  params: RequestMap[M]["params"];
};

export type ResponseEnvelope =
  | { kind: "response"; id: string; ok: true; result: unknown }
  | { kind: "response"; id: string; ok: false; error: string };

export type EventEnvelope = { kind: "event"; event: KernelEvent };

export type Outbound = ResponseEnvelope | EventEnvelope;
