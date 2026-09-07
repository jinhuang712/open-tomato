import type { AgentStatus } from "@opentomato/core/protocol";

/** 子 agent 状态对应的那一个词，顶栏和历史面板共用 */
export const STATUS: Record<AgentStatus, string> = { running: "运行中", idle: "待命", done: "完成", error: "出错", archived: "已封存" };
