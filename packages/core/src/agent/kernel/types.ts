import type { createAgentSession } from "@earendil-works/pi-coding-agent";
import type { AgentInfo } from "../../protocol.js";
import type { SpawnMode } from "../tools/index.js";

export type AgentSession = Awaited<ReturnType<typeof createAgentSession>>["session"];
export type SessionEvent = Parameters<Parameters<AgentSession["subscribe"]>[0]>[0];

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
  /** 这一轮里调过 ask_user：主编只有问作者才算合法收尾 */
  asked: boolean;
  /** 这轮是补过的：主编没问就停时内核补一句让它接着干，一次作者发言只补一次，别循环 */
  nudged: boolean;
  /** 这轮模型调用报的错，先攥着：pi 可能自动重试，等 agent_end 看 willRetry 再决定要不要标成 error */
  pendingError: string | null;
}

export interface InboxEntry {
  id: string;
  label: string;
  text: string;
}
