import { describe, expect, test } from "bun:test";
import { CAPABILITIES, capabilityIdsOf } from "@opentomato/core";
import type { CapabilityId, DocHeader } from "@opentomato/core/protocol";
import { stagePlan } from "../src/renderer/stage";

/**
 * 按钮清单不是第二份登记表：每一条工作流都得在某个阶段露出来，技法一条都不许露。
 * 登记表加了工作流忘了给按钮，或把技法挂成按钮，这里红。
 */

const doc = (kind: DocHeader["kind"], id: string, extra: Record<string, unknown> = {}): DocHeader => ({
  kind,
  id,
  path: `${kind}/${id}.md`,
  title: id,
  summary: "",
  keywords: [],
  status: "draft",
  extra,
});

const cards = [doc("characters", "陈默"), doc("world", "闵行")];
const outlinesNoChapters = [...cards, doc("milestones", "起步", { order: 1 }), doc("volumes", "1", { chapters: "1-3", milestones: ["起步"] })];
const outlined = [...outlinesNoChapters, doc("chapters", "1"), doc("chapters", "2"), doc("chapters", "3")];
const writing = [...outlined, doc("manuscript", "1")];
const volumeDone = [...outlined, doc("manuscript", "1"), doc("manuscript", "2"), doc("manuscript", "3")];

/** 各阶段代表性盘面：白纸、只有卡、大纲起了头、章纲排完、写到一半、一卷刚写完 */
const BOARDS: DocHeader[][] = [[], cards, outlinesNoChapters, outlined, writing, volumeDone];

function capsShown(): Set<CapabilityId> {
  const shown = new Set<CapabilityId>();
  for (const docs of BOARDS) for (const s of stagePlan(docs).steps) if (s.kind === "capability") shown.add(s.cap);
  return shown;
}

describe("阶段按钮与能力登记表对齐", () => {
  test("每条工作流都在某个阶段露出来", () => {
    const shown = capsShown();
    for (const id of capabilityIdsOf("workflow")) expect(shown.has(id)).toBe(true);
  });

  test("技法一条都不挂按钮", () => {
    const shown = capsShown();
    for (const id of capabilityIdsOf("technique")) expect(shown.has(id)).toBe(false);
  });

  test("按钮引用的每条能力在登记表里都是工作流", () => {
    for (const id of capsShown()) expect(CAPABILITIES[id].kind).toBe("workflow");
  });

  test("每个阶段恰有一个高亮的下一步", () => {
    for (const docs of BOARDS) expect(stagePlan(docs).steps.filter((s) => s.primary)).toHaveLength(1);
  });
});
