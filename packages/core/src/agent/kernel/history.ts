import { randomUUID } from "node:crypto";
import type { UiMessage, UiPart } from "../../protocol.js";
import { STUB_PATTERN } from "../../protocol.js";
import { STATUS_LINE_PATTERN } from "../roles.js";

export interface RawMessage {
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

export function contentText(result: unknown): string {
  const content = (result as { content?: unknown } | undefined)?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((c: { type?: string; text?: string }) => (c.type === "text" ? c.text ?? "" : c.type === "image" ? "[图片]" : ""))
    .join("");
}

export function normalizeMessage(raw: unknown, id?: string): UiMessage | null {
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

export function lastAssistantText(raws: unknown[]): string {
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
