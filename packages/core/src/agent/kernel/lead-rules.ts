import { LEAD_ID, type LiveAgent } from "./types.js";

/** 悬空问句挂卡用的问题原文：取正文尾句，只蹭掉问号后面的收尾引号括号与 Markdown 符号。候选都在上面的正文里，卡上留可辨认的一句即可。 */
export function extractDanglingQuestion(tail: string | undefined): string {
  if (!tail) return "";
  return tail.replace(/[\s*_~`」』）)\]】"”'’]*$/, "").trim();
}

/** 正文收尾是不是一个问句：最后一个非空白字符是问号，允许后面跟着收尾的引号、括号、Markdown 强调符 */
export function endsWithQuestion(tail: string | undefined): boolean {
  if (!tail) return false;
  return /[？?][\s*_~`」』）)\]】"”'’]*$/.test(tail);
}

type NudgeLive = Pick<LiveAgent, "info" | "asked" | "spoke" | "tail" | "hold" | "inbox">;

/**
 * 轮末只剩这一件事要管：主编把问题写在了正文结尾，却没调 ask_user。
 *
 * 作者面前没有问题卡，他看到的是「你说完就停了」，只能干等——这不是循环停了，
 * 是问题没被问出来。内核不叫模型回来重问（多空转一轮），直接把尾句挂成开放问题卡，
 * 答案当普通 followUp 喂回去：悬空在结构上不可能发生。
 *
 * 循环本身不靠内核推。做完一件接着取下一件是主编自己的事（见 director.md「一轮做到停不下来为止」），
 * 该停的四种情况——问题门、审批门、暂停、等人交回——要么把这一轮挂住了，要么它自己查得到
 * （list_agents）。内核在轮末补一句「继续」，既是在冒充作者说话，也是拿油门盖住它判断上的缺口。
 *
 * 这里的四个前提和「不该补」是同一批：作者按了暂停、这轮报错、有子 agent 在跑、
 * 收件箱里有作者的话等着（那就送话，不用补）。
 */
export function hasDanglingQuestion(live: NudgeLive, childrenRunning = false): boolean {
  if (live.info.agentId !== LEAD_ID) return false;
  if (childrenRunning) return false;
  if (live.info.status === "error") return false;
  if (live.hold) return false;
  if (live.inbox.length > 0) return false;
  return live.spoke === true && live.asked !== true && endsWithQuestion(live.tail);
}
