import { PLACEHOLDER } from "./check.js";
import type { ProjectStore } from "./store.js";

/**
 * 立项硬门：简介 的「一句话故事」段落已经填了才算过。
 * 没有它就排大纲、写正文，产出的是一批要推翻的卡，所以用代码拦，不靠提示词。
 */
export async function hasOneLineStory(store: ProjectStore): Promise<boolean> {
  const section = await store.readSection("brief", "简介", "一句话故事");
  if (section === null) return false;
  const body = section.trim();
  return body !== "" && !body.includes(PLACEHOLDER);
}

export const ONE_LINE_STORY_GATE_MESSAGE = "简介 的「一句话故事」还是「待填」，先和作者聊清故事并落盘，再排大纲 / 写正文";
