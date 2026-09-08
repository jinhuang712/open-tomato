import type { DocFieldInfo, DocKindId } from "@opentomato/core/protocol";

/**
 * frontmatter 字段在界面上怎么读怎么写。读页（卡片头部、审阅的 Word 视图）和编辑器共用一套，
 * 免得同一个字段在两处叫不同的名字、按不同的规则回填。
 */

/** frontmatter 字段在界面上的中文名。键名是给模型和文件用的，作者看到的要是人话 */
export const FIELD_LABEL: Record<string, string> = {
  title: "标题",
  summary: "摘要",
  keywords: "关键词",
  status: "状态",
  open: "先放一放",
  category: "分类",
  tier: "层级",
  faction: "势力",
  level: "等级",
  scope: "管哪块",
  source: "作者原话",
  type: "类型",
  stage: "推进到",
  order: "序号",
  threads: "关联线索",
  milestones: "里程碑",
  chapters: "章数",
  volume: "所属卷",
  characters: "出场人物",
  words: "字数",
  revision: "修订次数",
};

/** 一个 extra 字段在头部怎么读：等级 / 类型这类定性的做强调胶囊，引用别的卡的做可点的胶囊，数字加上量词；source 单独当引文 */
export type FieldView = { accent?: boolean; label?: string; ref?: DocKindId; fmt?: (v: string) => string; quote?: boolean; hide?: boolean };

export const FIELD_VIEWS: Partial<Record<DocKindId, Record<string, FieldView>>> = {
  rules: { level: { accent: true }, scope: { label: "管" }, source: { quote: true } },
  world: { category: { accent: true } },
  characters: { tier: { accent: true }, faction: { label: "势力" } },
  threads: { type: { accent: true }, stage: { label: "推进到" } },
  milestones: { order: { fmt: (v) => `第 ${v} 帧` }, threads: { ref: "threads" } },
  volumes: { chapters: { fmt: (v) => `第 ${v} 章` }, milestones: { ref: "milestones" } },
  chapters: { volume: { ref: "volumes", fmt: (v) => `卷 ${v}` }, characters: { ref: "characters" }, threads: { ref: "threads" }, words: { fmt: (v) => `${v} 字` } },
  manuscript: { words: { fmt: (v) => `${v} 字` }, revision: { hide: true } },
};

/** 列表字段的分隔符：界面上用「、」拼，回填时中英文逗号和顿号都认 */
const LIST_SEP = /[,，、]/;

export const headFieldText = (v: unknown): string => (Array.isArray(v) ? v.map(String).join("、") : v === null || v === undefined ? "" : String(v));

/**
 * 表单里那行文字变回 frontmatter 的值：列表按分隔符切开，数字保持数字（不然 `words: 3000` 会变成带引号的字符串），
 * 清空表示删掉这个键。
 */
export function headFieldValue(text: string, spec: DocFieldInfo | undefined, before: unknown): unknown {
  const t = text.trim();
  if (spec?.list || Array.isArray(before)) return t === "" ? [] : t.split(LIST_SEP).map((s) => s.trim()).filter(Boolean);
  if (t === "") return undefined;
  if ((typeof before === "number" || before === undefined) && /^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return t;
}

/**
 * 表单要出现的字段：schema 里声明的 + 文件里实际有的（agent 加的键也能改），按 schema 顺序。
 * 值是嵌套结构的键不进表单——单行文字表达不了，进来只会被拍平写坏。
 */
export function headKeysOf(fields: DocFieldInfo[], fm: Record<string, unknown>): string[] {
  const flat = (v: unknown) => v === null || v === undefined || typeof v !== "object" || Array.isArray(v);
  const declared = fields.map((f) => f.name);
  return [...declared, ...Object.keys(fm).filter((k) => !declared.includes(k))].filter((k) => flat(fm[k]));
}
