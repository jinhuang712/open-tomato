import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { asStringArray } from "../../project/frontmatter.js";
import { text, zhPath, type ToolContext } from "./shared.js";

/**
 * 全书的 open 清单：作者说「先放一放」的项散在各卡 frontmatter 里，越多越难追。
 * 这里把它们扫出来汇总，问下一步做什么、阶段收尾时都能看一眼欠着什么。
 */
export function makeListOpenTool(ctx: ToolContext): ToolDefinition {
  const { store } = ctx;
  return defineTool({
    name: "list_open",
    label: "搁置清单",
    description: "按文档汇总全书 frontmatter open 中的搁置事项，供回顾材料或安排后续工作时参考。",
    parameters: Type.Object({}),
    execute: async () => {
      const all = await store.listAll();
      const lines: string[] = [];
      for (const d of all) {
        const items = asStringArray(d.extra.open);
        if (items.length === 0) continue;
        lines.push(`- ${zhPath(d.kind, d.id)}：${items.join("、")}`);
      }
      if (lines.length === 0) return text("没有搁置的项，各卡的 open 都是空的。");
      return text(`搁置清单（${lines.length} 篇文档欠着）：\n${lines.join("\n")}`);
    },
  });
}
