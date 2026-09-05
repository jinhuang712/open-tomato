import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { DOC_KIND_IDS, DOC_KINDS } from "../../project/kinds.js";
import { text, zhDir, type ToolContext } from "./shared.js";

export function makeProjectOverviewTool(ctx: ToolContext): ToolDefinition {
  const { store } = ctx;
  return defineTool({
    name: "project_overview",
    label: "项目盘面",
    description: "项目盘面：按 kind 分组列出所有文档的 id / title / status / summary。便宜，每轮开工先看这个定方向，再用 read_doc 精读需要的篇。落盘后广播的 docs.changed 已是最新全量，那时不用重调。",
    parameters: Type.Object({}),
    execute: async () => {
      const all = await store.listAll();
      if (all.length === 0) return text("项目是空的，还没有任何文档。");
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
