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
  | "guide";

export interface DocKindInfo {
  id: DocKindId;
  label: string;
  dir: string;
  description: string;
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

export interface CheckIssue {
  level: IssueLevel;
  kind: DocKindId | null;
  id: string | null;
  path: string | null;
  message: string;
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

export type CapabilityId = "interview" | "design" | "outline" | "draft" | "review" | "check";

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

export type UiPart =
  | { type: "text"; text: string }
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

export type AgentStreamEvent =
  | { type: "message_start"; message: UiMessage }
  | { type: "text_delta"; messageId: string; delta: string }
  | { type: "thinking_delta"; messageId: string; delta: string }
  | { type: "tool_start"; messageId: string; toolCallId: string; name: string; args: unknown }
  | { type: "tool_update"; toolCallId: string; output: string; details: unknown }
  | { type: "tool_end"; toolCallId: string; output: string; details: unknown; isError: boolean }
  | { type: "message_end"; message: UiMessage }
  | { type: "status_text"; text: string }
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

export interface QuestionRequest {
  questionId: string;
  agentId: string;
  text: string;
  options: string[];
  allowFreeText: boolean;
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
  | { type: "check.result"; issues: CheckIssue[] };

// ───────────────────────── 请求（渲染层 → 内核） ─────────────────────────

export interface RequestMap {
  /** 渲染层重载后调用：停掉所有 agent、撤掉悬着的审批 / 提问、关闭项目，让内核回到和空白界面一致的状态 */
  "kernel.reset": { params: Record<string, never>; result: null };
  "project.create": { params: { root: string; name: string }; result: ProjectInfo };
  "project.open": { params: { root: string }; result: ProjectInfo };
  "project.close": { params: Record<string, never>; result: null };
  "project.recent": { params: Record<string, never>; result: string[] };
  "doc.read": { params: { kind: DocKindId; id: string }; result: DocContent | null };
  "doc.write": { params: { kind: DocKindId; id: string; raw: string }; result: DocHeader };
  "doc.template": { params: { kind: DocKindId }; result: string };
  "search.query": { params: { query: string; limit?: number }; result: SearchHit[] };
  "models.list": { params: Record<string, never>; result: ModelsState };
  "models.select": {
    params: { provider: string; id: string; thinkingLevel?: ThinkingLevel };
    result: ModelsState;
  };
  "models.setApiKey": { params: { provider: string; apiKey: string }; result: ModelsState };
  "models.refresh": { params: Record<string, never>; result: ModelsState };
  /** agentId 省略 = 主编；给子 agent 发话是插话（steer），它完成目标前不会停 */
  "chat.send": { params: { text: string; agentId?: string }; result: null };
  /** 强制中止。不给用户按钮；内核关项目 / 新会话 / reset 时内部走这条 */
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
  "check.run": { params: Record<string, never>; result: CheckIssue[] };
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
