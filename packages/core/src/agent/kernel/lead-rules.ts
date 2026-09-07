import { loadPrompt } from "../prompt-text.js";
import { LEAD_ID, type LiveAgent } from "./types.js";

/** 一个字没说也没动手：这一轮空转了，提醒它回应作者 */
export const NUDGE_PROMPT = loadPrompt("kernel/nudge");
/** 主编在正文结尾问了作者却没调 ask_user：作者面前没有问题卡，补一次提示让它把问题问出来 */
export const DANGLING_QUESTION_PROMPT = loadPrompt("kernel/nudge-dangling-question");
/** 说完了、也没要问的：循环不停，接着取下一件 */
export const NEXT_PROMPT = loadPrompt("kernel/next");

/** 连续空转几轮就不再叫：刹车在作者手上，这个上限只防模型自己转空圈 */
export const IDLE_LIMIT = 3;

/** 正文收尾是不是一个问句：最后一个非空白字符是问号，允许后面跟着收尾的引号、括号、Markdown 强调符 */
export function endsWithQuestion(tail: string | undefined): boolean {
  if (!tail) return false;
  return /[？?][\s*_~`」』）)\]】"”'’]*$/.test(tail);
}

type NudgeLive = Pick<LiveAgent, "info" | "asked" | "spoke" | "acted" | "tail" | "idleRounds" | "hold" | "inbox">;

/**
 * 主编这一轮结束后该不该接着叫它：循环由内核驱动，做完一件取下一件。
 *
 * 刹车在作者手上，而且都是挂住这一轮、根本走不到这里的那种：问题门（ask_user 在等他答）、
 * 审批门（落盘在等他点）、暂停与停止（hold）。所以轮末不因为「说过话」「问过了」「补过一次」而停——
 * 作者答完话是燃料不是刹车，说完一段话也只是说完了，账上的活还在。
 *
 * 这里只让四种情况停：作者按了暂停、这轮报错、有子 agent 在跑（等报告，报告到了会自己叫醒它）、
 * 收件箱里有作者的话等着（那就送话，不用补）。外加一条防呆：连着几轮既没说话也没动手就别再叫了。
 */
export function shouldNudge(live: NudgeLive, childrenRunning = false): boolean {
  if (live.info.agentId !== LEAD_ID) return false;
  if (childrenRunning) return false;
  if (live.info.status === "error") return false;
  if (live.hold) return false;
  if (live.idleRounds >= IDLE_LIMIT) return false;
  return live.inbox.length === 0;
}

/** 这一轮算不算空转：一个字没说，手也没动 */
export function wasIdle(live: Pick<LiveAgent, "spoke" | "acted">): boolean {
  return !live.spoke && !live.acted;
}

/** 补哪一句：问句没配问题卡的先把问题问出来，空转的提醒它回应作者，其余都是「接着取下一件」 */
export function nudgePrompt(live: Pick<LiveAgent, "spoke" | "acted" | "asked" | "tail">): string {
  if (live.spoke && !live.asked && endsWithQuestion(live.tail)) return DANGLING_QUESTION_PROMPT;
  if (wasIdle(live)) return NUDGE_PROMPT;
  return NEXT_PROMPT;
}
