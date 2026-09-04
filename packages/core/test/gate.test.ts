import { describe, expect, test } from "bun:test";
import { Gate, type GateSink } from "../src/agent/gate.js";
import type { ApprovalDecision, ApprovalRequest, QuestionRequest } from "../src/protocol.js";

const req: Omit<ApprovalRequest, "approvalId"> = {
  agentId: "director",
  toolCallId: "t1",
  kind: "world",
  docId: "sect",
  path: "世界/sect.md",
  title: "铁盟",
  isNew: false,
  before: "a\n",
  after: "b\n",
  patch: "",
};

function setup() {
  const requested: ApprovalRequest[] = [];
  const closed: Array<[string, ApprovalDecision]> = [];
  const questions: QuestionRequest[] = [];
  const questionsClosed: string[] = [];
  const sink: GateSink = {
    approvalRequested: (r) => requested.push(r),
    approvalClosed: (id, d) => closed.push([id, d]),
    questionRequested: (q) => questions.push(q),
    questionClosed: (id) => questionsClosed.push(id),
  };
  return { gate: new Gate(sink), requested, closed, questions, questionsClosed };
}

describe("Gate 审批门", () => {
  test("approve 前工具挂起，approve 后才放行", async () => {
    const { gate, requested, closed } = setup();
    let done = false;
    const p = gate.requestApproval(req).then((o) => {
      done = true;
      return o;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    expect(requested).toHaveLength(1);
    expect(gate.pendingCount).toBe(1);

    const id = requested[0]!.approvalId;
    expect(gate.resolveApproval(id, { decision: "approve", reason: "" })).toBe(true);
    expect(await p).toEqual({ decision: "approve", reason: "" });
    expect(closed).toEqual([[id, "approve"]]);
    expect(gate.pendingCount).toBe(0);
  });

  test("reject 带原因原样回给工具", async () => {
    const { gate, requested } = setup();
    const p = gate.requestApproval(req);
    gate.resolveApproval(requested[0]!.approvalId, { decision: "reject", reason: "语气不对" });
    expect(await p).toEqual({ decision: "reject", reason: "语气不对" });
  });

  test("同一个 approvalId 只能答一次，答陌生 id 返回 false", async () => {
    const { gate, requested } = setup();
    void gate.requestApproval(req);
    const id = requested[0]!.approvalId;
    expect(gate.resolveApproval(id, { decision: "approve", reason: "" })).toBe(true);
    expect(gate.resolveApproval(id, { decision: "approve", reason: "" })).toBe(false);
    expect(gate.resolveApproval("nope", { decision: "approve", reason: "" })).toBe(false);
  });

  test("abort 信号把悬着的审批拒掉并通知 UI 收 dock", async () => {
    const { gate, requested, closed } = setup();
    const ac = new AbortController();
    const p = gate.requestApproval(req, ac.signal);
    ac.abort();
    await expect(p).rejects.toThrow("审批被中止");
    expect(closed).toEqual([[requested[0]!.approvalId, "reject"]]);
    expect(gate.pendingCount).toBe(0);
  });

  test("rejectAgent 只清指定 agent 的门，别人的不动", async () => {
    const { gate, requested, closed, questions, questionsClosed } = setup();
    const aLead = gate.requestApproval(req);
    const aChild = gate.requestApproval({ ...req, agentId: "child-1" });
    const qChild = gate.requestQuestion({ agentId: "child-1", text: "哪个？", options: [], allowFreeText: true });
    const qLead = gate.requestQuestion({ agentId: "director", text: "书名？", options: [], allowFreeText: true });
    expect(gate.pendingCount).toBe(4);
    gate.rejectAgent("child-1", "子 agent 挂了");
    await expect(aChild).rejects.toThrow("子 agent 挂了");
    await expect(qChild).rejects.toThrow("子 agent 挂了");
    expect(closed).toHaveLength(1);
    expect(questionsClosed).toHaveLength(1);
    expect(gate.pendingCount).toBe(2);
    // lead 的门还能正常答
    expect(gate.resolveApproval(requested[0]!.approvalId, { decision: "approve", reason: "" })).toBe(true);
    expect(await aLead).toEqual({ decision: "approve", reason: "" });
    expect(gate.resolveQuestion(questions[1]!.questionId, "红尘")).toBe(true);
    expect(await qLead).toBe("红尘");
    expect(gate.pendingCount).toBe(0);
  });

  test("rejectAll 一次清掉所有审批和提问", async () => {
    const { gate, closed, questionsClosed } = setup();
    const a = gate.requestApproval(req);
    const q = gate.requestQuestion({ agentId: "director", text: "哪个？", options: ["甲", "乙"], allowFreeText: false });
    gate.rejectAll("会话重建");
    await expect(a).rejects.toThrow("会话重建");
    await expect(q).rejects.toThrow("会话重建");
    expect(closed).toHaveLength(1);
    expect(questionsClosed).toHaveLength(1);
    expect(gate.pendingCount).toBe(0);
  });
});

describe("Gate 提问门", () => {
  test("答案原样回给工具", async () => {
    const { gate, questions, questionsClosed } = setup();
    const p = gate.requestQuestion({ agentId: "director", text: "书名？", options: [], allowFreeText: true });
    const id = questions[0]!.questionId;
    expect(gate.resolveQuestion(id, "红尘")).toBe(true);
    expect(await p).toBe("红尘");
    expect(questionsClosed).toEqual([id]);
    expect(gate.resolveQuestion(id, "又答")).toBe(false);
  });
});
