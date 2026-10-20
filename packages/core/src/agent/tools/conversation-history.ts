import { text as textValue } from "../../text/load.js";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { defineTool } from "./define.js";
import { Type } from "typebox";
import { text } from "./shared.js";

const PAGE_CHARS = 8000;
const MAX_RECORDS = 20;
type Args = { query?: string; message_id?: string; cursor?: string; limit?: number };
type Cursor = { end: string; id: string; offset: number; query: string; message: string };

/** 历史是材料，不重放 thinking、图片二进制或 UI details。工具参数和结果保留可核对的文本。 */
function records(entries: SessionEntry[]) {
  return entries.flatMap((entry) => {
    if (entry.type !== "message") return [];
    const m = entry.message;
    if (m.role !== "user" && m.role !== "assistant" && m.role !== "toolResult") return [];
    const body = typeof m.content === "string" ? m.content : m.content.map((part) => {
      if (part.type === "text") return part.text;
      if (part.type === "image") return textValue("messages/session", "conversation_history.message");
      if (part.type === "toolCall") return textValue("messages/session", "conversation_history.message_2", { v0: part.name, v1: JSON.stringify(part.arguments) });
      return "";
    }).filter(Boolean).join("\n");
    return body ? [{ id: entry.id, timestamp: entry.timestamp, role: m.role, tool: m.role === "toolResult" ? m.toolName : undefined, body }] : [];
  });
}

export function historyPage(entries: SessionEntry[], args: Args) {
  const query = args.query?.trim() ?? "";
  const message = args.message_id ?? "";
  const limit = args.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RECORDS) throw new Error(textValue("messages/session", "conversation_history.message_3"));
  if (query.length > 200) throw new Error(textValue("messages/session", "conversation_history.message_4"));
  let all = records(entries);
  let cursor: Cursor | undefined;
  if (args.cursor) {
    try {
      if (args.cursor.length > 2048) throw new Error();
      cursor = JSON.parse(Buffer.from(args.cursor, "base64url").toString("utf8"));
      if (!cursor || typeof cursor.end !== "string" || typeof cursor.id !== "string" || !Number.isInteger(cursor.offset) || cursor.offset < 0 || cursor.query !== query || cursor.message !== message) throw new Error();
    } catch { throw new Error(textValue("messages/session", "conversation_history.message_5")); }
    const end = all.findIndex((r) => r.id === cursor!.end);
    if (end < 0) throw new Error(textValue("messages/session", "conversation_history.message_6"));
    all = all.slice(0, end + 1);
  }
  const end = all.at(-1)?.id ?? "";
  const selected = all.filter((r) => (!message || r.id === message) && (!query || r.body.toLocaleLowerCase().includes(query.toLocaleLowerCase())));
  let index = cursor ? selected.findIndex((r) => r.id === cursor!.id) : 0;
  if (index < 0) throw new Error(textValue("messages/session", "conversation_history.message_7"));
  let offset = cursor?.offset ?? 0;
  if (cursor && offset >= selected[index]!.body.length) throw new Error(textValue("messages/session", "conversation_history.message_8"));
  const items = [];
  let remaining = PAGE_CHARS;
  while (index < selected.length && items.length < limit && remaining > 0) {
    const r = selected[index]!;
    let stop = Math.min(r.body.length, offset + remaining);
    // 不在 UTF-16 代理对中间切开，确保分批拼接不损坏字符。
    if (stop < r.body.length && /[\uD800-\uDBFF]/.test(r.body[stop - 1]!)) stop--;
    if (stop === offset) break;
    items.push({ message_id: r.id, timestamp: r.timestamp, role: r.role, tool: r.tool, offset, total_chars: r.body.length, content: r.body.slice(offset, stop) });
    remaining -= stop - offset;
    if (stop < r.body.length) { offset = stop; break; }
    index++; offset = 0;
  }
  const next = selected[index];
  return {
    notice: textValue("messages/session", "conversation_history.notice"),
    items,
    has_more: !!next,
    next_cursor: next ? Buffer.from(JSON.stringify({ end, id: next.id, offset, query, message } satisfies Cursor)).toString("base64url") : null,
  };
}

export function makeConversationHistoryTool(history: () => SessionEntry[]) {
  return defineTool({
    name: "conversation_history",
    label: textValue("tools/conversation", "conversation_history.label"),
    description: textValue("tools/conversation", "conversation_history.description"),
    parameters: Type.Object({
      query: Type.Optional(Type.String({ maxLength: 200 })),
      message_id: Type.Optional(Type.String()),
      cursor: Type.Optional(Type.String({ maxLength: 2048 })),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_RECORDS })),
    }),
    execute: async (_id, args) => text(JSON.stringify(historyPage(history(), args))),
  });
}
