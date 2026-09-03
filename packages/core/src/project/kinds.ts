import type { DocKindId, DocKindInfo } from "../protocol.js";

export interface DocKind extends DocKindInfo {
  /** 把用户 / 模型给的 id 规范成文件名（不含扩展名） */
  normalizeId: (id: string) => string;
  /** 通用字段之外必须出现在 frontmatter 的字段 */
  requiredFields: string[];
  /** 空白模板（完整文件文本，含 frontmatter） */
  template: string;
  /** 不传 id 时由 store 分配下一个编号（一条一卡、只追加的类型） */
  autoId?: boolean;
}

const slug = (id: string) =>
  id
    .trim()
    .toLowerCase()
    .replace(/\.md$/, "")
    .replace(/[^\p{L}\p{N}-]+/gu, "-")
    .replace(/^-+|-+$/g, "");

const padded = (width: number) => (id: string) => {
  const digits = id.replace(/\.md$/, "").replace(/\D/g, "");
  if (digits === "") return slug(id);
  return digits.padStart(width, "0");
};

const common = (extra: string) => `---
title: 待填
summary: 待填
keywords: []
status: draft
${extra}---
`;

/** 简介的空白稿（立项时预置在项目根 简介.md） */
export const BRIEF_SEED_BODY = `---
title: 简介
summary: 书名、一句话故事、题材、平台、读者画像等立项答案
keywords: [立项]
status: draft
---

## 一句话故事

待填

## 题材与平台

待填

## 读者画像

待填

## 主角优势

待填

## 总规模

待填

## 人称与视角

待填

## 书名

待定
`;

export const DOC_KINDS: Record<DocKindId, DocKind> = {
  world: {
    id: "world",
    label: "世界设定",
    dir: "世界",
    description: "世界观、规则体系、势力、地点。一张卡讲一个设定对象。",
    normalizeId: slug,
    requiredFields: [],
    template: `${common("category: 待填  # 规则 / 势力 / 地点 / 物品 / 其他\n")}
## 定义

待填

## 规则与边界

待填

## 与故事的关系

待填

## 留白

待定
`,
  },
  characters: {
    id: "characters",
    label: "人物",
    dir: "人物",
    description: "人物卡。语音签名是对白一致性的依据，写对白只取这一段。",
    normalizeId: slug,
    requiredFields: ["tier"],
    template: `${common("tier: 待填  # 主角 / 关键对手 / 重要配角 / 一般配角\nfaction: 待定\n")}
## 一句话

待填

## 外在

待填

## 内在与欲望

待填

## 语音签名

待填（口头禅、句长、称呼习惯、避讳词）

## 关系

待定

## 弧光

待定
`,
  },
  threads: {
    id: "threads",
    label: "线索",
    dir: "线索",
    description: "主线 / 支线 / 主题线。记起点、终点、推进阶段和挂在上面的钩子。",
    normalizeId: slug,
    requiredFields: ["type"],
    template: `${common("type: 待填  # 主线 / 支线 / 主题\nstage: 待定\n")}
## 起点

待填

## 终点

待填

## 推进阶段

待定

## 钩子

待定
`,
  },
  milestones: {
    id: "milestones",
    label: "里程碑",
    dir: "里程碑",
    description: "全书关键帧。只记坐标不复述事件，按 order 排序。",
    normalizeId: slug,
    requiredFields: ["order"],
    template: `${common("order: 待填  # 整数，越小越早\nthreads: []\n")}
## 发生什么

待填

## 之前必须成立的事

待定

## 之后不可逆的变化

待填
`,
  },
  volumes: {
    id: "volumes",
    label: "卷纲",
    dir: "卷纲",
    description: "一卷的装配图：覆盖哪些里程碑、人物落点、章数预算。",
    normalizeId: padded(2),
    requiredFields: ["chapters"],
    template: `${common("milestones: []\nchapters: 待填  # 例如 1-30\n")}
## 本卷目标

待填

## 里程碑分配

待填

## 人物落点

待填

## 卷末状态

待填
`,
  },
  chapters: {
    id: "chapters",
    label: "章纲",
    dir: "章纲",
    description: "一章的施工单。执笔照着写不该再翻库。",
    normalizeId: padded(4),
    requiredFields: ["volume", "characters"],
    template: `${common("volume: 待填\ncharacters: []\nthreads: []\nwords: 3000\n")}
## 本章目标

待填

## 场景序列

待填（每个场景：地点 / 在场人物 / 冲突 / 结果）

## 信息控制

待填（本章揭示什么、隐藏什么）

## 章末钩子

待填
`,
  },
  manuscript: {
    id: "manuscript",
    label: "正文",
    dir: "正文",
    description: "章节正文。frontmatter 只记元信息，正文不分段标题。",
    normalizeId: padded(4),
    requiredFields: [],
    template: `${common("words: 0\nrevision: 0\n")}
待填
`,
  },
  brief: {
    id: "brief",
    label: "简介",
    dir: "",
    singleton: true,
    description: "这本书是什么：一句话故事、题材平台、读者画像、书名等立项答案。全书一份，七段，可改写。",
    normalizeId: () => "简介",
    requiredFields: [],
    template: BRIEF_SEED_BODY,
  },
  rules: {
    id: "rules",
    label: "守则",
    dir: "守则",
    description:
      "怎么写这本书：一条一卡，title 就是规则本身。level 分 必须（作者说绝不 / 不能）和 尽量（作者说尽量 / 更喜欢），scope 说明管哪一块（文字 / 对白 / 叙述 / 情节 / 人物 / 世界 / 全局）。只追加不删改，作废的标 status: retired。",
    normalizeId: padded(3),
    autoId: true,
    requiredFields: ["level", "scope"],
    template: `---
title: 待填  # 一句话就是规则本身，例如「主角不说脏话」
summary: 待填
keywords: []
status: draft
level: 待填  # 必须 / 尽量
scope: 待填  # 文字 / 对白 / 叙述 / 情节 / 人物 / 世界 / 全局
source: 待填  # 作者原话或来源
---

## 展开

待定（规则的边界、例外）

## 例子

待定（正例 / 反例）
`,
  },
};

export const DOC_KIND_IDS = Object.keys(DOC_KINDS) as DocKindId[];

export function isDocKindId(v: unknown): v is DocKindId {
  return typeof v === "string" && v in DOC_KINDS;
}

/** kind id、中文目录名、中文标签都能解析成 kind；给工具参数和路径识别用 */
export function resolveKind(v: unknown): DocKindId | null {
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/\/$/, "");
  if (s === "") return null;
  if (isDocKindId(s)) return s;
  for (const k of DOC_KIND_IDS) {
    const d = DOC_KINDS[k];
    if (d.dir === s || d.label === s) return k;
  }
  return null;
}

/** 老布局（英文目录 / 英文守则文件名）→ 现布局，给 ProjectStore.open 做迁移用 */
export const LEGACY_DIRS: Partial<Record<DocKindId, string>> = {
  world: "world",
  characters: "characters",
  threads: "threads",
  milestones: "milestones",
  volumes: "outline/volumes",
  chapters: "outline/chapters",
  manuscript: "manuscript",
  rules: "guide",
};
/** 更老的英文守则文件名 → 中文文件名（都在 守则/ 下），再由 migrateGuide 拆成 简介 + 守则条目 */
export const LEGACY_GUIDE_IDS: Record<string, string> = { brief: "立项", style: "文风", rules: "铁律", preferences: "偏好" };

export function kindInfos(): DocKindInfo[] {
  return DOC_KIND_IDS.map((k) => {
    const { id, label, dir, description, singleton } = DOC_KINDS[k];
    return { id, label, dir, description, ...(singleton ? { singleton } : {}) };
  });
}
