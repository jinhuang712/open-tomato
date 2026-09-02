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
    description: "补齐书名、一句话故事、题材平台、读者画像等立项答案，落进 守则/立项。",
    params: [],
    render: () =>
      `请做立项访谈。先读 守则/立项 看哪些还是「待填」，按顺序用 ask_user 逐个问我：书名 → 一句话故事 → 题材与平台 → 读者画像 → 主角优势 → 总规模 → 人称与视角。每问一个就把答案写进 守则/立项 对应段落（走审批）。我在回答里提到“绝不 / 不能”的记进 守则/铁律，提到“尽量 / 喜欢”的记进 守则/偏好。全部问完给我一份立项简报摘要。`,
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

要求：先让设定师给 2–4 个差异明显的候选方向（不落盘），你汇总后用 ask_user 让我选；我选定后再派设定师落成卡片。落卡后 run_check 一次。`,
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

要求：结构师动笔前读 守则/立项、里程碑、相关线索卡和人物卡。编排里程碑或卷纲时先给我候选结构让我选；编排章纲直接落盘走审批。结束后 run_check，把 error 修掉再向我汇报。`,
  },
  draft: {
    id: "draft",
    label: "章节写作",
    description: "派执笔按章纲写一章正文。",
    params: [{ name: "chapter", label: "章号", placeholder: "例如：12", required: true }],
    render: (params) =>
      `请写第 ${p(params, "chapter")} 章正文。

步骤：先确认章纲 章纲/${p(params, "chapter")} 存在且没有「待填」，不存在就先告诉我；然后派执笔写，执笔只读本章章纲、前一章末尾、在场人物语音签名、守则/文风、守则/铁律。执笔落盘走审批后，向我汇报字数和执行时对章纲的偏离（如有）。`,
  },
  review: {
    id: "review",
    label: "多路审稿",
    description: "四路只读评审并行看一章，冲突时裁决。",
    params: [{ name: "chapter", label: "章号", placeholder: "例如：12", required: true }],
    render: (params) =>
      `请审第 ${p(params, "chapter")} 章正文（正文/${p(params, "chapter")}）。

用一次 spawn_agents 同时派 critic_market、critic_reader、critic_voice、continuity 四个角色，任务书都指向这一章。四路都回来后：
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
