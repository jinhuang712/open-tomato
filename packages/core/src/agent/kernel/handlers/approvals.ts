import { LEAD_ID } from "../types.js";
import type { HandlerMap, KernelApi } from "./shared.js";

export function approvalHandlers(api: KernelApi): Pick<HandlerMap, "approval.reply" | "question.reply"> {
  return {
    "approval.reply": async ({ approvalId, decision, reason }) => {
      api.authorActed(api.agents.get(LEAD_ID));
      if (!api.gate.resolveApproval(approvalId, { decision, reason: reason ?? "" })) {
        // 已经不在了（被中止 / 重复点），也让 UI 撤掉
        api.emit({ type: "approval.resolved", approvalId, decision });
      }
      return null;
    },
    "question.reply": async ({ questionId, answer }) => {
      api.authorActed(api.agents.get(LEAD_ID));
      if (!api.gate.resolveQuestion(questionId, answer)) api.emit({ type: "question.resolved", questionId });
      return null;
    },
  };
}
