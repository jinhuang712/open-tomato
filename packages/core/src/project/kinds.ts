import { THREAD_TYPES } from "../protocol.js";
import type { DocKindId, DocKindInfo } from "../protocol.js";

type Frontmatter = Record<string, unknown>;

/** 必选可以是常量，也可以按已填的 frontmatter 判断（如 tier=主角 时语音签名必填） */
export type Requirement = boolean | ((fm: Frontmatter) => boolean);

/** 通用四项（title / summary / keywords / status）之外的 frontmatter 字段 */
export interface FieldSpec {
  name: string;
  required?: Requirement;
  /** 模板里预置的值；没有值的必填字段渲染成「待填」，没有值的可选字段不出现 */
  value?: string;
  /** 渲染成行尾注释，给填的人看取值范围 */
  comment?: string;
  /** 取值只能是其中之一；机检会报非法值。没写 comment 时注释由它拼出 */
  options?: readonly string[];
}

/** 正文里的一个 `## 段` */
export interface SectionSpec {
  name: string;
  required: Requirement;
  /** 渲染成「待填（hint）」，或在可选段清单里说明这一段写什么 */
  hint?: string;
}

export interface DocKind extends DocKindInfo {
  /** 把用户 / 模型给的 id 规范成文件名（不含扩展名） */
  normalizeId: (id: string) => string;
  fields: FieldSpec[];
  sections: SectionSpec[];
  /** 空白模板（完整文件文本，含 frontmatter）：只出现必填字段和必填段 */
  template: string;
  /** 不传 id 时由 store 分配下一个编号（一条一卡、只追加的类型） */
  autoId?: boolean;
}

export const PLACEHOLDER = "待填";

export function isRequired(req: Requirement | undefined, fm: Frontmatter): boolean {
  if (typeof req === "function") return req(fm);
  return req === true;
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

const COMMON_FIELDS: FieldSpec[] = [
  { name: "title", required: true },
  { name: "summary", required: true },
  { name: "keywords", value: "[]" },
  { name: "status", value: "draft" },
];

/** 模板阶段的 frontmatter 视图：必填字段是「待填」，用来算条件必选 */
function templateFrontmatter(fields: FieldSpec[]): Frontmatter {
  const fm: Frontmatter = {};
  for (const f of fields) fm[f.name] = f.value ?? (isRequired(f.required, {}) ? PLACEHOLDER : undefined);
  return fm;
}

function renderTemplate(fields: FieldSpec[], sections: SectionSpec[], overrides: Partial<Record<string, string>> = {}): string {
  const fm = templateFrontmatter(fields);
  const head: string[] = [];
  for (const f of fields) {
    const value = overrides[f.name] ?? f.value ?? (isRequired(f.required, fm) ? PLACEHOLDER : undefined);
    if (value === undefined) continue;
    const comment = f.comment ?? f.options?.join(" / ");
    head.push(`${f.name}: ${value}${comment ? `  # ${comment}` : ""}`);
  }
  const body = sections
    .filter((s) => isRequired(s.required, fm))
    .map((s) => `## ${s.name}\n\n${PLACEHOLDER}${s.hint ? `（${s.hint}）` : ""}\n`);
  return `---\n${head.join("\n")}\n---\n${body.length > 0 ? `\n${body.join("\n")}` : ""}`;
}

type KindDef = Omit<DocKind, "template" | "fields"> & { fields?: FieldSpec[]; templateOverrides?: Partial<Record<string, string>> };

function defineKind(def: KindDef): DocKind {
  const { templateOverrides, ...rest } = def;
  const fields = [...COMMON_FIELDS, ...(def.fields ?? [])];
  return { ...rest, fields, template: renderTemplate(fields, def.sections, templateOverrides) };
}

const CHARACTER_TIERS = ["主角", "关键对手", "重要配角", "一般配角"] as const;
const speaksMuch = (fm: Frontmatter) => fm.tier === "主角" || fm.tier === "关键对手";

export const DOC_KINDS: Record<DocKindId, DocKind> = {
  world: defineKind({
    id: "world",
    label: "世界设定",
    dir: "世界",
    description: "世界观、规则体系、势力、地点。一张卡讲一个设定对象。",
    normalizeId: slug,
    fields: [{ name: "category", required: true, comment: "规则 / 势力 / 地点 / 物品 / 其他" }],
    sections: [
      { name: "定义", required: true },
      { name: "规则与边界", required: true },
      { name: "与故事的关系", required: true },
      { name: "留白", required: false, hint: "故意不写死、留给后文的部分" },
    ],
  }),
  characters: defineKind({
    id: "characters",
    label: "人物",
    dir: "人物",
    description: "人物卡。语音签名是对白一致性的依据，写对白只取这一段。",
    normalizeId: slug,
    fields: [
      { name: "tier", required: true, comment: CHARACTER_TIERS.join(" / ") },
      { name: "faction", comment: "所属势力" },
    ],
    sections: [
      { name: "一句话", required: true },
      { name: "外在", required: true },
      { name: "内在与欲望", required: true },
      { name: "语音签名", required: speaksMuch, hint: "口头禅、句长、称呼习惯、避讳词" },
      { name: "关系", required: false, hint: "与其他人物的关系" },
      { name: "弧光", required: false, hint: "从哪到哪、因什么而变" },
    ],
  }),
  threads: defineKind({
    id: "threads",
    label: "线索",
    dir: "线索",
    description: "主线 / 支线 / 主题 / 小故事。记起点、终点、推进阶段和挂在上面的钩子。",
    normalizeId: slug,
    fields: [
      { name: "type", required: true, options: THREAD_TYPES },
      { name: "stage", comment: "当前推进到哪一阶段" },
    ],
    sections: [
      { name: "起点", required: true },
      { name: "终点", required: true },
      { name: "推进阶段", required: false, hint: "按顺序列出关键节点" },
      { name: "钩子", required: false, hint: "挂在这条线上的悬念" },
    ],
  }),
  milestones: defineKind({
    id: "milestones",
    label: "里程碑",
    dir: "里程碑",
    description: "全书关键帧。只记坐标不复述事件，按 order 排序。",
    normalizeId: slug,
    fields: [
      { name: "order", required: true, comment: "整数，越小越早" },
      { name: "threads", value: "[]" },
    ],
    sections: [
      { name: "发生什么", required: true },
      { name: "之前必须成立的事", required: false, hint: "前置条件" },
      { name: "之后不可逆的变化", required: true },
    ],
  }),
  volumes: defineKind({
    id: "volumes",
    label: "卷纲",
    dir: "卷纲",
    description: "一卷的装配图：覆盖哪些里程碑、人物落点、章数预算。",
    normalizeId: padded(2),
    fields: [
      { name: "milestones", value: "[]" },
      { name: "chapters", required: true, comment: "例如 1-30" },
    ],
    sections: [
      { name: "本卷目标", required: true },
      { name: "里程碑分配", required: true },
      { name: "人物落点", required: true },
      { name: "卷末状态", required: true },
    ],
  }),
  chapters: defineKind({
    id: "chapters",
    label: "章纲",
    dir: "章纲",
    description: "一章的施工单。写手照着写不该再翻库。",
    normalizeId: padded(4),
    fields: [
      { name: "volume", required: true },
      { name: "characters", required: true, value: "[]" },
      { name: "threads", value: "[]" },
      { name: "words", value: "3000" },
    ],
    sections: [
      { name: "本章目标", required: true },
      { name: "场景序列", required: true, hint: "每个场景：地点 / 在场人物 / 冲突 / 结果" },
      { name: "信息控制", required: true, hint: "本章揭示什么、隐藏什么" },
      { name: "章末钩子", required: true },
    ],
  }),
  manuscript: defineKind({
    id: "manuscript",
    label: "正文",
    dir: "正文",
    description: "章节正文。frontmatter 只记元信息，正文不分段标题。",
    normalizeId: padded(4),
    fields: [
      { name: "words", value: "0" },
      { name: "revision", value: "0" },
    ],
    sections: [],
  }),
  brief: defineKind({
    id: "brief",
    label: "简介",
    dir: "",
    singleton: true,
    description: "这本书是什么：一句话故事、题材平台、读者画像、书名等立项答案。全书一份，可改写。",
    normalizeId: () => "简介",
    templateOverrides: { title: "简介", summary: "书名、一句话故事、题材、平台、读者画像等立项答案", keywords: "[立项]" },
    sections: [
      { name: "一句话故事", required: true },
      { name: "题材与平台", required: true },
      { name: "读者画像", required: true },
      { name: "主角优势", required: true },
      { name: "总规模", required: true },
      { name: "人称与视角", required: true },
      { name: "书名", required: false, hint: "故事和读者清楚了再定" },
    ],
  }),
  rules: defineKind({
    id: "rules",
    label: "守则",
    dir: "守则",
    description:
      "怎么写这本书：一条一卡，title 就是规则本身。level 分 必须（作者说绝不 / 不能）和 尽量（作者说尽量 / 更喜欢），scope 说明管哪一块（文字 / 对白 / 叙述 / 情节 / 人物 / 世界 / 全局）。只追加不删改，作废的标 status: retired。",
    normalizeId: padded(3),
    autoId: true,
    fields: [
      { name: "level", required: true, comment: "必须 / 尽量" },
      { name: "scope", required: true, comment: "文字 / 对白 / 叙述 / 情节 / 人物 / 世界 / 全局" },
      { name: "source", required: true, comment: "作者原话或来源" },
    ],
    sections: [
      { name: "展开", required: false, hint: "规则的边界、例外" },
      { name: "例子", required: false, hint: "正例 / 反例" },
    ],
  }),
};

/** 正文不分段标题，模板只给一个「待填」占位 */
DOC_KINDS.manuscript.template = `${DOC_KINDS.manuscript.template}\n${PLACEHOLDER}\n`;

/** 简介的空白稿（立项时预置在项目根 简介.md） */
export const BRIEF_SEED_BODY = DOC_KINDS.brief.template;

export const DOC_KIND_IDS = Object.keys(DOC_KINDS) as DocKindId[];

const isCommonField = (name: string) => COMMON_FIELDS.some((c) => c.name === name);

/** 按已填的 frontmatter 算出这张卡此刻的必填字段名（不含通用四项） */
/** 有取值范围的字段：给机检报非法值用 */
export function enumFieldsOf(kind: DocKindId): { name: string; options: readonly string[] }[] {
  return DOC_KINDS[kind].fields.flatMap((f) => (f.options ? [{ name: f.name, options: f.options }] : []));
}

export function requiredFieldsOf(kind: DocKindId, fm: Frontmatter): string[] {
  return DOC_KINDS[kind].fields.filter((f) => !isCommonField(f.name) && isRequired(f.required, fm)).map((f) => f.name);
}

/** 按已填的 frontmatter 算出这张卡此刻的必填段 */
export function requiredSectionsOf(kind: DocKindId, fm: Frontmatter): SectionSpec[] {
  return DOC_KINDS[kind].sections.filter((s) => isRequired(s.required, fm));
}

/** 此刻不必填、写到了再加 `## 段` 的段 */
export function optionalSectionsOf(kind: DocKindId, fm: Frontmatter): SectionSpec[] {
  return DOC_KINDS[kind].sections.filter((s) => !isRequired(s.required, fm));
}

/** 附在模板后面给模型看的说明：哪些字段 / 段是可选的、什么条件下转必填 */
export function templateNotes(kind: DocKindId): string {
  const def = DOC_KINDS[kind];
  const lines: string[] = [];
  const optionalFields = def.fields.filter((f) => !isCommonField(f.name) && !isRequired(f.required, {}) && f.value === undefined);
  if (optionalFields.length > 0) lines.push(`可选字段（有值再加）：${optionalFields.map((f) => (f.comment ? `${f.name}（${f.comment}）` : f.name)).join("、")}`);
  const optional = def.sections.filter((s) => !isRequired(s.required, {}));
  if (optional.length > 0) {
    lines.push(`可选段（写到了再新增 ## 段，不要预置占位）：${optional.map((s) => (s.hint ? `${s.name}（${s.hint}）` : s.name)).join("、")}`);
  }
  const conditional = def.sections.filter((s) => typeof s.required === "function").map((s) => s.name);
  if (kind === "characters" && conditional.length > 0) lines.push(`tier 为 主角 / 关键对手 时必填：${conditional.join("、")}`);
  lines.push("作者明确说先放一放的项记进 frontmatter open: [项名]，拍板后去掉。");
  return lines.map((l) => `<!-- ${l} -->`).join("\n");
}

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
