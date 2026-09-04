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
      `请做立项访谈。目标：把 简介 还缺的必填段聊清楚（doc_template kind=简介 的附注里有清单，机检也会报缺哪段）；聊不清的段先不写，我明确说先放一放的记进 简介 的 open 清单。

- 先读 简介 看哪些段已经有了。我已经说过的信息直接确认，不要再问一遍
- 一句话故事先于其他一切：先让我说这本书大概讲什么，可以很模糊，你听完复述成一句话让我确认或改
- 我说不清这本书讲什么时，从我读过的书挖，不从题材挖：最近哪本没看完、在哪儿放下的；哪本一口气读完；哪个人物看不下去。放下的位置是我的节奏判断，看不下去的人物是我的人物判断，把它们翻成一句话故事和读者画像的候选给我
- 问「这个世界里谁最惨、他要什么、什么挡着他」先于问「这个世界怎么运作」：设定是有什么，故事是谁要什么。我往设定里躲的时候把我拉回来
- 其余几项（题材与平台 / 读者画像 / 主角优势 / 总规模 / 人称与视角 / 书名）的顺序你按对话走向定；书名是可选段，等故事和读者清楚了再定，给 3 个风格不同的备选让我挑，我也可以说先放一放；定了才新增「## 书名」段
- 每次提问都根据我前面说的故事替我给出 2–4 个贴合的候选，不要给泛泛的例子
- 我一段话里带出多项信息时，合在一起确认，不必逐项拆问
- 每确认一项就写进 简介 对应段落（走审批）。我提到“绝不 / 不能”的写成一条 守则（level=必须），提到“尽量 / 喜欢”的也写成一条（level=尽量）
- 全部聊完给我一份简介摘要，然后不要停：紧接着用 ask_user 问我下一步先设哪批卡（按这个故事替我排好优先级），我选了你就直接派策划开始；我如果说「先聊聊主角」这类想先聊再建卡的话，按「聊一张卡」的方式做：拍板一项就落进那张卡，不要攒着`,
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

- 先 project_overview 看这张卡在不在。在就 read_doc 读一遍，我已经定过的不要再问；不在就在我拍板第一项事实时立卡：doc_template 拿模板、write_doc 一张 status=draft 的骨架卡，只写聊到的段，没聊到的段不出现，之后写到了再新增 \`## 段\`
- 之后每拍板一项（名字、出身、化名、性格底色、关键经历……）就 edit_doc 补进对应段落，写完这一项再问下一项，不要攒到最后一起写，也不要留到派策划时再收集
- 每次提问都根据已经定下的事实替我给 2–4 个贴合的候选；强关联的层级选择（比如「哪所学校 + 什么专业」）合成一轮问
- 我说「绝不 / 不能」的写成守则 level=必须，说「尽量 / 喜欢」的写成守则 level=尽量
- 聊得差不多时把这张卡的现状摘要给我，然后用 ask_user 问下一步：派策划在这张卡上孵化完整版 / 再聊几项 / 换一张卡聊`,
  },
  design: {
    id: "design",
    label: "卡片设计",
    description: "派策划创作世界设定 / 人物 / 线索卡片。",
    params: [
      { name: "brief", label: "要设计什么", placeholder: "例如：主角和两个关键对手的人物卡；或：修行体系的世界设定", required: true },
    ],
    render: (params) =>
      `请派策划设计：${p(params, "brief")}。

要求：方向还没定就先让策划出候选，我挑了再让它落卡；我已经说清要什么就直接落。落卡返回里带的机检里标「必须修」的要修掉。`,
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

要求：编剧动笔前读 简介、守则、里程碑、相关线索卡和人物卡。编排里程碑或卷纲时第一轮 mode=propose 先给我候选结构让我选，选定后 continue_agent、mode=commit 让同一个编剧落盘。里程碑一律先候选，我已经说了大概方向也不跳过：把我的方向和另外两种走法并排给我看，说清差在哪，开头和结局之间那段我自己看不见；编排章纲直接 mode=commit 落盘走审批。落盘返回里带的机检里标「必须修」的修掉再向我汇报。`,
  },
  draft: {
    id: "draft",
    label: "章节写作",
    description: "派写手按章纲写一章正文。",
    params: [{ name: "chapter", label: "章号", placeholder: "例如：12", required: true }],
    render: (params) =>
      `请写第 ${p(params, "chapter")} 章正文。

步骤：先确认章纲 章纲/${p(params, "chapter")} 存在且机检没报它缺必填段，不存在或缺段就先告诉我；然后派写手写，读什么写手自己有纪律，任务书只给章号。写手落盘走审批后，向我汇报字数和执行时对章纲的偏离（如有）。`,
  },
  review: {
    id: "review",
    label: "多路审稿",
    description: "多路只读评审看一章，冲突时裁决。",
    params: [{ name: "chapter", label: "章号", placeholder: "例如：12", required: true }],
    render: (params) =>
      `请审第 ${p(params, "chapter")} 章正文（正文/${p(params, "chapter")}）。

按这一章的情况决定派哪几路（运营 / 读者 / 文编 / 校对），一次 spawn_agents 并行派出，任务书都指向这一章。评审各自把清单落进审稿记录，回你的只是一句话。评审都回来后：
1. read_review 看这一章的记录，意见冲突的点派 arbiter 裁决
2. 给我结论 + 必须改的几条，然后用 ask_user 问我要返修哪些（可多选），不要自动开始返修
3. 返修派回原写手，写手自己 read_review，不要把清单复述进任务书`,
  },
  recap: {
    id: "recap",
    label: "卷末盘点",
    description: "一卷写完，派编剧把线索推进到哪、坑填了没回写进线索卡。",
    params: [{ name: "volume", label: "哪一卷", placeholder: "例如：1", required: true }],
    render: (params) =>
      `请派编剧盘点第 ${p(params, "volume")} 卷。

要求：编剧先 volume_rhythm 看这卷每章的字数、线索、钩子，连续几章同一形状的地方要在汇报里点出来；再读 卷纲/${p(params, "volume")}、本卷每章正文的 summary（list_docs kind=正文 就够，不通读正文）、本卷章纲 threads 指向的每张线索卡。对每张涉及的线索卡 edit_doc 回写：stage 改成现在推进到哪；「推进阶段」段追加本卷发生的关键节点；「钩子」段里本卷已经兑现的悬念标成「已兑现（第 N 章）」，新埋的补进去。线索卡只改这三处，起点 / 终点不动。
盘点完向我汇报：哪些线索动了、哪些线索整卷没推进、哪些坑还没填。然后 ask_user 问下一步：排下一卷卷纲 / 先补没推进的线索 / 停一下。`,
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
