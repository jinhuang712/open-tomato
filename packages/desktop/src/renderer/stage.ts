import { chapterRange, type CapabilityId, type DocHeader } from "@opentomato/core/protocol";
export { chapterRange };
import { refId } from "./refid";

/** 下一步的一个候选：要么跑一条能力，要么往输入框预填一句话 */
export type StageStep =
  | { title: string; desc: string; kind: "capability"; cap: CapabilityId; params?: Record<string, string>; primary?: boolean }
  | { title: string; desc: string; kind: "say"; text: string; primary?: boolean };

export interface StagePlan {
  stage: "立项" | "设卡" | "写正文" | "审稿";
  /** 一句话现状，给人看也给模型看 */
  line: string;
  steps: StageStep[];
}

const TALK: StageStep = { title: "先聊聊我的想法", desc: "还没成形也行，主编会边聊边记", kind: "say", text: "我有个想法，先和你聊聊：" };
const ADOPT: StageStep = {
  title: "我有现成的材料",
  desc: "已有设定 / 大纲 / 旧稿，贴进来整理成卡片",
  kind: "say",
  text: "我有一些现成的材料，先贴给你，帮我整理进对应的卡片，不确定的先问我：\n\n",
};


/**
 * 里程碑达成靠推导不落盘：一卷 chapters 范围内的正文都写完了，这卷 milestones 里的里程碑就算过了。
 * 顺带算出「刚写完最后一章」的那卷，给卷末盘点当候选。
 */
export function milestoneProgress(docs: DocHeader[], written: number): { total: number; achieved: number; justFinished: DocHeader | null } {
  const milestones = docs.filter((d) => d.kind === "milestones");
  const achieved = new Set<string>();
  let justFinished: DocHeader | null = null;
  for (const v of docs.filter((d) => d.kind === "volumes")) {
    const range = chapterRange(v.extra.chapters);
    if (!range || written < range[1]) continue;
    if (written === range[1]) justFinished = v;
    const refs = Array.isArray(v.extra.milestones) ? v.extra.milestones : [];
    for (const r of refs) if (typeof r === "string") achieved.add(refId(r));
  }
  return { total: milestones.length, achieved: milestones.filter((m) => achieved.has(m.id)).length, justFinished };
}

/**
 * 按项目现状判断处在哪个阶段，把下一步做成候选。
 * 只看文档数量与编号，不调模型；空会话起手面板和快捷按钮共用这一份判断。
 */
export function stagePlan(docs: DocHeader[]): StagePlan {
  const count = (kind: string) => docs.filter((d) => d.kind === kind).length;
  const maxNo = (kind: string) =>
    docs
      .filter((d) => d.kind === kind)
      .map((d) => Number(d.id))
      .filter((n) => Number.isFinite(n))
      .reduce((a, b) => Math.max(a, b), 0);

  const cards = count("characters") + count("world") + count("threads");
  const outlines = count("milestones") + count("volumes") + count("chapters");
  const chapters = maxNo("chapters");
  const written = maxNo("manuscript");

  if (cards === 0 && outlines === 0 && written === 0) {
    return {
      stage: "立项",
      line: "这本书还是一张白纸。先聊清楚故事讲什么、给谁看，书名最后再定。",
      steps: [
        { title: "立项访谈", desc: "从「这本书讲什么」开始聊，主编边聊边记，最后才定书名", kind: "capability", cap: "interview", primary: true },
        TALK,
        ADOPT,
        { title: "直接设卡", desc: "跳过访谈，先建人物和世界设定", kind: "capability", cap: "design" },
      ],
    };
  }
  if (outlines === 0) {
    return {
      stage: "设卡",
      line: `已有 ${cards} 张卡。卡够了就该排结构了，不够可以继续补。`,
      steps: [
        { title: "大纲编排", desc: "先排全书里程碑，再到卷纲、章纲", kind: "capability", cap: "outline", primary: true },
        { title: "继续设卡", desc: "补人物 / 世界设定 / 线索", kind: "capability", cap: "design" },
        { title: "聊一张卡", desc: "先和主编把一个人物 / 设定聊清楚，边聊边落卡", kind: "capability", cap: "talk", params: { topic: "主角" } },
        TALK,
      ],
    };
  }
  // 里程碑 / 卷纲有了，还没排章纲：大纲排了一半。不能掉进下面的「审稿」
  //（written===0 才进；已有无纲正文 written>0 的保持原样，照样审稿）。
  // 能到这里 outlines 一定 >0（为 0 的前面已接住）。
  if (chapters === 0 && written === 0) {
    return {
      stage: "设卡",
      line: `大纲起了个头（里程碑 / 卷纲 ${outlines} 处），还没排章纲。先把章纲排出来，卡不够顺手补。`,
      steps: [
        { title: "继续排章纲", desc: "编剧接着把施工单排出来", kind: "capability", cap: "outline", primary: true },
        { title: "继续设卡", desc: "补人物 / 世界设定 / 线索", kind: "capability", cap: "design" },
        TALK,
      ],
    };
  }
  const progress = milestoneProgress(docs, written);
  const progressLine = progress.total > 0 ? `全书 ${progress.total} 个里程碑过了 ${progress.achieved} 个。` : "";
  // 一卷刚写完最后一章：先盘点回写线索，再往下排。盘点是这一刻的第一候选，写下一章 / 审稿退到后面
  const recap: StageStep[] = progress.justFinished
    ? [
        {
          title: `盘点第 ${Number(progress.justFinished.id)} 卷`,
          desc: "编剧把线索推进到哪、坑填了没回写进线索卡，再排下一卷",
          kind: "capability",
          cap: "recap",
          params: { volume: String(Number(progress.justFinished.id)) },
          primary: true,
        },
      ]
    : [];
  if (written < chapters) {
    const next = written + 1;
    const review: StageStep[] =
      written > 0 ? [{ title: `审第 ${written} 章`, desc: "四路评审并行看上一章", kind: "capability", cap: "review", params: { chapter: String(written) } }] : [];
    return {
      stage: "写正文",
      line: `章纲排到第 ${chapters} 章，正文写到第 ${written} 章。${progressLine}`,
      steps: [
        ...recap,
        { title: `写第 ${next} 章`, desc: "写手按章纲写，写完你看 diff 再落盘", kind: "capability", cap: "draft", params: { chapter: String(next) }, primary: recap.length === 0 },
        ...review,
        { title: "继续排章纲", desc: "把后面几章的施工单排出来", kind: "capability", cap: "outline" },
        TALK,
      ],
    };
  }
  const review: StageStep[] =
    written > 0
      ? [{ title: `审第 ${written} 章`, desc: "市场 / 读者 / 文风 / 连续性四路并行", kind: "capability", cap: "review", params: { chapter: String(written) }, primary: recap.length === 0 }]
      : [];
  return {
    stage: "审稿",
    line: `正文写到第 ${written} 章，章纲也排到这里了。${progressLine}`,
    steps: [
      ...recap,
      ...review,
      { title: "排下一批章纲", desc: "编剧接着往后排", kind: "capability", cap: "outline" },
      TALK,
    ],
  };
}
