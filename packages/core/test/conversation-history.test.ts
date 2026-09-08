import { describe, expect, test } from "bun:test";
import { SessionManager, type SessionEntry } from "@earendil-works/pi-coding-agent";
import { historyPage } from "../src/agent/tools/conversation-history.js";

function entry(id: string, content: string): SessionEntry {
  return { type: "message", id, parentId: null, timestamp: "2026-09-08T00:00:00Z", message: { role: "user", content, timestamp: 0 } };
}

describe("conversation_history", () => {
  test("长消息含 emoji 可以无损分页，正文始终有界", () => {
    const original = "a".repeat(7999) + "😀" + "后半段".repeat(5000);
    const entries = [entry("long", original), entry("next", "下一条")];
    let cursor: string | undefined;
    let restored = "";
    do {
      const page = historyPage(entries, { cursor });
      expect(page.items.reduce((n, r) => n + r.content.length, 0)).toBeLessThanOrEqual(8000);
      restored += page.items.filter((r) => r.message_id === "long").map((r) => r.content).join("");
      cursor = page.next_cursor ?? undefined;
    } while (cursor);
    expect(restored).toBe(original);
  });

  test("续读不包含查询开始后追加的记录；限制条数不能绕过", () => {
    const entries = [entry("1", "一"), entry("2", "二")];
    const page = historyPage(entries, { limit: 1 });
    entries.push(entry("3", "查询结果"));
    const next = historyPage(entries, { cursor: page.next_cursor!, limit: 1 });
    expect(next.items.map((r) => r.message_id)).toEqual(["2"]);
    expect(next.has_more).toBe(false);
    for (const limit of [0, 21, Infinity, 1.5]) expect(() => historyPage(entries, { limit })).toThrow();
  });

  test("搜索检查完整正文，支持按 ID 展开，拒绝改变筛选的游标", () => {
    const entries = [entry("1", "x".repeat(9000) + "结局"), entry("2", "其他")];
    const first = historyPage(entries, { query: "结局" });
    expect(first.items[0]!.message_id).toBe("1");
    const tail = historyPage(entries, { query: "结局", cursor: first.next_cursor! });
    expect(tail.items[0]!.content).toContain("结局");
    expect(historyPage(entries, { message_id: "2" }).items[0]!.content).toBe("其他");
    expect(historyPage(entries, { query: "不存在" }).has_more).toBe(false);
    expect(() => historyPage(entries, { query: "其他", cursor: first.next_cursor! })).toThrow();
    expect(() => historyPage(entries, { cursor: "bad" })).toThrow();
  });

  test("Pi 压缩后仍从原始分支读回旧消息，不更改上下文", () => {
    const manager = SessionManager.inMemory();
    const old = manager.appendMessage({ role: "user", content: "旧决定原文", timestamp: 0 });
    const recent = manager.appendMessage({ role: "user", content: "近期对话", timestamp: 1 });
    manager.appendCompaction("历史摘要", recent, 10000);
    const before = manager.buildSessionContext();
    expect(JSON.stringify(before.messages)).not.toContain("旧决定原文");
    expect(historyPage(manager.getBranch(), { message_id: old }).items[0]!.content).toBe("旧决定原文");
    expect(manager.buildSessionContext()).toEqual(before);
  });
});
