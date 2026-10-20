import { text as textValue } from "../text/load.js";
import type { RoleId } from "../protocol.js";

/**
 * 一本书好看的条件，一条只登记这一处。每条写清计划写在哪份材料、谁产出、哪一路评审核对：
 * 产出句进产出角色的系统提示，检查句进那一路评审的手册，同一句话每个模型只看到一次。
 * 标准是通用的默认做法，在裁决依据里排在作者守则和这本书的计划之后；作者守则另有说法的，照守则。
 * 只有核对、没有计划位置的其他检查（事实、前后一致、文笔、合规）不进这里，留在各路评审手册里。
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
    label: textValue("shared/standards", "standards.pitch.label"),
    planned: textValue("shared/standards", "standards.pitch.planned"),
    produce: {},
    check: {
      role: "ops",
      text: textValue("shared/standards", "standards.pitch.check.text"),
    },
  },
  story: {
    label: textValue("shared/standards", "standards.story.label"),
    planned: textValue("shared/standards", "standards.story.planned"),
    produce: {},
  },
  audience: {
    label: textValue("shared/standards", "standards.audience.label"),
    planned: textValue("shared/standards", "standards.audience.planned"),
    produce: {},
    check: {
      role: "ops",
      text: textValue("shared/standards", "standards.audience.check.text"),
    },
  },
  protagonist: {
    label: textValue("shared/standards", "standards.protagonist.label"),
    planned: textValue("shared/standards", "standards.protagonist.planned"),
    produce: {
      plotter: textValue("shared/standards", "standards.protagonist.produce.plotter"),
    },
    check: {
      role: "ops",
      text: textValue("shared/standards", "standards.protagonist.check.text"),
    },
  },
  beat: {
    label: textValue("shared/standards", "standards.beat.label"),
    planned: textValue("shared/standards", "standards.beat.planned"),
    produce: {
      plotter:
        textValue("shared/standards", "standards.beat.produce.plotter"),
    },
    check: {
      role: "ops",
      text: textValue("shared/standards", "standards.beat.check.text"),
    },
  },
  hook: {
    label: textValue("shared/standards", "standards.hook.label"),
    planned: textValue("shared/standards", "standards.hook.planned"),
    produce: {
      plotter: textValue("shared/standards", "standards.hook.produce.plotter"),
      writer: textValue("shared/standards", "standards.hook.produce.writer"),
    },
    check: {
      role: "ops",
      text: textValue("shared/standards", "standards.hook.check.text"),
    },
  },
  motive: {
    label: textValue("shared/standards", "standards.motive.label"),
    planned: textValue("shared/standards", "standards.motive.planned"),
    produce: {
      designer: textValue("shared/standards", "standards.motive.produce.designer"),
    },
    check: {
      role: "reader",
      text: textValue("shared/standards", "standards.motive.check.text"),
    },
  },
  scene: {
    label: textValue("shared/standards", "standards.scene.label"),
    planned: textValue("shared/standards", "standards.scene.planned"),
    produce: {
      plotter: textValue("shared/standards", "standards.scene.produce.plotter"),
    },
    check: {
      role: "reader",
      text: textValue("shared/standards", "standards.scene.check.text"),
    },
  },
  info: {
    label: textValue("shared/standards", "standards.info.label"),
    planned: textValue("shared/standards", "standards.info.planned"),
    produce: {
      designer: textValue("shared/standards", "standards.info.produce.designer"),
      writer: textValue("shared/standards", "standards.info.produce.writer"),
    },
    check: {
      role: "reader",
      text: textValue("shared/standards", "standards.info.check.text"),
    },
  },
  threads: {
    label: textValue("shared/standards", "standards.threads.label"),
    planned: textValue("shared/standards", "standards.threads.planned"),
    produce: {
      plotter: textValue("shared/standards", "standards.threads.produce.plotter"),
    },
    check: {
      role: "proofreader",
      text: textValue("shared/standards", "standards.threads.check.text"),
    },
  },
  show: {
    label: textValue("shared/standards", "standards.show.label"),
    planned: textValue("shared/standards", "standards.show.planned"),
    produce: {
      writer: textValue("shared/standards", "standards.show.produce.writer"),
    },
    check: {
      role: "copyeditor",
      text: textValue("shared/standards", "standards.show.check.text"),
    },
  },
  voice: {
    label: textValue("shared/standards", "standards.voice.label"),
    planned: textValue("shared/standards", "standards.voice.planned"),
    produce: {
      designer: textValue("shared/standards", "standards.voice.produce.designer"),
      writer: textValue("shared/standards", "standards.voice.produce.writer"),
    },
    check: {
      role: "copyeditor",
      text: textValue("shared/standards", "standards.voice.check.text"),
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
  return textValue("shared/standards", "standards.message", { v0: lines.join("\n") });
}

/** 评审手册里的那一节：编号清单，每条带上计划写在哪，好对照着查 */
export function checkBlock(role: RoleId): string {
  const ids = checkedBy(role);
  if (ids.length === 0) return "";
  const lines = ids.map((id, i) => {
    const s = standard(id);
    return textValue("shared/standards", "standards.message_2", { v0: i + 1, v1: s.label, v2: s.check?.text ?? "", v3: s.planned });
  });
  return textValue("shared/standards", "standards.message_3", { v0: lines.join("\n") });
}
