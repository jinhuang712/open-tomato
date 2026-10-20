import { text as textValue } from "../../text/load.js";
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
    label: textValue("tools/materials", "volume_rhythm.label"),
    description: textValue("tools/materials", "volume_rhythm.description"),
    parameters: Type.Object({ volume: Type.String({ description: textValue("tools/materials", "volume_rhythm.parameters.volume.description") }) }),
    execute: async (_id, params) => {
      const vid = DOC_KINDS.volumes.normalizeId(params.volume);
      const vol = await store.read("volumes", vid);
      if (!vol) throw new Error(textValue("messages/materials", "volume_rhythm.execute", { v0: vid }));
      const range = chapterRange(vol.extra.chapters);
      if (!range) return text(textValue("messages/materials", "volume_rhythm.execute_2", { v0: vid }));
      const rows: string[] = [textValue("messages/materials", "volume_rhythm.execute_3"), "|---|---|---|---|---|---|"];
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
        const hook = outline ? (pickSection(outline.body, textValue("messages/materials", "volume_rhythm.execute_4")) ?? "").trim() : "";
        const hookMark = !outline ? textValue("messages/materials", "volume_rhythm.execute_5") : !hook || hook.includes(PLACEHOLDER) ? "空" : "有";
        const beat = outline ? String(outline.extra.beat ?? "").trim() || "未标" : textValue("messages/materials", "volume_rhythm.execute_5");
        run = beat === "压" ? [run?.[0] ?? no, no] : null;
        if (run && (!longest || run[1] - run[0] > longest[1] - longest[0])) longest = run;
        rows.push(`| ${no} | ${ms ? words : "未写"} | ${threads.join("、") || "无"} | ${hookMark} | ${beat} | ${(ms?.summary ?? outline?.summary ?? "").slice(0, 30)} |`);
      }
      if (longest && longest[1] > longest[0]) {
        rows.push("", textValue("messages/materials", "volume_rhythm.execute_6", { v0: longest[0], v1: longest[1], v2: longest[1] - longest[0] + 1 }));
      }
      return text(rows.join("\n"));
    },
  });
}
