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

/** 线索卡 type 的取值。主线：贯穿全书的那一条；支线：有头有尾、服务主线的副线；主题：不靠事件推进的意义线；小故事：几章内自成一体的独立段落 */
export const THREAD_TYPES = ["主线", "支线", "主题", "小故事"] as const;
export type ThreadType = (typeof THREAD_TYPES)[number];

/** 线索 status 到了这几个值就算收束：不再报推进情况与孤儿，侧栏也淡出。已经收束的线不欠读者 */
export const SETTLED_STATUS = new Set(["done", "retired", "完结", "已收束"]);
export const isSettled = (status: string) => SETTLED_STATUS.has(status);

export interface DocKindInfo {
  id: DocKindId;
  label: string;
  /** 存放目录；单例文档为 ""（文件直接放项目根） */
  dir: string;
  description: string;
  /** 全书只有一份、路径即名字（如 简介.md），侧栏不展开 */
  singleton?: boolean;
  /**
   * 侧栏按哪个 frontmatter 字段分组。给了 order 就按这个固定顺序出组（人物层级、线索类型）；
   * 没给 order 的是动态组：这本书里实际写了哪些值就出哪些组，卡多的在前（世界设定的 category，玄幻是宗门 / 功法，都市是公司 / 圈子）。
   * 字段没填的归「未分类」垫底。
   */
  group?: { field: string; order?: readonly string[] };
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

/** 作者置顶的一张卡：工作台状态，不是故事内容，存项目 settings.json */
export interface PinRef {
  kind: DocKindId;
  id: string;
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

export type IssueLevel = "error" | "warning" | "info";

/**
 * 机检等级给作者看的叫法：error/warning/info 是内部字眼，界面和工具返回一律用这几个词。
 * info 是事实不是判词：机检只说「这条线最后在第几章推进过、之后写了几章」，该不该动交给模型和作者，侧栏不为它亮点。
 */
export const ISSUE_LEVEL_LABEL: Record<IssueLevel, string> = { error: "必须修", warning: "建议改", info: "留意" };

/**
 * 作者退回一稿时的词汇表。它是给作者的词，不是快捷键：说不出哪里不对的人也能选一个。
 * 正文一套按写作的真难点长，「我没感觉」合法，是「有反应没有词」的出口；材料一套讲流程位置。
 * 界面按钮和批里的 word 字段都从这里取，只写一处。
 */
export const PROSE_REJECT_WORDS = ["太急", "太满", "他不会这么说", "没有事发生", "我没感觉"] as const;
export const MATERIAL_REJECT_WORDS = ["还没讨论到这一步，先别落盘", "方向不对，先回复里给候选", "内容大致可以，细节要改"] as const;
export const REJECT_WORDS: ReadonlySet<string> = new Set([...PROSE_REJECT_WORDS, ...MATERIAL_REJECT_WORDS]);

/** 卷纲 chapters 字段「1-30」「5」这类写法解析成闭区间；界面的阶段判定和内核的节奏表共用 */
export function chapterRange(v: unknown): [number, number] | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const m = String(v).match(/(\d+)\s*(?:[-–~至到]\s*(\d+))?/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] === undefined ? a : Number(m[2]);
  return a > 0 && b >= a ? [a, b] : null;
}

export interface CheckIssue {
  level: IssueLevel;
  kind: DocKindId | null;
  id: string | null;
  path: string | null;
  message: string;
  /** 一句能直接发给主编的修补请求；界面预填进输入框，作者确认后再发。没有就只展示，不给按钮 */
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
  /** 这个模型支持的思考档；非推理模型只有 ["off"]，xhigh / max 只有明确声明支持的模型才有 */
  thinkingLevels: ThinkingLevel[];
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
  | "director"
  | "designer"
  | "plotter"
  | "writer"
  | "ops"
  | "reader"
  | "copyeditor"
  | "proofreader"
  | "arbiter";

export interface RoleInfo {
  id: RoleId;
  label: string;
  description: string;
  canWrite: boolean;
}

export type CapabilityId =
  | "interview"
  | "seed"
  | "talk"
  | "design"
  | "outline"
  | "draft"
  | "review"
  | "recap"
  | "deeper-needs"
  | "show"
  | "fivewhy"
  | "logline"
  | "but-therefore"
  | "hook"
  | "cool";

/**
 * 能力分两类。工作流是按阶段推进的一段活，界面按阶段挂按钮；
 * 技法是主编在对话里直接用的写作手法，有进有出，不挂按钮。
 * 类别是元数据的一部分：按钮该露哪些、清单怎么分组，都从这个字段派生，不另外手写一份名单。
 */
export type CapabilityKind = "workflow" | "technique";

/** 能力是主编的一份打包工作流。前端只拿元数据挂按钮，正文只进主编的上下文 */
export interface CapabilityInfo {
  id: CapabilityId;
  label: string;
  kind: CapabilityKind;
  description: string;
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

/**
 * 内核 / 按钮自己合成的桩（暂停、继续……）的标签；作者写的批注也挂桩但正文是作者的话，不算。
 * 这类文本只给模型看：排队条上只画标签，撤回时也不倒回输入框。
 */
export function systemStubLabel(text: string): string | null {
  const label = STUB_PATTERN.exec(text)?.[1]?.trim();
  if (!label || /^批注\d+$/.test(label)) return null;
  return label;
}

/**
 * 主编派活时给子 agent 的阶段提示（候选 / 落盘）。第一行是围栏，第二行是给模型看的提示词，之后才是任务正文。
 * 模型只看提示词 + 正文（围栏发送前剥掉）；UI 只看围栏 + 正文（提示词那一行折成一个小标签，正文照常）。
 */
export const MODE_FENCE_PATTERN = /^⟦mode:(propose|commit)⟧\r?\n?/;
/** 围栏连同紧跟的那一行提示词一起吃掉，剩下的才是要给作者看的任务正文 */
export const MODE_NOTICE_PATTERN = /^⟦mode:(propose|commit)⟧\r?\n[^\n]*\r?\n?/;

export function modePrompt(mode: AgentMode, notice: string, task: string): string {
  return `⟦mode:${mode}⟧\n${notice}\n${task}`;
}

/** 从用户消息开头摘阶段围栏；没有就返回 null */
export function takeMode(text: string): { mode: AgentMode; rest: string } | null {
  const m = MODE_NOTICE_PATTERN.exec(text);
  return m ? { mode: m[1] as AgentMode, rest: text.slice(m[0].length) } : null;
}

/** 排队里的一条：作者在 agent 跑着的时候发的话或批注。label 是界面上的短标签（排队 / 批注 N / 已插入） */
export interface QueueItem {
  id: string;
  label: string;
  text: string;
  /** 已经插进当前这轮，等下一个工具边界送到；插入了就不能再撤回 */
  inserted: boolean;
}

/**
 * 作者圈出来的一段原话，排在他自己的话前面。from 是圈的谁 / 哪份材料（主编 · 你 · 正文/第一章 · 审阅 xxx）。
 * 发给模型的还是一段字符串，围栏让 UI 能拆回引用卡，也让模型一眼看出哪句是引的、哪句是作者说的。
 */
export const QUOTE_OPEN = "⟦引用 ";
export const QUOTE_CLOSE = "⟦/引用⟧";
const QUOTE_PATTERN = /^⟦引用 ([^⟧\n]{1,80})⟧\r?\n([\s\S]*?)\r?\n⟦\/引用⟧(?:\r?\n|$)/;

export function quoteBlock(from: string, text: string): string {
  return `${QUOTE_OPEN}${from}⟧\n${text.trim()}\n${QUOTE_CLOSE}`;
}

/** 从用户消息开头把引用围栏一块块摘下来，剩下的是作者自己的话 */
export function splitQuotes(text: string): { quotes: { from: string; text: string }[]; rest: string } {
  const quotes: { from: string; text: string }[] = [];
  let rest = text;
  for (;;) {
    const m = QUOTE_PATTERN.exec(rest);
    if (!m) break;
    quotes.push({ from: m[1]!.trim(), text: m[2]! });
    rest = rest.slice(m[0].length).replace(/^(?:[ \t]*\r?\n)+/, "");
  }
  return { quotes, rest };
}

/** 用户一段话拆成 parts：开头的引用各成一张卡，剩下的正文一段 */
export function userTextParts(text: string): UiPart[] {
  const { quotes, rest } = splitQuotes(text);
  const parts: UiPart[] = quotes.map((q) => ({ type: "quote", from: q.from, text: q.text }));
  if (rest.trim()) parts.push({ type: "text", text: rest });
  return parts;
}

export type UiPart =
  | { type: "text"; text: string }
  /** 作者圈的一段原话：from 是圈的谁 / 哪份材料 */
  | { type: "quote"; from: string; text: string }
  /** 内部指令的占位：只显示 label */
  | { type: "stub"; label: string }
  /** 主编派活时的阶段标记（候选 / 落盘），气泡顶部一个小标签，提示词本身不露 */
  | { type: "mode"; mode: AgentMode }
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

/** archived：这条线上的活干完了，封存只读。会话保留能回看，不能再续派；删是另一步 */
export type AgentStatus = "idle" | "running" | "done" | "error" | "archived";
/** propose：只出候选、落盘工具被剥掉、作者不直接和它说话；commit：作者已拍板，它孵化落盘，作者可以直接和它对 */
export type AgentMode = "propose" | "commit";

export interface AgentInfo {
  agentId: string;
  parentId: string | null;
  role: RoleId;
  label: string;
  /** 作者和主编都用的名字：角色名 + 序号（策划1、策划2）。uuid 只走内核与渲染层，不进模型上下文 */
  handle: string;
  task: string;
  status: AgentStatus;
  error: string | null;
  /** 模型每轮开头自报的一句「正在……」，运行中滚动显示 */
  statusText: string;
  mode: AgentMode;
}

/** spawn_agents / continue_agent 工具的 details：这张派单上每个人是谁、干到哪。渲染层靠它跳会话、显示进度 */
export interface DispatchSlot {
  agentId: string;
  role: RoleId;
  label: string;
  /** 名册与报告里露出的名字，见 AgentInfo.handle */
  handle: string;
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
  /** 模型调用出错、pi 正在自动重试：不算失败，UI 轻提示一下即可 */
  | { type: "retry"; attempt: number; maxAttempts: number; delayMs: number; errorMessage: string }
  /** 还没送到的消息：排队的等这轮跑完一并送；已插入的在当前这步工具结束后送 */
  | { type: "queue_update"; items: QueueItem[] }
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

/**
 * 提问形态：作者面对一个问题时要做的决策动作只有这五种。
 * - open：自由回答，没有候选
 * - single：挑一个，点即发
 * - multi：挑若干个，再点确定；没选的就是干净的「不要」
 * - checklist：逐条表态改 / 不改 / 没碰；没碰的是「留给主编定」，答案里单独报
 * - compare：并排读长稿，选一版
 */
export type QuestionKind = "open" | "single" | "multi" | "checklist" | "compare";

export const QUESTION_KINDS: readonly QuestionKind[] = ["open", "single", "multi", "checklist", "compare"];

export interface QuestionRequest {
  questionId: string;
  agentId: string;
  text: string;
  /** 内核补齐（见 repairAskArgs），渲染层直接按它分支，不再从 options 形状推断 */
  kind: QuestionKind;
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

/**
 * 回给模型的答案开头。界面按形态自己组句（multi 的「作者选了：A、C」、checklist 的三组表态），
 * 工具端认到这些开头就原样转交，否则一律补「作者回答：」。
 */
export const ANSWER_PREFIXES = ["作者回答：", "作者选了：", "作者逐条表态"] as const;

export function formatAnswer(answer: string): string {
  return ANSWER_PREFIXES.some((p) => answer.startsWith(p)) ? answer : `作者回答：${answer}`;
}

/** checklist 每条的表态：改 / 不改 / 没碰 */
export type ChecklistMark = "yes" | "no" | null;

/**
 * checklist 的答案：三组一组都不省，空组写「无」，条目用序号加短名引用，主编好在 say 里转述。
 * 「没表态」单独报，因为主编对「不要」和「没表态」做的事不一样：不要就丢，没表态是主编自己拿主意。
 * tail 是逃生口或输入框追加的一句补充（比如「没表态的你替我定」），换行另起：checklist 候选里不可能有
 * 换行（有换行的问题形态会变成 compare），历史展示切第一处换行一定是补充说明，不会误伤。
 */
export function formatChecklistAnswer(options: readonly QuestionOption[], marks: readonly ChecklistMark[], tail?: string): string {
  const cite = (i: number) => `第 ${i + 1} 条（${optionLabel(options[i]!)}）`;
  const group = (m: ChecklistMark) => {
    const items = options.map((_, i) => i).filter((i) => (marks[i] ?? null) === m);
    return items.length ? items.map(cite).join("、") : "无";
  };
  const body = `作者逐条表态。改：${group("yes")}；不改：${group("no")}；没表态：${group(null)}`;
  const t = tail?.trim();
  return t ? `${body}\n${t}` : body;
}

/** parseChecklistAnswer 拆出来的三组序号（0 起）与补充说明 */
export interface ParsedChecklistAnswer {
  yes: number[];
  no: number[];
  undecided: number[];
  tail: string | null;
}

/**
 * 把 checklist 答案拆回三组序号，供历史展示按条打标。只认引用 opener「第 N 条（」，
 * 候选正文里即使出现「第 N 条」字样也不会误认；序号越界由展示层按 options 长度过滤。
 * 组头对不上（手写的野句式）返回 null，展示层原样显示，不硬拆。
 */
export function parseChecklistAnswer(answer: string): ParsedChecklistAnswer | null {
  if (!answer.startsWith("作者逐条表态")) return null;
  let rest = answer.slice("作者逐条表态".length).replace(/^[。．.\s]+/, "");
  let tail: string | null = null;
  const nl = rest.indexOf("\n");
  if (nl >= 0) {
    tail = rest.slice(nl + 1).trim() || null;
    rest = rest.slice(0, nl);
  } else {
    // 旧格式兼容：换行分隔之前，逃生口的追加句以句号缀在末尾，只认这一句固定的
    const legacy = "没表态的你替我定，说清为什么。";
    if (rest.endsWith(`。${legacy}`)) {
      tail = legacy;
      rest = rest.slice(0, rest.length - legacy.length - 1);
    }
  }
  if (!/(^|[；;])\s*改\s*[:：]/.test(rest)) return null;
  const pick = (label: string): number[] => {
    const seg = rest.split(/[；;]/).find((s) => new RegExp(`^\\s*${label}\\s*[:：]`).test(s));
    if (!seg) return [];
    const out: number[] = [];
    for (const m of seg.matchAll(/第\s*(\d+)\s*条\s*[（(]/g)) {
      const i = Number(m[1]) - 1;
      if (i >= 0 && !out.includes(i)) out.push(i);
    }
    return out.sort((a, b) => a - b);
  };
  return { yes: pick("改"), no: pick("不改"), undecided: pick("没表态"), tail };
}

/** checklist 历史展示的紧凑兜底：只报序号不重复贴正文，正文由上面的选项行展示 */
export function summarizeChecklistMarks(yes: readonly number[], no: readonly number[], undecided: readonly number[]): string {
  const ref = (ids: readonly number[]) => (ids.length ? ids.map((i) => `第 ${i + 1} 条`).join("、") : "无");
  return `改：${ref(yes)}；不改：${ref(no)}；没表态：${ref(undecided)}`;
}

/** 有没有候选长到不适合用 chip 排：带 label 的、含换行的、超过 40 字的 */
export function hasLongOptions(options: readonly QuestionOption[]): boolean {
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
  | { type: "agent.mode"; agentId: string; mode: AgentMode }
  /** 子 agent 删除：会话和索引都删了，渲染层把它从名单和会话里摘掉。归档只是 agent.status 变 archived */
  | { type: "agent.retired"; agentId: string }
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
  /** 置顶：顶上来的卡，按顶的顺序 */
  "project.pins.get": { params: Record<string, never>; result: PinRef[] };
  "project.pins.set": { params: { pins: PinRef[] }; result: PinRef[] };
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
   * followUp 排队，进它的收件箱，等这一轮完全跑完一并送；steer 插话，在当前这步工具结束后就送到。空闲时两者都是直接发。
   */
  "chat.send": { params: { text: string; agentId?: string; deliverAs?: "steer" | "followUp" }; result: null };
  /** 作者点「继续」：不带任务书，只给主编一句「别再等作者点头，按上一条说的下一步直接做」，在上面的对话尾巴上接着推 */
  "chat.continue": { params: Record<string, never>; result: null };
  /** 作者点「接着上次」：上次会话被打断（重启 / 模型报错 / 被掐），让主编看最后几条说清断在哪，从那一步接着做 */
  "chat.resume": { params: Record<string, never>; result: null };
  /** 把排队里的某一条立刻插进当前这轮：作者等不了它这轮跑完 */
  "chat.insert": { params: { agentId?: string; id: string }; result: null };
  /** 把还没送到的消息全部撤回，原文交还给输入框 */
  "chat.clearQueue": { params: { agentId?: string }; result: { texts: string[] } };
  /** 这个 agent 的会话记录 jsonl 落盘路径；子 agent 只在内存、或主编还没写过第一条时返回 null */
  "chat.sessionFile": { params: { agentId?: string }; result: string | null };
  /** 立刻中止：掐断正在跑的模型调用和工具，agent 回到空闲。输入框的「停」按钮和内核关项目 / 新会话 / reset 都走这条 */
  "chat.abort": { params: { agentId?: string }; result: null };
  /** 优雅暂停：让 agent 不再开新工具，收尾总结；主编会接着用 ask_user 问作者想怎么调整 */
  "chat.pause": { params: { agentId?: string }; result: null };
  "chat.new": { params: Record<string, never>; result: null };
  /** 作者封存某位子 agent：状态变 archived，会话留着能回看，之后不能续派。在跑的不能封，主编不能封 */
  "agent.archive": { params: { agentId: string }; result: null };
  /** 作者删掉某位子 agent：删会话和索引，不可逆。在跑的不能删，主编不能删 */
  "agent.retire": { params: { agentId: string }; result: null };
  "capabilities.list": { params: Record<string, never>; result: CapabilityInfo[] };
  /** 作者点按钮进场一条能力：内核以主编身份送进正文，和主编自己 load_capability 收到的是同一份 */
  "capability.run": { params: { id: CapabilityId }; result: null };
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
  /** 删掉某个本机项目在云端的快照（按项目名找），云端本来没有也算成功；删项目时顺带调，root 必须还在磁盘上 */
  "cloud.remove": { params: { root: string }; result: null };
  /** 清空云端所有项目快照，凭据保留；返回清掉的项目数 */
  "cloud.wipe": { params: Record<string, never>; result: { removed: number } };
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
