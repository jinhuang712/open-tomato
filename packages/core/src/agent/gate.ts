import { randomUUID } from "node:crypto";
import type { ApprovalDecision, ApprovalRequest, QuestionRequest } from "../protocol.js";

export interface ApprovalOutcome {
  decision: ApprovalDecision;
  reason: string;
}

interface Pending<T> {
  resolve: (v: T) => void;
  reject: (e: Error) => void;
  cleanup: () => void;
}

export interface GateSink {
  approvalRequested: (req: ApprovalRequest) => void;
  /** 审批不再悬着（用户答了 / 被中止 / 会话重建），UI 据此撤掉 dock */
  approvalClosed: (approvalId: string, decision: ApprovalDecision) => void;
  questionRequested: (req: QuestionRequest) => void;
  questionClosed: (questionId: string) => void;
}

/**
 * 审批门与提问门：工具把执行挂起在这里，等 UI 回话。
 * 只管 Promise 配对，不知道 UI 长什么样。
 * 任何一条从「悬着」变成「不悬着」都会通知 sink，包括被中止的——UI 上不能留幽灵 dock。
 */
export class Gate {
  private approvals = new Map<string, Pending<ApprovalOutcome>>();
  private questions = new Map<string, Pending<string>>();

  constructor(private readonly sink: GateSink) {}

  requestApproval(req: Omit<ApprovalRequest, "approvalId">, signal?: AbortSignal): Promise<ApprovalOutcome> {
    const approvalId = randomUUID();
    return new Promise<ApprovalOutcome>((resolve, reject) => {
      const onAbort = () => this.closeApproval(approvalId, "reject", new Error("审批被中止"));
      signal?.addEventListener("abort", onAbort, { once: true });
      this.approvals.set(approvalId, { resolve, reject, cleanup: () => signal?.removeEventListener("abort", onAbort) });
      this.sink.approvalRequested({ ...req, approvalId });
    });
  }

  resolveApproval(approvalId: string, outcome: ApprovalOutcome): boolean {
    return this.closeApproval(approvalId, outcome.decision, outcome);
  }

  requestQuestion(req: Omit<QuestionRequest, "questionId">, signal?: AbortSignal): Promise<string> {
    const questionId = randomUUID();
    return new Promise<string>((resolve, reject) => {
      const onAbort = () => this.closeQuestion(questionId, new Error("提问被中止"));
      signal?.addEventListener("abort", onAbort, { once: true });
      this.questions.set(questionId, { resolve, reject, cleanup: () => signal?.removeEventListener("abort", onAbort) });
      this.sink.questionRequested({ ...req, questionId });
    });
  }

  resolveQuestion(questionId: string, answer: string): boolean {
    return this.closeQuestion(questionId, answer);
  }

  /** 会话重建 / 项目关闭时把悬着的都拒掉 */
  rejectAll(reason: string) {
    for (const id of [...this.approvals.keys()]) this.closeApproval(id, "reject", new Error(reason));
    for (const id of [...this.questions.keys()]) this.closeQuestion(id, new Error(reason));
  }

  get pendingCount(): number {
    return this.approvals.size + this.questions.size;
  }

  private closeApproval(approvalId: string, decision: ApprovalDecision, result: ApprovalOutcome | Error): boolean {
    const p = this.approvals.get(approvalId);
    if (!p) return false;
    this.approvals.delete(approvalId);
    p.cleanup();
    if (result instanceof Error) p.reject(result);
    else p.resolve(result);
    this.sink.approvalClosed(approvalId, decision);
    return true;
  }

  private closeQuestion(questionId: string, result: string | Error): boolean {
    const p = this.questions.get(questionId);
    if (!p) return false;
    this.questions.delete(questionId);
    p.cleanup();
    if (result instanceof Error) p.reject(result);
    else p.resolve(result);
    this.sink.questionClosed(questionId);
    return true;
  }
}
