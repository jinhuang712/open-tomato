import type { RoleId } from "../protocol.js";

/**
 * 一本书好看的条件，一条只登记这一处。每条写清计划写在哪份材料、谁产出、哪一路评审核对：
 * 产出句进产出角色的系统提示，检查句进那一路评审的手册，同一句话每个模型只看到一次。
 * 标准是通用的默认做法，在裁决依据里排在作者守则和这本书的计划之后；作者守则另有说法的，照守则。
 * 只有核对、没有计划位置的工艺检查（事实、前后一致、文笔、合规）不进这里，留在各路评审手册里。
 * 为什么是这几条，见 docs/关于读者.md。
 */
export interface Standard {
  /** 中文名：提示词、审稿意见里都用这个名字指它 */
  label: string;
  /** 计划写在哪份材料的哪一段 / 字段 */
  planned: string;
  /**
   * 产出时的默认做法，进这些角色的系统提示。
   * 主编产出的标准（简介里的几段）由立项访谈、一句话故事等能力承担，这里不再给主编写一遍。
   */
  produce: Partial<Record<RoleId, string>>;
  /** 哪一路评审核对、怎么核对；没有的由代码门把守（一句话故事） */
  check?: { role: ReviewerRole; text: string };
}

export type ReviewerRole = "ops" | "reader" | "copyeditor" | "proofreader";

export const STANDARDS = {
  pitch: {
    label: "书名与文案",
    planned: "简介「书名」「文案」",
    produce: {},
    check: {
      role: "ops",
      text: "本章给的是不是书名和文案许给读者的那类东西，对不上的标出来；简介还没有文案就跳过这条。",
    },
  },
  story: {
    label: "故事内核",
    planned: "简介「一句话故事」",
    produce: {},
  },
  audience: {
    label: "赛道与读者",
    planned: "简介「题材与平台」「读者画像」",
    produce: {},
    check: {
      role: "ops",
      text: "本章合不合这个赛道读者的期待与套路，内容和读者画像对不对得上；过于垂直或跑偏的地方标出来。",
    },
  },
  protagonist: {
    label: "主角",
    planned: "简介「主角优势」",
    produce: {
      plotter: "排开篇几章时读简介的「主角优势」，让读者早点看到主角凭什么值得跟。",
    },
    check: {
      role: "ops",
      text: "主角在本章是自己在选，还是被剧情推着走；简介写的主角优势有没有派上用场。",
    },
  },
  beat: {
    label: "压放",
    planned: "章纲 beat",
    produce: {
      plotter:
        "章纲的 beat 标这一章是压、放还是平；放的章在本章目标里写清爽点是什么类型，类型以简介的读者画像为准，不套统一公式。排到连着几章压，要说得出出口放在哪一章。",
    },
    check: {
      role: "ops",
      text: "本章爽点的类型与位置，情绪路径清不清楚、有没有正反馈，和章纲 beat 标的对不对得上；主角被压了多久，连续多章没有出口标出来。没有爽点就说没有。",
    },
  },
  hook: {
    label: "开篇与章末",
    planned: "章纲「章末钩子」",
    produce: {
      plotter: "章末钩子落在问题或危机上，而不只是停了。",
      writer: "章首先接住上一章的钩子，让读者很快知道这一章要等什么；章末落在章纲写的钩子上。",
    },
    check: {
      role: "ops",
      text: "开头有没有让读者知道要等什么（结合本章目的判断，交代式开头不自动算问题）；章末有没有追读欲，落点是问题、危机还是只是停了；上一章的钩子本章兑现没有，假钩子标出来。",
    },
  },
  motive: {
    label: "动机",
    planned: "人物卡「内在与欲望」",
    produce: {
      designer: "人物卡的「内在与欲望」写清他要什么、缺什么，要能解释他关键时刻为什么这么选。",
    },
    check: {
      role: "reader",
      text: "哪里人物突然不像自己，或者为了剧情做了你不信的选择。",
    },
  },
  scene: {
    label: "因果推进",
    planned: "章纲「场景序列」",
    produce: {
      plotter: "相邻两场、相邻两章之间是「但是」或「因此」，不是「然后」；接不上的地方就是缺戏。",
    },
    check: {
      role: "reader",
      text: "哪里想跳过、哪一段什么都没发生；哪里逻辑跳了，前后接不上。",
    },
  },
  info: {
    label: "信息量",
    planned: "章纲「信息控制」，设定留在卡里",
    produce: {
      designer: "卡要比正文知道得多，设定藏进卡里；正文只用当前冲突需要的那一点，不一次倒完。",
      writer: "只写当前冲突需要的那一点设定，其余留在卡里不倒；读者需要知道时再露。",
    },
    check: {
      role: "reader",
      text: "哪里看不懂、要回翻才明白；哪里一下子塞进太多设定或背景，哪里又少得跟不上。",
    },
  },
  threads: {
    label: "线索推进",
    planned: "章纲 threads",
    produce: {
      plotter: "章纲的 threads 只写这一章真正推进了的线，不写只是提到的。",
    },
    check: {
      role: "proofreader",
      text: "章纲 threads 指向的每条线是否真往终点走了一步；只提不推的，结合本章目的说明影响。",
    },
  },
  show: {
    label: "演出来",
    planned: "作者守则里文字、叙述类的条目",
    produce: {
      writer: "人物的判断和情绪尽量靠动作、对白和细节演出来，少用旁白替读者下结论。",
    },
    check: {
      role: "copyeditor",
      text: "信息和情绪靠对话、动作传递了没有；替读者下结论的说教式旁白标出来。",
    },
  },
  voice: {
    label: "人物口吻",
    planned: "人物卡「语音签名」",
    produce: {
      designer: "人物卡的「语音签名」提供足以写出可辨认对白的特点，可从措辞、句式、称呼等方面说明，不给每个人机械配齐口头禅。",
      writer: "对白照语音签名，每个人物说话方式可辨认。",
    },
    check: {
      role: "copyeditor",
      text: "对话贴不贴人物身份与语音签名，口语化但没有口水话；谁说话都一个味道的标出来。",
    },
  },
} satisfies Record<string, Standard>;

export type StandardId = keyof typeof STANDARDS;

export const STANDARD_IDS = Object.keys(STANDARDS) as StandardId[];

const standard = (id: StandardId): Standard => STANDARDS[id];

/** 归这个角色产出的标准，按登记顺序 */
export function producedBy(role: RoleId): StandardId[] {
  return STANDARD_IDS.filter((id) => standard(id).produce[role] !== undefined);
}

/** 归这一路评审核对的标准，按登记顺序 */
export function checkedBy(role: RoleId): StandardId[] {
  return STANDARD_IDS.filter((id) => standard(id).check?.role === role);
}

/** 产出角色系统提示里的那一节；这个角色什么都不产出时为空 */
export function produceBlock(role: RoleId): string {
  const ids = producedBy(role);
  if (ids.length === 0) return "";
  const lines = ids.map((id) => `- **${standard(id).label}**：${standard(id).produce[role]}`);
  return `## 归你产出的标准\n\n评审按同样的名字核对；作者守则另有说法的，照守则。\n\n${lines.join("\n")}`;
}

/** 评审手册里的那一节：编号清单，每条带上计划写在哪，好对照着查 */
export function checkBlock(role: RoleId): string {
  const ids = checkedBy(role);
  if (ids.length === 0) return "";
  const lines = ids.map((id, i) => {
    const s = standard(id);
    return `${i + 1}. **${s.label}**：${s.check?.text ?? ""}（计划在 ${s.planned}）`;
  });
  return `## 归你核对的标准\n\nsave_review 时，属于下面哪条的意见，standard 就填它的名字；工艺检查不填。\n\n${lines.join("\n")}`;
}
