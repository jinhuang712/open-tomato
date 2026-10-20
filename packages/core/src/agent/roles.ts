import { fill, markdown, text as textValue } from "../text/load.js";
import type { DocKindId, RoleId, RoleInfo } from "../protocol.js";
import { kindInfos } from "../project/kinds.js";
import { capabilityRoster } from "./capabilities.js";
import { composeRolePrompt } from "../text/compose.js";
import type { HostId } from "../text/host.js";
import { checkBlock, produceBlock } from "./standards.js";

const GUIDE_ROLE = { 文编: "copyeditor", 运营: "ops", 校对: "proofreader" } as const;

/**
 * 评审手册随应用发布，在 packages/core/text/reviews/ 下，一路一份 markdown。
 * 手册写通用的审稿方法；每本书的偏好记在守则里。作者不在应用内改手册，修改手册需要改仓库文件。
 * 归这一路核对的标准从标准表拼进 {{STANDARDS}}，手册里只写标准表之外的其他检查。
 * 读者评审没有手册，只要人设和归它核对的标准。
 */
export function reviewGuide(name: keyof typeof GUIDE_ROLE): string {
  const raw = markdown(`reviews/${GUIDE_ROLE[name]}`);
  return fill(raw, { STANDARDS: checkBlock(GUIDE_ROLE[name]) });
}

// 角色正文在 text/roles/，共享规则在 text/collaboration.md；组装入口在 text/compose.ts。

export interface RoleDef extends RoleInfo {
  /**
   * 这个角色能落盘哪些类型的材料。空数组就是只读，没有 write_doc / edit_doc。
   * 这是设计文档说的「角色只改自己那类材料」的代码形态：工具参数只列这些类型，落盘前再查一次，不靠模型自觉。
   */
  writableKinds: readonly DocKindId[];
  /**
   * 对不归自己写的类型，也能改记账字段（status / open / keywords）。
   * 统筹者要能把一张孤卡标成 retired，而不必为此派一个 agent；内容一个字都改不了，那还是归对应角色。
   */
  bookkeepAnyKind?: boolean;
  canSpawn: boolean;
  canAsk: boolean;
  /** 评审角色：有 save_review，结论自己落审稿记录，不经主编转述 */
  canReview?: boolean;
  systemPrompt: string;
}

/** 材料类型表由 schema 生成，正文由 text/ 的组装器加入。 */
const KIND_TABLE = kindInfos()
  .map((k) => `| ${k.id} | ${k.singleton ? `${k.label}.md` : `${k.dir}/`} | ${k.description} |`)
  .join("\n");

/**
 * 所有角色共用的状态行约定。界面隐藏思考过程，靠这一行告诉作者你在干什么。
 * 内核会把它从正文里摘出来单独显示。
 */
export const STATUS_LINE_RULE = textValue("hosts/app", "status");

export const STATUS_LINE_PATTERN = /^\s*[»›>]\s*(正在[^\n]{1,40}?)\s*(?:\r?\n|$)/;

/** 三类卡片：世界设定、人物、线索 */
const CARDS: readonly DocKindId[] = ["world", "characters", "threads"];
/** 三层大纲 */
const OUTLINES: readonly DocKindId[] = ["milestones", "volumes", "chapters"];

type RoleSpec = Omit<RoleDef, "canWrite" | "systemPrompt">;

const SPECS: Record<RoleId, RoleSpec> = {
  director: {
    id: "director",
    label: textValue("roles", "roles.director.label"),
    description: textValue("roles", "roles.director.description"),
    writableKinds: ["brief", "rules", ...CARDS],
    bookkeepAnyKind: true,
    canSpawn: true,
    canAsk: true,
  },

  designer: {
    id: "designer",
    label: textValue("roles", "roles.designer.label"),
    description: textValue("roles", "roles.designer.description"),
    writableKinds: CARDS,
    canSpawn: false,
    canAsk: false,
  },

  plotter: {
    id: "plotter",
    label: textValue("roles", "roles.plotter.label"),
    description: textValue("roles", "roles.plotter.description"),
    writableKinds: [...OUTLINES, "threads"],
    canSpawn: false,
    canAsk: false,
  },

  writer: {
    id: "writer",
    label: textValue("roles", "roles.writer.label"),
    description: textValue("roles", "roles.writer.description"),
    writableKinds: ["manuscript"],
    canSpawn: false,
    canAsk: false,
  },

  ops: {
    id: "ops",
    label: textValue("roles", "roles.ops.label"),
    description: textValue("roles", "roles.ops.description"),
    writableKinds: [],
    canSpawn: false,
    canAsk: false,
    canReview: true,
  },

  reader: {
    id: "reader",
    label: textValue("roles", "roles.reader.label"),
    description: textValue("roles", "roles.reader.description"),
    writableKinds: [],
    canSpawn: false,
    canAsk: false,
    canReview: true,
  },

  copyeditor: {
    id: "copyeditor",
    label: textValue("roles", "roles.copyeditor.label"),
    description: textValue("roles", "roles.copyeditor.description"),
    writableKinds: [],
    canSpawn: false,
    canAsk: false,
    canReview: true,
  },

  proofreader: {
    id: "proofreader",
    label: textValue("roles", "roles.proofreader.label"),
    description: textValue("roles", "roles.proofreader.description"),
    writableKinds: [],
    canSpawn: false,
    canAsk: false,
    canReview: true,
  },

  arbiter: {
    id: "arbiter",
    label: textValue("roles", "roles.arbiter.label"),
    description: textValue("roles", "roles.arbiter.description"),
    writableKinds: [],
    canSpawn: false,
    canAsk: false,
  },
};

/** 入口供宿主和预览命令共用，不在插件里追加一套覆盖规则。 */
export function rolePrompt(id: RoleId, host: HostId = "app"): string {
  const spec = SPECS[id];
  const guide = Object.entries(GUIDE_ROLE).find(([, role]) => role === id)?.[0] as keyof typeof GUIDE_ROLE | undefined;
  return composeRolePrompt({
    ...spec,
    canWrite: spec.writableKinds.length > 0,
    values: {
      KIND_TABLE,
      CAPABILITIES: capabilityRoster(),
      STANDARDS: spec.canReview ? checkBlock(id) : produceBlock(id),
      GUIDE: guide ? reviewGuide(guide) : "",
    },
  }, host);
}

export const ROLES: Record<RoleId, RoleDef> = Object.fromEntries(
  Object.entries(SPECS).map(([id, spec]) => [id, {
    ...spec,
    canWrite: spec.writableKinds.length > 0,
    systemPrompt: rolePrompt(id as RoleId),
  }]),
) as Record<RoleId, RoleDef>;

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
