import { loadPrompt } from "../prompt-text.js";
import { LEAD_ID, type LiveAgent } from "./types.js";

/** 主编没有可见回应就停了：补一次提示，已有回应可自然结束 */
export const NUDGE_PROMPT = loadPrompt("kernel/nudge");

/**
 * 主编这一轮该不该补一句：一个字没说也没调 ask_user、不是出错或暂停、收件箱里也没有作者的话等着（有就送作者的话，不用补）。
 * 有子 agent 在跑时，静静停下等报告是合法的，报告到了会自己把它叫起来。
 * 每次作者发言或报告送达只补一次，补完再停就真停，交给作者。
 */
export function shouldNudge(live: Pick<LiveAgent, "info" | "asked" | "spoke" | "nudged" | "hold" | "inbox">, childrenRunning = false): boolean {
  if (live.info.agentId !== LEAD_ID) return false;
  if (childrenRunning) return false;
  if (live.info.status === "error") return false;
  if (live.spoke || live.asked || live.nudged || live.hold) return false;
  return live.inbox.length === 0;
}
