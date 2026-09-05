import { loadPrompt } from "../prompt-text.js";
import { LEAD_ID, type LiveAgent } from "./types.js";

/** 主编没问作者就停了：不是在等拍板，就是漏了 ask_user。补一句让它自己判断 */
export const NUDGE_PROMPT = loadPrompt("kernel/nudge");

/**
 * 主编这一轮该不该补一句：没调 ask_user、不是出错或暂停、收件箱里也没有作者的话等着（有就送作者的话，不用补）。
 * 每次作者发言只补一次，补完再停就真停，交给作者。
 */
export function shouldNudge(live: Pick<LiveAgent, "info" | "asked" | "nudged" | "hold" | "inbox">): boolean {
  if (live.info.agentId !== LEAD_ID) return false;
  if (live.info.status === "error") return false;
  if (live.asked || live.nudged || live.hold) return false;
  return live.inbox.length === 0;
}
