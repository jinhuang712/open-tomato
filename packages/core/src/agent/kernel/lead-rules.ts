import { loadPrompt } from "../prompt-text.js";
import { LEAD_ID, type LiveAgent } from "./types.js";

/** 主编没有可见回应就停了：补一次提示，已有回应可自然结束 */
export const NUDGE_PROMPT = loadPrompt("kernel/nudge");
/** 主编在正文结尾问了作者却没调 ask_user：作者面前没有问题卡，补一次提示让它把问题问出来 */
export const DANGLING_QUESTION_PROMPT = loadPrompt("kernel/nudge-dangling-question");

/** 正文收尾是不是一个问句：最后一个非空白字符是问号，允许后面跟着收尾的引号、括号、Markdown 强调符 */
export function endsWithQuestion(tail: string | undefined): boolean {
  if (!tail) return false;
  return /[？?][\s*_~`」』）)\]】"”'’]*$/.test(tail);
}

type NudgeLive = Pick<LiveAgent, "info" | "asked" | "spoke" | "tail" | "nudged" | "hold" | "inbox">;

/**
 * 主编这一轮该不该补一句：一个字没说也没调 ask_user、不是出错或暂停、收件箱里也没有作者的话等着（有就送作者的话，不用补）。
 * 说了话但结尾是个问句、又没调 ask_user，也算没收好尾：作者看到问题却没有问题卡，只能干等。
 * 有子 agent 在跑时，静静停下等报告是合法的，报告到了会自己把它叫起来。
 * 每次作者发言或报告送达只补一次，补完再停就真停，交给作者。
 */
export function shouldNudge(live: NudgeLive, childrenRunning = false): boolean {
  if (live.info.agentId !== LEAD_ID) return false;
  if (childrenRunning) return false;
  if (live.info.status === "error") return false;
  if (live.asked || live.nudged || live.hold) return false;
  if (live.spoke && !endsWithQuestion(live.tail)) return false;
  return live.inbox.length === 0;
}

/** 补哪一句：说过话（结尾是问句）用问题卡那句，一个字没说用通用那句 */
export function nudgePrompt(live: Pick<LiveAgent, "spoke">): string {
  return live.spoke ? DANGLING_QUESTION_PROMPT : NUDGE_PROMPT;
}
