import type { createAgentSession, SessionManager, ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { AgentInfo } from "../../protocol.js";
import type { SpawnMode } from "../tools/index.js";

export type AgentSession = Awaited<ReturnType<typeof createAgentSession>>["session"];
export type SessionEvent = Parameters<Parameters<AgentSession["subscribe"]>[0]>[0];

/** Kernel 建会话时交给工厂的全部材料；模型由工厂自己决定，Kernel 不预设 */
export interface SessionFactoryArgs {
  cwd: string;
  agentDir: string;
  systemPrompt: string;
  tools: ToolDefinition[];
  sessionManager: SessionManager;
}

/**
 * 会话工厂：默认用 pi 的 createAgentSession 挂真模型；测试换成假会话。
 * ready() 说现在能不能建：默认工厂看有没有选中模型，没有就先不建主编，项目照常能开能看；假工厂永远能。
 */
export interface SessionFactory {
  ready(): boolean;
  create(args: SessionFactoryArgs): Promise<AgentSession>;
}

export const LEAD_ID = "director";

export interface LiveAgent {
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
  /** 这一轮里调过 ask_user，等待作者也是合法收尾 */
  asked: boolean;
  /** 本轮有状态行之外的正文出去了：那就是对作者说的话，可自然收尾 */
  spoke?: boolean;
  /** 本轮正文的最后几十个字：轮末看结尾是不是一个没配 ask_user 的问句 */
  tail?: string;
  /** 这轮已补过可见回应提示；一次作者发言只补一次 */
  nudged: boolean;
  /** 这轮模型调用报的错，先攥着：pi 可能自动重试，等 agent_end 看 willRetry 再决定要不要标成 error */
  pendingError: string | null;
}

export interface InboxEntry {
  id: string;
  label: string;
  text: string;
  /** 这条是子 agent 的报告（值是唯一报告编号） */
  report?: string;
}
