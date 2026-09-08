import type { ApprovalRequest } from "@opentomato/core/protocol";
import { beforeEach, describe, expect, test } from "bun:test";
import { useDom } from "./dom";

useDom();
// state.ts 顺着 bridge.ts 走，那边在模块顶层就要 window.bridge，先塞一个假的
(globalThis as unknown as { window: Record<string, unknown> }).window.bridge = {
  request: async () => null,
  onEvent: () => () => {},
  onMenu: () => () => {},
  confirm: async () => true,
  copyText: async () => {},
};

const { state, setView, applyEvent } = await import("../src/renderer/state");

const request = (approvalId: string): ApprovalRequest => ({
  approvalId,
  agentId: "planner",
  toolCallId: "t1",
  kind: "characters",
  docId: "陈默",
  path: "人物/陈默.md",
  title: "陈默",
  isNew: false,
  before: "旧",
  after: "新",
  patch: "",
});

const ask = (id: string) => applyEvent({ type: "approval.requested", request: request(id) });
const settle = (id: string) => applyEvent({ type: "approval.resolved", approvalId: id, decision: "approve" });

beforeEach(() => {
  for (const a of [...state.approvals]) settle(a.approvalId);
  setView({ type: "chat", agentId: "director" });
});

describe("setView 是整块替换，不是往旧视图上糊", () => {
  test("从主会话切到审阅：不带着上一支的 agentId 走", () => {
    setView({ type: "review", approvalId: "a1" });
    expect(state.view).toEqual({ type: "review", approvalId: "a1" });
  });

  test("同一张卡去掉 focus：focus 真的没了，不是赖在那儿", () => {
    setView({ type: "doc", kind: "characters", id: "陈默", focus: "某段" });
    setView({ type: "doc", kind: "characters", id: "陈默" });
    expect(state.view).toEqual({ type: "doc", kind: "characters", id: "陈默" });
  });
});

describe("审完退回进来之前那个视图", () => {
  test("在主会话里被叫去审，审完回主会话", () => {
    ask("a1");
    expect(state.view).toEqual({ type: "review", approvalId: "a1" });
    settle("a1");
    expect(state.view).toEqual({ type: "chat", agentId: "director" });
  });

  test("正翻着一张卡被叫去审，审完回那张卡——不是一律弹回主会话", () => {
    setView({ type: "doc", kind: "threads", id: "0003" });
    ask("a1");
    expect(state.view).toEqual({ type: "review", approvalId: "a1" });
    settle("a1");
    expect(state.view).toEqual({ type: "doc", kind: "threads", id: "0003" });
  });

  test("回头路存的是快照：切进审阅不会把它一起改成审阅", () => {
    setView({ type: "doc", kind: "threads", id: "0003" });
    ask("a1");
    expect(state.reviewBack).toEqual({ type: "doc", kind: "threads", id: "0003" });
  });

  test("还有下一条就接着审，审到最后一条才退回去", () => {
    setView({ type: "doc", kind: "threads", id: "0003" });
    ask("a1");
    ask("a2");
    // 正审着 a1 时来的 a2 不抢视图
    expect(state.view).toEqual({ type: "review", approvalId: "a1" });
    settle("a1");
    expect(state.view).toEqual({ type: "review", approvalId: "a2" });
    settle("a2");
    expect(state.view).toEqual({ type: "doc", kind: "threads", id: "0003" });
  });

  test("决掉的不是正看着的那条：视图不动", () => {
    ask("a1");
    ask("a2");
    settle("a2");
    expect(state.view).toEqual({ type: "review", approvalId: "a1" });
    expect(state.approvals.map((a) => a.approvalId)).toEqual(["a1"]);
  });
});
