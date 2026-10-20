import { markdown, text as textValue } from "../text/load.js";
import type { CapabilityId, CapabilityInfo, CapabilityKind } from "../protocol.js";
import { STANDARDS, type StandardId } from "./standards.js";

/**
 * 每项能力是一类工作的说明：写清目标、要交出什么、有哪些限制，不规定步骤。
 * 作者与主编共用同一份说明，具体怎么做，要看对话、材料和已有授权。
 */
export interface CapabilityDef extends CapabilityInfo {
  /** 什么时候该想到它：给主编的清单看，也给按钮的说明 */
  when: string;
  /** 加载正文：进主编的上下文 */
  load: () => string;
  /** 技法修的是哪条标准：审稿意见标了这条标准，就想到这条技法 */
  standard?: StandardId;
}

export const CAPABILITIES: Record<CapabilityId, CapabilityDef> = {
  interview: {
    id: "interview",
    label: textValue("shared/capabilities", "capabilities.interview.label"),
    kind: "workflow",
    description: textValue("shared/capabilities", "capabilities.interview.description"),
    when: textValue("shared/capabilities", "capabilities.interview.when"),
    load: () => markdown("shared/capabilities/interview"),
  },
  seed: {
    id: "seed",
    label: textValue("shared/capabilities", "capabilities.seed.label"),
    kind: "workflow",
    description: textValue("shared/capabilities", "capabilities.seed.description"),
    when: textValue("shared/capabilities", "capabilities.seed.when"),
    load: () => markdown("shared/capabilities/seed"),
  },
  talk: {
    id: "talk",
    label: textValue("shared/capabilities", "capabilities.talk.label"),
    kind: "workflow",
    description: textValue("shared/capabilities", "capabilities.talk.description"),
    when: textValue("shared/capabilities", "capabilities.talk.when"),
    load: () => markdown("shared/capabilities/talk"),
  },
  design: {
    id: "design",
    label: textValue("shared/capabilities", "capabilities.design.label"),
    kind: "workflow",
    description: textValue("shared/capabilities", "capabilities.design.description"),
    when: textValue("shared/capabilities", "capabilities.design.when"),
    load: () => markdown("shared/capabilities/design"),
  },
  outline: {
    id: "outline",
    label: textValue("shared/capabilities", "capabilities.outline.label"),
    kind: "workflow",
    description: textValue("shared/capabilities", "capabilities.outline.description"),
    when: textValue("shared/capabilities", "capabilities.outline.when"),
    load: () => markdown("shared/capabilities/outline"),
  },
  draft: {
    id: "draft",
    label: textValue("shared/capabilities", "capabilities.draft.label"),
    kind: "workflow",
    description: textValue("shared/capabilities", "capabilities.draft.description"),
    when: textValue("shared/capabilities", "capabilities.draft.when"),
    load: () => markdown("shared/capabilities/draft"),
  },
  review: {
    id: "review",
    label: textValue("shared/capabilities", "capabilities.review.label"),
    kind: "workflow",
    description: textValue("shared/capabilities", "capabilities.review.description"),
    when: textValue("shared/capabilities", "capabilities.review.when"),
    load: () => markdown("shared/capabilities/review"),
  },
  recap: {
    id: "recap",
    label: textValue("shared/capabilities", "capabilities.recap.label"),
    kind: "workflow",
    description: textValue("shared/capabilities", "capabilities.recap.description"),
    when: textValue("shared/capabilities", "capabilities.recap.when"),
    load: () => markdown("shared/capabilities/recap"),
  },
  pitch: {
    id: "pitch",
    label: textValue("shared/capabilities", "capabilities.pitch.label"),
    kind: "workflow",
    description: textValue("shared/capabilities", "capabilities.pitch.description"),
    when: textValue("shared/capabilities", "capabilities.pitch.when"),
    load: () => markdown("shared/capabilities/pitch"),
  },
  "deeper-needs": {
    id: "deeper-needs",
    label: textValue("shared/capabilities", "capabilities.deeper-needs.label"),
    kind: "technique",
    description: textValue("shared/capabilities", "capabilities.deeper-needs.description"),
    when: textValue("shared/capabilities", "capabilities.deeper-needs.when"),
    load: () => markdown("shared/capabilities/deeper-needs"),
    standard: "motive",
  },
  show: {
    id: "show",
    label: textValue("shared/capabilities", "capabilities.show.label"),
    kind: "technique",
    description: textValue("shared/capabilities", "capabilities.show.description"),
    when: textValue("shared/capabilities", "capabilities.show.when"),
    load: () => markdown("shared/capabilities/show"),
    standard: "show",
  },
  fivewhy: {
    id: "fivewhy",
    label: textValue("shared/capabilities", "capabilities.fivewhy.label"),
    kind: "technique",
    description: textValue("shared/capabilities", "capabilities.fivewhy.description"),
    when: textValue("shared/capabilities", "capabilities.fivewhy.when"),
    load: () => markdown("shared/capabilities/fivewhy"),
    standard: "motive",
  },
  logline: {
    id: "logline",
    label: textValue("shared/capabilities", "capabilities.logline.label"),
    kind: "technique",
    description: textValue("shared/capabilities", "capabilities.logline.description"),
    when: textValue("shared/capabilities", "capabilities.logline.when"),
    load: () => markdown("shared/capabilities/logline"),
    standard: "story",
  },
  "but-therefore": {
    id: "but-therefore",
    label: textValue("shared/capabilities", "capabilities.but-therefore.label"),
    kind: "technique",
    description: textValue("shared/capabilities", "capabilities.but-therefore.description"),
    when: textValue("shared/capabilities", "capabilities.but-therefore.when"),
    load: () => markdown("shared/capabilities/but-therefore"),
    standard: "scene",
  },
  hook: {
    id: "hook",
    label: textValue("shared/capabilities", "capabilities.hook.label"),
    kind: "technique",
    description: textValue("shared/capabilities", "capabilities.hook.description"),
    when: textValue("shared/capabilities", "capabilities.hook.when"),
    load: () => markdown("shared/capabilities/hook"),
    standard: "hook",
  },
  cool: {
    id: "cool",
    label: textValue("shared/capabilities", "capabilities.cool.label"),
    kind: "technique",
    description: textValue("shared/capabilities", "capabilities.cool.description"),
    when: textValue("shared/capabilities", "capabilities.cool.when"),
    load: () => markdown("shared/capabilities/cool"),
    standard: "beat",
  },
};

export const CAPABILITY_IDS = Object.keys(CAPABILITIES) as CapabilityId[];

export function capabilityInfos(): CapabilityInfo[] {
  return CAPABILITY_IDS.map((id) => {
    const { label, kind, description } = CAPABILITIES[id];
    return { id, label, kind, description };
  });
}

/** 某一类能力的 id，按登记顺序。按钮清单和主编清单的分组都从这里来，不另外手写名单 */
export function capabilityIdsOf(kind: CapabilityKind): CapabilityId[] {
  return CAPABILITY_IDS.filter((id) => CAPABILITIES[id].kind === kind);
}

export function isCapabilityId(v: unknown): v is CapabilityId {
  return typeof v === "string" && v in CAPABILITIES;
}

/** 给主编看的清单：一行一项，分工作流 / 技法两组，进系统提示和 load_capability 的参数说明 */
export function capabilityRoster(): string {
  const line = (id: CapabilityId) => {
    const c = CAPABILITIES[id];
    const fixes = c.standard ? textValue("shared/capabilities", "capabilities.message", { v0: STANDARDS[c.standard].label }) : "";
    return textValue("shared/capabilities", "capabilities.message_2", { v0: id, v1: c.label, v2: c.description, v3: c.when, v4: fixes });
  };
  const group = (kind: CapabilityKind) => capabilityIdsOf(kind).map(line).join("\n");
  return textValue("shared/capabilities", "capabilities.message_3", { v0: group("workflow"), v1: group("technique") });
}
