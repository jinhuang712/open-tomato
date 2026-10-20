import { markdown, text as textValue } from "../text/load.js";
import type { CapabilityId, CapabilityInfo, CapabilityKind } from "../protocol.js";
import { renderHost, type HostId } from "../text/host.js";
import { STANDARDS, type StandardId } from "./standards.js";

/**
 * 每项能力是一类工作的说明：写清目标、要交出什么、有哪些限制，不规定步骤。
 * 作者与主编共用同一份说明，具体怎么做，要看对话、材料和已有授权。
 */
export interface CapabilityDef extends CapabilityInfo {
  /** 什么时候该想到它：给主编的清单看，也给按钮的说明 */
  when: string;
  /** 加载正文：进主编的上下文 */
  load: (host?: HostId) => string;
  /** 技法修的是哪条标准：审稿意见标了这条标准，就想到这条技法 */
  standard?: StandardId;
}

export const CAPABILITIES: Record<CapabilityId, CapabilityDef> = {
  interview: {
    id: "interview",
    label: textValue("capabilities", "capabilities.interview.label"),
    kind: "workflow",
    description: textValue("capabilities", "capabilities.interview.description"),
    when: textValue("capabilities", "capabilities.interview.when"),
    load: (host = "app") => renderHost(markdown("capabilities/interview"), host),
  },
  seed: {
    id: "seed",
    label: textValue("capabilities", "capabilities.seed.label"),
    kind: "workflow",
    description: textValue("capabilities", "capabilities.seed.description"),
    when: textValue("capabilities", "capabilities.seed.when"),
    load: (host = "app") => renderHost(markdown("capabilities/seed"), host),
  },
  talk: {
    id: "talk",
    label: textValue("capabilities", "capabilities.talk.label"),
    kind: "workflow",
    description: textValue("capabilities", "capabilities.talk.description"),
    when: textValue("capabilities", "capabilities.talk.when"),
    load: (host = "app") => renderHost(markdown("capabilities/talk"), host),
  },
  design: {
    id: "design",
    label: textValue("capabilities", "capabilities.design.label"),
    kind: "workflow",
    description: textValue("capabilities", "capabilities.design.description"),
    when: textValue("capabilities", "capabilities.design.when"),
    load: (host = "app") => renderHost(markdown("capabilities/design"), host),
  },
  outline: {
    id: "outline",
    label: textValue("capabilities", "capabilities.outline.label"),
    kind: "workflow",
    description: textValue("capabilities", "capabilities.outline.description"),
    when: textValue("capabilities", "capabilities.outline.when"),
    load: (host = "app") => renderHost(markdown("capabilities/outline"), host),
  },
  draft: {
    id: "draft",
    label: textValue("capabilities", "capabilities.draft.label"),
    kind: "workflow",
    description: textValue("capabilities", "capabilities.draft.description"),
    when: textValue("capabilities", "capabilities.draft.when"),
    load: (host = "app") => renderHost(markdown("capabilities/draft"), host),
  },
  review: {
    id: "review",
    label: textValue("capabilities", "capabilities.review.label"),
    kind: "workflow",
    description: textValue("capabilities", "capabilities.review.description"),
    when: textValue("capabilities", "capabilities.review.when"),
    load: (host = "app") => renderHost(markdown("capabilities/review"), host),
  },
  recap: {
    id: "recap",
    label: textValue("capabilities", "capabilities.recap.label"),
    kind: "workflow",
    description: textValue("capabilities", "capabilities.recap.description"),
    when: textValue("capabilities", "capabilities.recap.when"),
    load: (host = "app") => renderHost(markdown("capabilities/recap"), host),
  },
  pitch: {
    id: "pitch",
    label: textValue("capabilities", "capabilities.pitch.label"),
    kind: "workflow",
    description: textValue("capabilities", "capabilities.pitch.description"),
    when: textValue("capabilities", "capabilities.pitch.when"),
    load: (host = "app") => renderHost(markdown("capabilities/pitch"), host),
  },
  "deeper-needs": {
    id: "deeper-needs",
    label: textValue("capabilities", "capabilities.deeper-needs.label"),
    kind: "technique",
    description: textValue("capabilities", "capabilities.deeper-needs.description"),
    when: textValue("capabilities", "capabilities.deeper-needs.when"),
    load: (host = "app") => renderHost(markdown("capabilities/deeper-needs"), host),
    standard: "motive",
  },
  show: {
    id: "show",
    label: textValue("capabilities", "capabilities.show.label"),
    kind: "technique",
    description: textValue("capabilities", "capabilities.show.description"),
    when: textValue("capabilities", "capabilities.show.when"),
    load: (host = "app") => renderHost(markdown("capabilities/show"), host),
    standard: "show",
  },
  fivewhy: {
    id: "fivewhy",
    label: textValue("capabilities", "capabilities.fivewhy.label"),
    kind: "technique",
    description: textValue("capabilities", "capabilities.fivewhy.description"),
    when: textValue("capabilities", "capabilities.fivewhy.when"),
    load: (host = "app") => renderHost(markdown("capabilities/fivewhy"), host),
    standard: "motive",
  },
  logline: {
    id: "logline",
    label: textValue("capabilities", "capabilities.logline.label"),
    kind: "technique",
    description: textValue("capabilities", "capabilities.logline.description"),
    when: textValue("capabilities", "capabilities.logline.when"),
    load: (host = "app") => renderHost(markdown("capabilities/logline"), host),
    standard: "story",
  },
  "but-therefore": {
    id: "but-therefore",
    label: textValue("capabilities", "capabilities.but-therefore.label"),
    kind: "technique",
    description: textValue("capabilities", "capabilities.but-therefore.description"),
    when: textValue("capabilities", "capabilities.but-therefore.when"),
    load: (host = "app") => renderHost(markdown("capabilities/but-therefore"), host),
    standard: "scene",
  },
  hook: {
    id: "hook",
    label: textValue("capabilities", "capabilities.hook.label"),
    kind: "technique",
    description: textValue("capabilities", "capabilities.hook.description"),
    when: textValue("capabilities", "capabilities.hook.when"),
    load: (host = "app") => renderHost(markdown("capabilities/hook"), host),
    standard: "hook",
  },
  cool: {
    id: "cool",
    label: textValue("capabilities", "capabilities.cool.label"),
    kind: "technique",
    description: textValue("capabilities", "capabilities.cool.description"),
    when: textValue("capabilities", "capabilities.cool.when"),
    load: (host = "app") => renderHost(markdown("capabilities/cool"), host),
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
    const fixes = c.standard ? textValue("capabilities", "capabilities.message", { v0: STANDARDS[c.standard].label }) : "";
    return textValue("capabilities", "capabilities.message_2", { v0: id, v1: c.label, v2: c.description, v3: c.when, v4: fixes });
  };
  const group = (kind: CapabilityKind) => capabilityIdsOf(kind).map(line).join("\n");
  return textValue("capabilities", "capabilities.message_3", { v0: group("workflow"), v1: group("technique") });
}

/** 主编加载一项能力时收到的正文：说明由谁发起，正文原样提供 */
export function capabilityEntry(id: CapabilityId, by: "author" | "lead", host: HostId = "app"): string {
  const c = CAPABILITIES[id];
  const head = by === "author" ? textValue("capabilities", "capabilities.message_4", { v0: c.label }) : textValue("capabilities", "capabilities.message_5", { v0: c.label });
  return `${head}\n\n${c.load(host)}`;
}
