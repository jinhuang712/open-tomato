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
    description: "把 简介 里还是「待填」的段落聊清楚：从故事聊起，其余顺序看对话走向。",
    params: [],
    render: () =>
      `请做立项访谈。目标：把 简介 里还是「待填」的段落聊清楚，聊不清的标「待定」。

- 先读 简介 看哪些已经填了。我已经说过的信息直接确认，不要再问一遍
- 一句话故事先于其他一切：先让我说这本书大概讲什么，可以很模糊，你听完复述成一句话让我确认或改
- 其余几项（题材与平台 / 读者画像 / 主角优势 / 总规模 / 人称与视角 / 书名）的顺序你按对话走向定；书名等故事和读者清楚了再定，给 3 个风格不同的备选让我挑，我也可以说先待定
- 每次提问都根据我前面说的故事替我给出 2–4 个贴合的候选，不要给泛泛的例子
- 我一段话里带出多项信息时，合在一起确认，不必逐项拆问
- 每确认一项就写进 简介 对应段落（走审批）。我提到“绝不 / 不能”的写成一条 守则（level=必须），提到“尽量 / 喜欢”的也写成一条（level=尽量）
- 全部聊完给我一份简介摘要，然后不要停：紧接着用 ask_user 问我下一步先设哪批卡（按这个故事替我排好优先级），我选了你就直接派设定师开始`,
  },
  design: {
    id: "design",
    label: "卡片设计",
    description: "派设定师创作世界设定 / 人物 / 线索卡片。",
    params: [
      { name: "brief", label: "要设计什么", placeholder: "例如：主角和两个关键对手的人物卡；或：修行体系的世界设定", required: true },
    ],
    render: (params) =>
      `请派设定师设计：${p(params, "brief")}。

要求：方向还没定就先让设定师出候选，我挑了再让它落卡；我已经说清要什么就直接落。落卡后 run_check 一次。`,
  },
  outline: {
    id: "outline",
    label: "大纲编排",
    description: "派结构师编排里程碑 / 卷纲 / 章纲。",
    params: [
      { name: "scope", label: "编排范围", placeholder: "例如：全书里程碑；或：第 1 卷卷纲；或：第 1 卷第 1–5 章章纲", required: true },
    ],
    render: (params) =>
      `请派结构师编排：${p(params, "scope")}。

要求：结构师动笔前读 简介、守则、里程碑、相关线索卡和人物卡。编排里程碑或卷纲时第一轮 mode=propose 先给我候选结构让我选，选定后 continue_agent、mode=commit 让同一个结构师落盘；编排章纲直接 mode=commit 落盘走审批。结束后 run_check，把 error 修掉再向我汇报。`,
  },
  draft: {
    id: "draft",
    label: "章节写作",
    description: "派执笔按章纲写一章正文。",
    params: [{ name: "chapter", label: "章号", placeholder: "例如：12", required: true }],
    render: (params) =>
      `请写第 ${p(params, "chapter")} 章正文。

步骤：先确认章纲 章纲/${p(params, "chapter")} 存在且没有「待填」，不存在就先告诉我；然后派执笔写，执笔只读本章章纲、前一章末尾、在场人物语音签名、全部守则。执笔落盘走审批后，向我汇报字数和执行时对章纲的偏离（如有）。`,
  },
  review: {
    id: "review",
    label: "多路审稿",
    description: "多路只读评审看一章，冲突时裁决。",
    params: [{ name: "chapter", label: "章号", placeholder: "例如：12", required: true }],
    render: (params) =>
      `请审第 ${p(params, "chapter")} 章正文（正文/${p(params, "chapter")}）。

按这一章的情况决定派哪几路评审（市场 / 读者 / 语音 / 一致性），一次 spawn_agents 并行派出，任务书都指向这一章。评审都回来后：
1. 合并成一份问题清单，按「必须改 / 建议看」分级，去重
2. 意见冲突的点派 arbiter 裁决
3. 给我结论 + 清单，然后用 ask_user 问我要返修哪些（可多选），不要自动开始返修`,
  },
  check: {
    id: "check",
    label: "一致性机检",
    description: "跑机械对账，报缺字段、断链、断档。",
    params: [],
    render: () => `请 run_check 跑一次一致性机检，把结果按 error / warning 分组汇报给我，并对每条 error 给出修法。先不要动手改，等我确认。`,
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
