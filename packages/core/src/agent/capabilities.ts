import type { CapabilityId, CapabilityInfo } from "../protocol.js";
import { loadPrompt } from "./prompt-text.js";

/**
 * 能力是主编的一份打包工作流：目标、交付物、边界，不写步骤。
 * 作者与主编共用同一份说明，如何开展由对话、材料与授权决定。
 */
export interface CapabilityDef extends CapabilityInfo {
  /** 工作流是按阶段推进的一段活；技法是主编在对话里直接用的写作手法，有进有出，不挂界面按钮 */
  kind: "workflow" | "technique";
  /** 什么时候该想到它：给主编的清单看，也给按钮的说明 */
  when: string;
  /** 加载正文：进主编的上下文 */
  load: () => string;
}

export const CAPABILITIES: Record<CapabilityId, CapabilityDef> = {
  interview: {
    id: "interview",
    label: "立项访谈",
    kind: "workflow",
    description: "和作者弄清这本书是什么、给谁看，简介顺手落下。",
    when: "简介还缺故事或读者段；作者刚开一本新书",
    load: () => loadPrompt("capabilities/interview"),
  },
  seed: {
    id: "seed",
    label: "种子重建",
    kind: "workflow",
    description: "作者带着故事种子或现成材料开新书，逐块思考后交作者判断，重写再落盘，不照搬。",
    when: "作者贴来一份导出过的故事种子，或别处写好的设定 / 大纲",
    load: () => loadPrompt("capabilities/seed"),
  },
  talk: {
    id: "talk",
    label: "聊一张卡",
    kind: "workflow",
    description: "和作者探索人物 / 设定 / 线索，记录已认可且获准写入的内容。",
    when: "某张卡关键段空着，派策划前作者想先自己想清楚",
    load: () => loadPrompt("capabilities/talk"),
  },
  design: {
    id: "design",
    label: "卡片设计",
    kind: "workflow",
    description: "派策划创作世界设定 / 人物 / 线索卡片。",
    when: "故事需要的人物 / 设定 / 线索还没有卡，或大纲提到了没卡的人",
    load: () => loadPrompt("capabilities/design"),
  },
  outline: {
    id: "outline",
    label: "大纲编排",
    kind: "workflow",
    description: "派编剧编排里程碑 / 卷纲 / 章纲。",
    when: "卡够了还没排纲；章纲快写完了要往后排",
    load: () => loadPrompt("capabilities/outline"),
  },
  draft: {
    id: "draft",
    label: "章节写作",
    kind: "workflow",
    description: "派写手按章纲写一章正文。",
    when: "有章纲还没写的章",
    load: () => loadPrompt("capabilities/draft"),
  },
  review: {
    id: "review",
    label: "多路审稿",
    kind: "workflow",
    description: "多路只读评审看一章，冲突时裁决。",
    when: "一章刚落盘还没审",
    load: () => loadPrompt("capabilities/review"),
  },
  recap: {
    id: "recap",
    label: "卷末盘点",
    kind: "workflow",
    description: "一卷写完，派编剧把线索推进到哪、坑填了没回写进线索卡。",
    when: "一卷的最后一章刚写完",
    load: () => loadPrompt("capabilities/recap"),
  },
  "deeper-needs": {
    id: "deeper-needs",
    label: "深层需要",
    kind: "technique",
    description: "把他想要的和缺的分开，人物扁、行为全靠剧情推着走时用。",
    when: "人物扁、行为全靠剧情推着走；人物卡内在与欲望段空着或立不住",
    load: () => loadPrompt("capabilities/deeper-needs"),
  },
  show: {
    id: "show",
    label: "演出来",
    kind: "technique",
    description: "把一句判断改成动作和细节，改一处教会一次，不包整章。",
    when: "审稿报太满 / 说教旁白、改一句就能活时；作者觉得干却说不出怎么改时",
    load: () => loadPrompt("capabilities/show"),
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

/** 给主编看的清单：一行一项，分工作流 / 技法两组，进系统提示和 load_capability 的参数说明 */
export function capabilityRoster(): string {
  const line = (id: CapabilityId) => {
    const c = CAPABILITIES[id];
    return `- ${id}（${c.label}）：${c.description} 时机：${c.when}`;
  };
  const group = (kind: CapabilityDef["kind"]) => CAPABILITY_IDS.filter((id) => CAPABILITIES[id].kind === kind).map(line).join("\n");
  return `工作流：\n${group("workflow")}\n技法：\n${group("technique")}`;
}

/** 主编进场一条能力时收到的正文：谁触发的写清，正文照原样给 */
export function capabilityEntry(id: CapabilityId, by: "author" | "lead"): string {
  const c = CAPABILITIES[id];
  const head = by === "author" ? `作者点了「${c.label}」。` : `你进入「${c.label}」。`;
  return `${head}\n\n${c.load()}`;
}
