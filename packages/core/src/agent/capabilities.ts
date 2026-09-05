import type { CapabilityId, CapabilityInfo } from "../protocol.js";
import { fill, loadPrompt } from "./prompt-text.js";

export interface CapabilityDef extends CapabilityInfo {
  /** 渲染成发给主编的用户消息 */
  render: (params: Record<string, string>) => string;
}

const p = (params: Record<string, string>, name: string) => (params[name] ?? "").trim();

export const CAPABILITIES: Record<CapabilityId, CapabilityDef> = {
  interview: {
    id: "interview",
    label: "立项访谈",
    description: "把 简介 还缺的段聊清楚：从故事聊起，其余顺序看对话走向。",
    params: [],
    render: () => loadPrompt("capabilities/interview"),
  },
  talk: {
    id: "talk",
    label: "聊一张卡",
    description: "和作者边聊边把一个人物 / 设定 / 线索聊清楚，拍板一项落一项。",
    params: [
      { name: "topic", label: "聊什么", placeholder: "例如：主角；或：反派公司；或：主线", required: true },
    ],
    render: (params) => fill(loadPrompt("capabilities/talk"), { topic: p(params, "topic") }),
  },
  design: {
    id: "design",
    label: "卡片设计",
    description: "派策划创作世界设定 / 人物 / 线索卡片。",
    params: [
      { name: "brief", label: "要设计什么", placeholder: "例如：主角和两个关键对手的人物卡；或：修行体系的世界设定", required: true },
    ],
    render: (params) => fill(loadPrompt("capabilities/design"), { brief: p(params, "brief") }),
  },
  outline: {
    id: "outline",
    label: "大纲编排",
    description: "派编剧编排里程碑 / 卷纲 / 章纲。",
    params: [
      { name: "scope", label: "编排范围", placeholder: "例如：全书里程碑；或：第 1 卷卷纲；或：第 1 卷第 1–5 章章纲", required: true },
    ],
    render: (params) => fill(loadPrompt("capabilities/outline"), { scope: p(params, "scope") }),
  },
  draft: {
    id: "draft",
    label: "章节写作",
    description: "派写手按章纲写一章正文。",
    params: [{ name: "chapter", label: "章号", placeholder: "例如：12", required: true }],
    render: (params) => fill(loadPrompt("capabilities/draft"), { chapter: p(params, "chapter") }),
  },
  review: {
    id: "review",
    label: "多路审稿",
    description: "多路只读评审看一章，冲突时裁决。",
    params: [{ name: "chapter", label: "章号", placeholder: "例如：12", required: true }],
    render: (params) => fill(loadPrompt("capabilities/review"), { chapter: p(params, "chapter") }),
  },
  recap: {
    id: "recap",
    label: "卷末盘点",
    description: "一卷写完，派编剧把线索推进到哪、坑填了没回写进线索卡。",
    params: [{ name: "volume", label: "哪一卷", placeholder: "例如：1", required: true }],
    render: (params) => fill(loadPrompt("capabilities/recap"), { volume: p(params, "volume") }),
  },
};

export const CAPABILITY_IDS = Object.keys(CAPABILITIES) as CapabilityId[];

export function capabilityInfos(): CapabilityInfo[] {
  return CAPABILITY_IDS.map((id) => {
    const { label, description, params } = CAPABILITIES[id];
    return { id, label, description, params };
  });
}

export function isCapabilityId(v: unknown): v is CapabilityId {
  return typeof v === "string" && v in CAPABILITIES;
}
