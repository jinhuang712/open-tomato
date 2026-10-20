import { text as textValue } from "../../text/load.js";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "./define.js";
import { Type } from "typebox";
import { DOC_KIND_IDS, DOC_KINDS } from "../../project/kinds.js";
import { text, zhDir, type ToolContext } from "./shared.js";

export function makeProjectOverviewTool(ctx: ToolContext): ToolDefinition {
  const { store } = ctx;
  return defineTool({
    name: "project_overview",
    label: textValue("tools/materials", "project_overview.label"),
    description: textValue("tools/materials", "project_overview.description"),
    parameters: Type.Object({}),
    execute: async () => {
      const all = await store.listAll();
      if (all.length === 0) return text(textValue("messages/materials", "project_overview.execute"));
      const lines: string[] = [`项目：${store.info.name}`];
      for (const k of DOC_KIND_IDS) {
        const docs = all.filter((d) => d.kind === k);
        if (docs.length === 0) continue;
        lines.push("", DOC_KINDS[k].singleton ? `## ${zhDir(k)}` : `## ${DOC_KINDS[k].dir}/ ${docs.length} 篇`);
        for (const d of docs) lines.push(`- ${d.id} | ${d.title} | ${d.status} | ${d.summary}`);
      }
      return text(lines.join("\n"));
    },
  });
}
