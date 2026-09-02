import { randomUUID } from "node:crypto";
import type { ApprovalDecision, ApprovalRequest, QuestionRequest } from "../protocol.js";

export interface ApprovalOutcome {
  decision: ApprovalDecision;
  reason: string;
}

interface Pending<T> {
  resolve: (v: T) => void;
  reject: (e: Error) => void;
}

/**
 * 审批门与提问门：工具把执行挂起在这里，等 UI 回话。
 * 只管 Promise 配对，不知道 UI 长什么样。
 */
export class Gate {
  private approvals = new Map<string, Pending<ApprovalOutcome>>();
  private questions = new Map<string, Pending<string>>();

  constructor(
    private readonly emitApproval: (req: ApprovalRequest) => void,
    private readonly emitQuestion: (req: QuestionRequest) => void,
  ) {}

  requestApproval(
    req: Omit<ApprovalRequest, "approvalId">,
    signal?: AbortSignal,
  ): Promise<ApprovalOutcome> {
    const approvalId = randomUUID();
    const full: ApprovalRequest = { ...req, approvalId };
    return new Promise<ApprovalOutcome>((resolve, reject) => {
      this.approvals.set(approvalId, { resolve, reject });
      const onAbort = () => {
        this.approvals.delete(approvalId);
        reject(new Error("审批被中止"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      this.emitApproval(full);
    });
  }

  resolveApproval(approvalId: string, outcome: ApprovalOutcome): boolean {
    const p = this.approvals.get(approvalId);
    if (!p) return false;
    this.approvals.delete(approvalId);
    p.resolve(outcome);
    return true;
  }

  requestQuestion(req: Omit<QuestionRequest, "questionId">, signal?: AbortSignal): Promise<string> {
    const questionId = randomUUID();
    const full: QuestionRequest = { ...req, questionId };
    return new Promise<string>((resolve, reject) => {
      this.questions.set(questionId, { resolve, reject });
      const onAbort = () => {
        this.questions.delete(questionId);
        reject(new Error("提问被中止"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      this.emitQuestion(full);
    });
  }

  resolveQuestion(questionId: string, answer: string): boolean {
    const p = this.questions.get(questionId);
    if (!p) return false;
    this.questions.delete(questionId);
    p.resolve(answer);
    return true;
  }

  /** 会话重建 / 项目关闭时把悬着的都拒掉 */
  rejectAll(reason: string) {
    for (const p of this.approvals.values()) p.reject(new Error(reason));
    for (const p of this.questions.values()) p.reject(new Error(reason));
    this.approvals.clear();
    this.questions.clear();
  }

  get pendingCount(): number {
    return this.approvals.size + this.questions.size;
  }
}
