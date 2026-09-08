import { frontmatterProblem } from "../../../project/frontmatter.js";
import { LEAD_ID } from "../types.js";
import type { HandlerMap, KernelApi } from "./shared.js";

export function approvalHandlers(api: KernelApi): Pick<HandlerMap, "approval.reply" | "question.reply"> {
  return {
    "approval.reply": async ({ approvalId, decision, reason, content }) => {
      api.authorActed(api.agents.get(LEAD_ID));
      // 作者自己改过的那份先验 frontmatter：写坏了就当场抛回 UI，审批还挂在门上，作者能接着修再批。
      // 放过去等落盘时才炸，错会落到 agent 头上，而作者那边审批已经消失、改的东西也找不回来了。
      if (content !== undefined) {
        const problem = frontmatterProblem(content);
        if (problem) throw new Error(problem);
      }
      if (!api.gate.resolveApproval(approvalId, { decision, reason: reason ?? "", ...(content === undefined ? {} : { content }) })) {
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
