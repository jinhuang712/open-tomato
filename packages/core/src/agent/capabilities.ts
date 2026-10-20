import type { CapabilityId, CapabilityInfo, CapabilityKind } from "../protocol.js";
import { loadPrompt } from "./prompt-text.js";
import { STANDARDS, type StandardId } from "./standards.js";

/**
 * 每项能力是一类工作的说明：写清目标、要交出什么、有哪些限制，不规定步骤。
 * 作者与主编共用同一份说明，具体怎么做，要看对话、材料和已有授权。
 */
export interface CapabilityDef extends CapabilityInfo {
  /** 什么时候该想到它：给主编的清单看，也给按钮的说明 */
  when: string;
  /** 加载正文：进主编的上下文 */
  load: () => string;
  /** 技法修的是哪条标准：审稿意见标了这条标准，就想到这条技法 */
  standard?: StandardId;
}

export const CAPABILITIES: Record<CapabilityId, CapabilityDef> = {
  interview: {
    id: "interview",
    label: "立项访谈",
    kind: "workflow",
    description: "和作者聊清这本书讲什么、给谁看，再记进简介。",
    when: "简介还缺故事或读者段；作者刚开一本新书",
    load: () => loadPrompt("capabilities/interview"),
  },
  seed: {
    id: "seed",
    label: "种子重建",
    kind: "workflow",
    description: "作者带着故事种子或现成材料开新书，逐部分分析后交作者判断，再重写保存，不照搬。",
    when: "作者贴来一份导出过的故事种子，或别处写好的设定 / 大纲",
    load: () => loadPrompt("capabilities/seed"),
  },
  talk: {
    id: "talk",
    label: "聊一张卡",
    kind: "workflow",
    description: "和作者聊人物 / 设定 / 线索，只记录作者认可并允许写入的内容。",
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
    when: "卡片够了但还没排大纲；现有章纲快用完了，需要往后排",
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
    description: "让几位评审分别看一章，只评不改；意见冲突时交给裁决。",
    when: "一章刚落盘，还没审稿",
    load: () => loadPrompt("capabilities/review"),
  },
  recap: {
    id: "recap",
    label: "卷末盘点",
    kind: "workflow",
    description: "一卷写完，派编剧把线索进展和伏笔是否兑现记回线索卡。",
    when: "一卷的最后一章刚写完",
    load: () => loadPrompt("capabilities/recap"),
  },
  pitch: {
    id: "pitch",
    label: "包装",
    kind: "workflow",
    description: "和作者定书名和文案：读者在书架上最先看到的那几行。",
    when: "简介的故事和读者画像定了，书名或文案还空着；准备上架发书之前",
    load: () => loadPrompt("capabilities/pitch"),
  },
  "deeper-needs": {
    id: "deeper-needs",
    label: "深层需要",
    kind: "technique",
    description: "分清人物想要什么、内心缺什么，人物单薄或行为全靠剧情推动时用。",
    when: "人物单薄、行为全靠剧情推动；人物卡「内在与欲望」段空着或缺乏说服力",
    load: () => loadPrompt("capabilities/deeper-needs"),
    standard: "motive",
  },
  show: {
    id: "show",
    label: "演出来",
    kind: "technique",
    description: "把一句判断改成动作和细节，用一处示范讲清改法，不重写整章。",
    when: "审稿指出信息太满 / 旁白说教，改一句就能改善时；作者觉得干却说不出怎么改时",
    load: () => loadPrompt("capabilities/show"),
    standard: "show",
  },
  fivewhy: {
    id: "fivewhy",
    label: "追问五次",
    kind: "technique",
    description: "动机模糊时连续追问为什么，理清因果后记进卡片。",
    when: "人物要什么说不清、有结果没原因；设定有个结论没来由",
    load: () => loadPrompt("capabilities/fivewhy"),
    standard: "motive",
  },
  logline: {
    id: "logline",
    label: "一句话故事",
    kind: "technique",
    description: "用一句话说清谁要什么、什么挡着他，设定多但没事发生时用。",
    when: "设定写了很多但没一件事发生；访谈结束、开始建卡之前",
    load: () => loadPrompt("capabilities/logline"),
    standard: "story",
  },
  "but-therefore": {
    id: "but-therefore",
    label: "但是因此",
    kind: "technique",
    description: "相邻两件事必须用但是 / 因此连上，章纲是流水账时用。",
    when: "章纲是流水账、审稿指出没有事发生时",
    load: () => loadPrompt("capabilities/but-therefore"),
    standard: "scene",
  },
  hook: {
    id: "hook",
    label: "钩子断章",
    kind: "technique",
    description: "章首让读者有所期待，章末留下问题或危机，一次只改一章。",
    when: "开篇留不住、章末只是停了；黄金开头要磨时",
    load: () => loadPrompt("capabilities/hook"),
    standard: "hook",
  },
  cool: {
    id: "cool",
    label: "爽点节拍",
    kind: "technique",
    description: "捋清压制多久、何处释放，连续憋屈没出口时用。",
    when: "连续几章憋屈没释放；爽了但读者没感觉时",
    load: () => loadPrompt("capabilities/cool"),
    standard: "beat",
  },
};

export const CAPABILITY_IDS = Object.keys(CAPABILITIES) as CapabilityId[];

export function capabilityInfos(): CapabilityInfo[] {
  return CAPABILITY_IDS.map((id) => {
    const { label, kind, description } = CAPABILITIES[id];
    return { id, label, kind, description };
  });
}

/** 某一类能力的 id，按登记顺序。按钮清单和主编清单的分组都从这里来，不另外手写名单 */
export function capabilityIdsOf(kind: CapabilityKind): CapabilityId[] {
  return CAPABILITY_IDS.filter((id) => CAPABILITIES[id].kind === kind);
}

export function isCapabilityId(v: unknown): v is CapabilityId {
  return typeof v === "string" && v in CAPABILITIES;
}

/** 给主编看的清单：一行一项，分工作流 / 技法两组，进系统提示和 load_capability 的参数说明 */
export function capabilityRoster(): string {
  const line = (id: CapabilityId) => {
    const c = CAPABILITIES[id];
    const fixes = c.standard ? ` 对应标准：${STANDARDS[c.standard].label}` : "";
    return `- ${id}（${c.label}）：${c.description} 时机：${c.when}${fixes}`;
  };
  const group = (kind: CapabilityKind) => capabilityIdsOf(kind).map(line).join("\n");
  return `工作流：\n${group("workflow")}\n技法：\n${group("technique")}`;
}

/** 主编加载一项能力时收到的正文：说明由谁发起，正文原样提供 */
export function capabilityEntry(id: CapabilityId, by: "author" | "lead"): string {
  const c = CAPABILITIES[id];
  const head = by === "author" ? `作者点了「${c.label}」。` : `你加载了「${c.label}」。`;
  return `${head}\n\n${c.load()}`;
}
