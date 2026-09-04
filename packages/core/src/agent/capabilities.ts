import type { CapabilityId, CapabilityInfo } from "../protocol.js";

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
    render: () =>
      `请做立项访谈，把 简介 还缺的必填段聊清楚。

- 先读 简介，已有的不再问
- 一句话故事先于一切。我说不清时从我读过的书挖：哪本没看完、放在哪；哪本一口气读完；哪个人物看不下去。把它们翻成一句话故事和读者画像的候选
- 先问「谁最惨、他要什么、什么挡着他」，再问世界怎么运作。我往设定里躲时拉回来
- 其余段顺序看对话走向。书名等故事和读者清楚后再定，给 3 个风格不同的备选，可以先放一放
- 聊完给我简介摘要，接着问下一步先设哪批卡，按这个故事替我排好优先级`,
  },
  talk: {
    id: "talk",
    label: "聊一张卡",
    description: "和作者边聊边把一个人物 / 设定 / 线索聊清楚，拍板一项落一项。",
    params: [
      { name: "topic", label: "聊什么", placeholder: "例如：主角；或：反派公司；或：主线", required: true },
    ],
    render: (params) =>
      `我们先聊聊：${p(params, "topic")}。

- 先 project_overview 看这张卡在不在。在就 read_doc 读一遍，定过的不再问
- 强关联的层级选择（如「哪所学校 + 什么专业」）合成一轮问
- 聊得差不多时给我这张卡的现状摘要，接着问下一步：派策划孵化完整版 / 再聊几项 / 换一张卡聊`,
  },
  design: {
    id: "design",
    label: "卡片设计",
    description: "派策划创作世界设定 / 人物 / 线索卡片。",
    params: [
      { name: "brief", label: "要设计什么", placeholder: "例如：主角和两个关键对手的人物卡；或：修行体系的世界设定", required: true },
    ],
    render: (params) =>
      `请派策划设计：${p(params, "brief")}。`,
  },
  outline: {
    id: "outline",
    label: "大纲编排",
    description: "派编剧编排里程碑 / 卷纲 / 章纲。",
    params: [
      { name: "scope", label: "编排范围", placeholder: "例如：全书里程碑；或：第 1 卷卷纲；或：第 1 卷第 1–5 章章纲", required: true },
    ],
    render: (params) =>
      `请派编剧编排：${p(params, "scope")}。

里程碑和卷纲一律先候选，我已经说了大概方向也不跳过：把我的方向和另外两种走法并排给我看，说清差在哪。章纲直接落盘走审批。`,
  },
  draft: {
    id: "draft",
    label: "章节写作",
    description: "派写手按章纲写一章正文。",
    params: [{ name: "chapter", label: "章号", placeholder: "例如：12", required: true }],
    render: (params) =>
      `请写第 ${p(params, "chapter")} 章正文。

先确认 章纲/${p(params, "chapter")} 存在且机检没报它缺段，否则先告诉我。派写手时任务书只给章号。落盘后向我汇报字数和对章纲的偏离（如有）。`,
  },
  review: {
    id: "review",
    label: "多路审稿",
    description: "多路只读评审看一章，冲突时裁决。",
    params: [{ name: "chapter", label: "章号", placeholder: "例如：12", required: true }],
    render: (params) =>
      `请审第 ${p(params, "chapter")} 章正文（正文/${p(params, "chapter")}）。

按这一章的情况决定派哪几路，一次 spawn_agents 并行派出。评审都回来后 read_review，意见冲突的点派 arbiter 裁决；给我结论和必须改的几条，然后问我要返修哪些（可多选），不要自动开始返修。返修派回原写手，任务书不复述清单。`,
  },
  recap: {
    id: "recap",
    label: "卷末盘点",
    description: "一卷写完，派编剧把线索推进到哪、坑填了没回写进线索卡。",
    params: [{ name: "volume", label: "哪一卷", placeholder: "例如：1", required: true }],
    render: (params) =>
      `请派编剧盘点第 ${p(params, "volume")} 卷。盘点完向我转述结果，然后问下一步：排下一卷卷纲 / 先补没推进的线索 / 停一下。`,
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
