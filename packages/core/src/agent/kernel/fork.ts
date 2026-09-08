import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { systemStubLabel } from "../../protocol.js";
import { loadPrompt } from "../prompt-text.js";

const FORK_NOTICE = loadPrompt("kernel/fork-notice");

/**
 * fork 进场上限：分页管的是孩子事后「再查」，这里管的是进场那一下。
 * 超了只截最老的部分，截了就明说，不静默丢。
 */
export const MAX_FORK_CHARS = 60000;

interface ForkSection {
  who: string;
  text: string;
}

/**
 * 一条分支记录转讨论文本。只要人话：toolCall 图片 thinking 都不要，
 * toolResult（含机检输出、读文档的结果）整条扔掉——孩子要读自己读。
 * 系统桩（暂停 / 继续 / 别线交回的报告）是控制信号不是讨论，也剥掉；
 * 作者的批注桩（批注 N）是作者的话，留下。
 */
function entryText(entry: SessionEntry): { role: string; text: string } | null {
  if (entry.type === "compaction") {
    return entry.summary.trim() ? { role: "summary", text: entry.summary.trim() } : null;
  }
  if (entry.type !== "message") return null;
  const m = entry.message;
  if (!m || (m.role !== "user" && m.role !== "assistant")) return null;
  let text = "";
  if (typeof m.content === "string") text = m.content;
  else if (Array.isArray(m.content)) {
    text = m.content.map((p) => (p.type === "text" && typeof p.text === "string" ? p.text : "")).filter(Boolean).join("\n");
  }
  text = text.trim();
  if (!text) return null;
  if (m.role === "user" && systemStubLabel(text) !== null) return null;
  return { role: m.role, text };
}

export function forkSections(entries: SessionEntry[]): ForkSection[] {
  // 角色标定假设派单人是主编：今天只有主编能 spawn（canSpawn 只给了主编），
  // 所以分支里的 user 就是作者、assistant 就是主编。哪天放开嵌套派单，这里要跟着改。
  const out: ForkSection[] = [];
  for (const e of entries) {
    const t = entryText(e);
    if (!t) continue;
    out.push({ who: t.role === "user" ? "作者" : t.role === "assistant" ? "主编" : "小结", text: t.text });
  }
  return out;
}

/** 组装转交首条消息：围栏 + 全文 + 任务。分支里没料就原样返回任务，不包空围栏。 */
export function buildForkPrompt(entries: SessionEntry[], task: string): string {
  const sections = forkSections(entries);
  if (sections.length === 0) return task;
  let total = sections.reduce((n, s) => n + s.text.length, 0);
  let start = 0;
  while (start < sections.length && total > MAX_FORK_CHARS) {
    total -= sections[start]!.text.length;
    start++;
  }
  const kept = sections.slice(start);
  if (kept.length === 0) return task;
  const body = kept.map((s) => `【${s.who}】\n${s.text}`).join("\n\n");
  return `${FORK_NOTICE}\n\n${start > 0 ? "（更早的讨论因过长省略）\n\n" : ""}${body}\n\n———\n\n本次任务：${task}`;
}
