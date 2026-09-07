import type { CapabilityId, CapabilityInfo } from "../protocol.js";
import { loadPrompt } from "./prompt-text.js";

/**
 * 能力是主编的一份打包工作流：目标、交付物、边界，不写步骤。
 * 三种进场方式共用同一份清单：作者点按钮、主编自己想到就做、主编想到先问作者。
 * 进场后怎么走由主编看盘面定，缺的信息从盘面读，读不到再问作者。
 */
export interface CapabilityDef extends CapabilityInfo {
  /** 什么时候该想到它：给主编的清单看，也给按钮的说明 */
  when: string;
  /** 加载正文：进主编的上下文 */
  load: () => string;
}

export const CAPABILITIES: Record<CapabilityId, CapabilityDef> = {
  interview: {
    id: "interview",
    label: "立项访谈",
    description: "和作者弄清这本书是什么、给谁看，简介顺手落下。",
    when: "简介还缺故事或读者段；作者刚开一本新书",
    load: () => loadPrompt("capabilities/interview"),
  },
  talk: {
    id: "talk",
    label: "聊一张卡",
    description: "和作者边聊边把一个人物 / 设定 / 线索聊清楚，拍板一项落一项。",
    when: "某张卡关键段空着，派策划前作者想先自己想清楚",
    load: () => loadPrompt("capabilities/talk"),
  },
  design: {
    id: "design",
    label: "卡片设计",
    description: "派策划创作世界设定 / 人物 / 线索卡片。",
    when: "故事需要的人物 / 设定 / 线索还没有卡，或大纲提到了没卡的人",
    load: () => loadPrompt("capabilities/design"),
  },
  outline: {
    id: "outline",
    label: "大纲编排",
    description: "派编剧编排里程碑 / 卷纲 / 章纲。",
    when: "卡够了还没排纲；章纲快写完了要往后排",
    load: () => loadPrompt("capabilities/outline"),
  },
  draft: {
    id: "draft",
    label: "章节写作",
    description: "派写手按章纲写一章正文。",
    when: "有章纲还没写的章",
    load: () => loadPrompt("capabilities/draft"),
  },
  review: {
    id: "review",
    label: "多路审稿",
    description: "多路只读评审看一章，冲突时裁决。",
    when: "一章刚落盘还没审",
    load: () => loadPrompt("capabilities/review"),
  },
  recap: {
    id: "recap",
    label: "卷末盘点",
    description: "一卷写完，派编剧把线索推进到哪、坑填了没回写进线索卡。",
    when: "一卷的最后一章刚写完",
    load: () => loadPrompt("capabilities/recap"),
  },
};

export const CAPABILITY_IDS = Object.keys(CAPABILITIES) as CapabilityId[];

export function capabilityInfos(): CapabilityInfo[] {
  return CAPABILITY_IDS.map((id) => {
    const { label, description } = CAPABILITIES[id];
    return { id, label, description };
  });
}

export function isCapabilityId(v: unknown): v is CapabilityId {
  return typeof v === "string" && v in CAPABILITIES;
}

/** 给主编看的清单：一行一项，进系统提示和 load_capability 的参数说明 */
export function capabilityRoster(): string {
  return CAPABILITY_IDS.map((id) => {
    const c = CAPABILITIES[id];
    return `- ${id}（${c.label}）：${c.description} 时机：${c.when}`;
  }).join("\n");
}

/** 主编进场一条能力时收到的正文：谁触发的写清，正文照原样给 */
export function capabilityEntry(id: CapabilityId, by: "author" | "lead"): string {
  const c = CAPABILITIES[id];
  const head = by === "author" ? `作者点了「${c.label}」。` : `你进入「${c.label}」。`;
  return `${head}先看盘面再开口，进场的第一句话由盘面和刚才的对话决定，不照本宣科。\n\n${c.load()}`;
}
