import { readFileSync } from "node:fs";
import type { RoleId, RoleInfo } from "../protocol.js";
import { kindInfos } from "../project/kinds.js";

/**
 * 评审手册随应用发布，在 packages/core/guides/ 下，一路一份 markdown。
 * 手册是工艺知识，跟哪本书无关；这本书的偏好走守则。作者不改手册，改手册是改代码仓。
 * 读者评审没有手册，只要人设。
 */
export function reviewGuide(name: "文编" | "运营" | "校对"): string {
  return readFileSync(new URL(`../../guides/评审-${name}.md`, import.meta.url), "utf8").trim();
}

/**
 * 角色正文随应用发布，在 packages/core/prompts/ 下，一 role 一份 markdown。
 * md 里只写这个角色独有的部分，共享片段用占位符，组装时由代码注入：
 * - {{PROJECT_LAYOUT}}：项目结构 + 读取纪律 + 联网查证（含 KIND_TABLE，schema 生成）
 * - {{WRITE_DISCIPLINE}}：落盘纪律
 * - {{REVIEW_INTENT}}：评审先读章纲
 * - {{REVIEW_SAVE}}：评审交付约定
 * - {{GUIDE}}：三路评审各自的手册（reviewGuide）
 * 占位符缺值就抛错，别让没拼好的提示词上线。
 */
function loadPrompt(name: string): string {
  return readFileSync(new URL(`../../prompts/${name}.md`, import.meta.url), "utf8").trim();
}

function fill(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/{{(\w+)}}/g, (_, k: string) => {
    const v = vars[k];
    if (v === undefined) throw new Error(`prompt 占位符缺值：${k}`);
    return v;
  });
}

export interface RoleDef extends RoleInfo {
  canSpawn: boolean;
  canAsk: boolean;
  /** 评审角色：有 save_review，结论自己落审稿记录，不经主编转述 */
  canReview?: boolean;
  systemPrompt: string;
}

/** 评审对照意图，不对照通用标准：先读章纲，第一项检查是章纲承诺的做到了没有 */
const REVIEW_INTENT = loadPrompt("shared/review-intent");

/** 评审的杂活自己做：结论落审稿记录，回主编的只是一句话。写手返修和下一章开写时读记录，不靠主编转述 */
const REVIEW_SAVE = loadPrompt("shared/review-save");

/** 类型表从 schema 生成：schema 是唯一来源，提示词里不再手抄一份 */
const KIND_TABLE = kindInfos()
  .map((k) => `| ${k.id} | ${k.singleton ? `${k.label}.md` : `${k.dir}/`} | ${k.description} |`)
  .join("\n");

const PROJECT_LAYOUT = fill(loadPrompt("shared/project-layout"), { KIND_TABLE });

const WRITE_DISCIPLINE = loadPrompt("shared/write-discipline");

/**
 * 所有角色共用的状态行约定。界面隐藏思考过程，靠这一行告诉作者你在干什么。
 * 内核会把它从正文里摘出来单独显示。
 */
export const STATUS_LINE_RULE = loadPrompt("shared/status-line");

export const STATUS_LINE_PATTERN = /^\s*[»›>]\s*(正在[^\n]{1,40}?)\s*(?:\r?\n|$)/;

export const ROLES: Record<RoleId, RoleDef> = {
  director: {
    id: "director",
    label: "主编",
    description: "统筹全局：判断当前处在哪个阶段、派发子 agent、把候选结果交给用户拍板。",
    canWrite: true,
    canSpawn: true,
    canAsk: true,
    systemPrompt: fill(loadPrompt("director"), { PROJECT_LAYOUT, WRITE_DISCIPLINE }),
  },

  designer: {
    id: "designer",
    label: "策划",
    description: "创作世界设定、人物、线索卡片。出候选、落卡片。",
    canWrite: true,
    canSpawn: false,
    canAsk: false,
    systemPrompt: fill(loadPrompt("designer"), { PROJECT_LAYOUT, WRITE_DISCIPLINE }),
  },

  plotter: {
    id: "plotter",
    label: "编剧",
    description: "编排里程碑、卷纲、章纲三层结构。",
    canWrite: true,
    canSpawn: false,
    canAsk: false,
    systemPrompt: fill(loadPrompt("plotter"), { PROJECT_LAYOUT, WRITE_DISCIPLINE }),
  },

  writer: {
    id: "writer",
    label: "写手",
    description: "按章纲写正文。",
    canWrite: true,
    canSpawn: false,
    canAsk: false,
    systemPrompt: fill(loadPrompt("writer"), { PROJECT_LAYOUT, WRITE_DISCIPLINE }),
  },

  ops: {
    id: "ops",
    label: "运营",
    description: "只读。看抓人度、爽点密度、追读动力。",
    canWrite: false,
    canSpawn: false,
    canAsk: false,
    canReview: true,
    systemPrompt: fill(loadPrompt("ops"), { PROJECT_LAYOUT, REVIEW_INTENT, REVIEW_SAVE, GUIDE: reviewGuide("运营") }),
  },

  reader: {
    id: "reader",
    label: "读者",
    description: "只读。以目标读者身份看阅读体验。",
    canWrite: false,
    canSpawn: false,
    canAsk: false,
    canReview: true,
    systemPrompt: fill(loadPrompt("reader"), { PROJECT_LAYOUT, REVIEW_INTENT, REVIEW_SAVE }),
  },

  copyeditor: {
    id: "copyeditor",
    label: "文编",
    description: "只读。抓机器味和文风偏差。",
    canWrite: false,
    canSpawn: false,
    canAsk: false,
    canReview: true,
    systemPrompt: fill(loadPrompt("copyeditor"), { PROJECT_LAYOUT, REVIEW_INTENT, REVIEW_SAVE, GUIDE: reviewGuide("文编") }),
  },

  proofreader: {
    id: "proofreader",
    label: "校对",
    description: "只读。对正文与卡片、章纲、前文的一致性。",
    canWrite: false,
    canSpawn: false,
    canAsk: false,
    canReview: true,
    systemPrompt: fill(loadPrompt("proofreader"), { PROJECT_LAYOUT, REVIEW_INTENT, REVIEW_SAVE, GUIDE: reviewGuide("校对") }),
  },

  arbiter: {
    id: "arbiter",
    label: "裁决",
    description: "只读。评审意见冲突时给出取舍。",
    canWrite: false,
    canSpawn: false,
    canAsk: false,
    systemPrompt: fill(loadPrompt("arbiter"), { PROJECT_LAYOUT }),
  },
};

export const ROLE_IDS = Object.keys(ROLES) as RoleId[];

export function roleInfos(): RoleInfo[] {
  return ROLE_IDS.map((id) => {
    const { label, description, canWrite } = ROLES[id];
    return { id, label, description, canWrite };
  });
}

export function isRoleId(v: unknown): v is RoleId {
  return typeof v === "string" && v in ROLES;
}
