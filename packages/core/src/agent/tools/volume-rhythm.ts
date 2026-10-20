import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "./define.js";
import { Type } from "typebox";
import { chapterRange } from "../../protocol.js";
import { PLACEHOLDER } from "../../project/check.js";
import { asStringArray, pickSection } from "../../project/frontmatter.js";
import { DOC_KINDS } from "../../project/kinds.js";
import { text, type ToolContext } from "./shared.js";

/** 节奏在卷里才看得见：每章多长、压还是放、推了几条线、有没有钩子，连续几章同一形状作者不用读就知道哪里平了 */
export function makeVolumeRhythmTool(ctx: ToolContext): ToolDefinition {
  const { store } = ctx;
  return defineTool({
    name: "volume_rhythm",
    label: "看一卷的节奏",
    description: "列出一卷每章的字数、推进的线索、章末钩子和压放（章纲 beat），并指出连续只压不放最长的一段，供结合正文判断节奏；相似的结构本身不代表有问题。",
    parameters: Type.Object({ volume: Type.String({ description: "卷号，直接给数字" }) }),
    execute: async (_id, params) => {
      const vid = DOC_KINDS.volumes.normalizeId(params.volume);
      const vol = await store.read("volumes", vid);
      if (!vol) throw new Error(`卷纲/${vid} 不存在`);
      const range = chapterRange(vol.extra.chapters);
      if (!range) return text(`卷纲/${vid} 的 chapters 字段没写成「1-30」这种区间，算不出节奏。`);
      const rows: string[] = ["| 章 | 字数 | 线索 | 钩子 | 压放 | 一句话 |", "|---|---|---|---|---|---|"];
      /** 连续只压不放最长的一段：[起章, 止章] */
      let run: [number, number] | null = null;
      let longest: [number, number] | null = null;
      for (let no = range[0]; no <= range[1]; no++) {
        const id = DOC_KINDS.chapters.normalizeId(String(no));
        const outline = await store.read("chapters", id);
        const ms = await store.read("manuscript", id);
        if (!outline && !ms) continue;
        const words = ms ? (Number(ms.extra.words) > 0 ? Number(ms.extra.words) : ms.body.replace(/\s/g, "").length) : 0;
        const threads = outline ? asStringArray(outline.extra.threads) : [];
        const hook = outline ? (pickSection(outline.body, "章末钩子") ?? "").trim() : "";
        const hookMark = !outline ? "无章纲" : !hook || hook.includes(PLACEHOLDER) ? "空" : "有";
        const beat = outline ? String(outline.extra.beat ?? "").trim() || "未标" : "无章纲";
        run = beat === "压" ? [run?.[0] ?? no, no] : null;
        if (run && (!longest || run[1] - run[0] > longest[1] - longest[0])) longest = run;
        rows.push(`| ${no} | ${ms ? words : "未写"} | ${threads.join("、") || "无"} | ${hookMark} | ${beat} | ${(ms?.summary ?? outline?.summary ?? "").slice(0, 30)} |`);
      }
      if (longest && longest[1] > longest[0]) {
        rows.push("", `连续只压不放最长的一段：第 ${longest[0]}–${longest[1]} 章，共 ${longest[1] - longest[0] + 1} 章。`);
      }
      return text(rows.join("\n"));
    },
  });
}
